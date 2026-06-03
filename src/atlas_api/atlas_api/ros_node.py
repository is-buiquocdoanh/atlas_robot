"""
AtlasROSNode — ROS 2 bridge for the Atlas API server.

Maintains a thread-safe snapshot of the robot's state by subscribing to
relevant topics.  Action clients for Nav2 are used to send navigation goals.
All public getters return copies; callers never hold the internal lock.
"""
from __future__ import annotations

import math
import threading
from typing import Optional

import rclpy
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from rclpy.time import Time as RclpyTime
from rcl_interfaces.srv import SetParameters
from rcl_interfaces.msg import Parameter, ParameterValue, ParameterType

from geometry_msgs.msg import PoseWithCovarianceStamped, Twist
from nav_msgs.msg import OccupancyGrid, Odometry, Path
from sensor_msgs.msg import BatteryState, Imu, LaserScan
from std_msgs.msg import Bool, Int32, String

try:
    import tf2_ros
    _TF2 = True
except ImportError:
    _TF2 = False

try:
    from nav2_msgs.action import FollowWaypoints, NavigateToPose
    from nav2_msgs.msg import CostmapFilterInfo
    _NAV2 = True
except ImportError:
    _NAV2 = False

try:
    from slam_toolbox.srv import SerializePoseGraph as _SerializePoseGraph
    _SLAM_SRV = True
except ImportError:
    _SLAM_SRV = False

# ──────────────────────────────────────────────────────────────────────────────
_DEFAULT_SETTINGS: dict = {
    'max_speed':         0.7,
    'min_speed':         0.1,
    'inflation_radius':  0.35,
    'robot_radius':      0.3,
    'xy_goal_tolerance': 0.2,
    'yaw_goal_tolerance': 0.2,
    'language':          'en',
}

_LATCHED_QOS = QoSProfile(
    depth=1,
    durability=DurabilityPolicy.TRANSIENT_LOCAL,
    reliability=ReliabilityPolicy.RELIABLE,
)


# ──────────────────────────────────────────────────────────────────────────────
class AtlasROSNode(Node):

    def __init__(self):
        super().__init__('atlas_api_node')

        self._lock = threading.Lock()

        # ── in-memory stores ──────────────────────────────────────────
        self._waypoints:     dict[str, dict] = {}
        self._routes:        dict[str, dict] = {}
        self._virtual_walls: list            = []
        self._special_areas: dict[str, dict] = {}
        self._settings:      dict            = dict(_DEFAULT_SETTINGS)

        # ── sensor state (updated by callbacks) ──────────────────────
        self._pose    = {'x': 0.0, 'y': 0.0, 'yaw': 0.0}
        self._speed   = {'vx': 0.0, 'vy': 0.0, 'wz': 0.0}
        self._imu     = {
            'status': 'ok',
            'acceleration': {'x': 0.0, 'y': 0.0, 'z': 9.81},
            'gyroscope':    {'x': 0.0, 'y': 0.0, 'z': 0.0},
        }
        self._battery = {
            'battery':       0.0,
            'voltage':       0.0,
            'charge_flag':   0,
            'emergency_stop': False,
        }
        self._laser     = {'coordinates': []}
        self._map_meta  = None          # dict | None
        self._map_data  = None          # bytes | None
        self._version   = 'ATLAS-v1.0.0'
        self._mode      = 2             # 1=mapping, 2=nav, 3=incremental
        self._power_on  = False

        # ── navigation state ─────────────────────────────────────────
        self._nav_state        = 'idle'   # idle|navigating|succeeded|failed|cancelled
        self._nav_current_goal = None
        self._nav_goal_handle  = None
        self._nav_path         = []       # [[x,y], …] global plan from /plan
        self._next_goal        = None     # {x,y,yaw} queued for after current goal succeeds

        # TF2 pose flag: True once map→base_link is available
        self._tf2_pose_ok = False

        # Cache for set_parameters service clients (node_name → client)
        self._param_clients: dict = {}

        # slam_toolbox serialize service client (for saving posegraph + data)
        if _SLAM_SRV:
            self._slam_serialize_client = self.create_client(
                _SerializePoseGraph, '/slam_toolbox/serialize_map')
        else:
            self._slam_serialize_client = None

        # ── subscriptions ─────────────────────────────────────────────
        sens = QoSProfile(depth=10)
        self.create_subscription(Odometry,     '/atlas/odom',            self._cb_odom,    sens)
        self.create_subscription(Imu,          '/atlas/imu',             self._cb_imu,     10)
        self.create_subscription(BatteryState, '/atlas/battery',         self._cb_battery, 10)
        self.create_subscription(Bool,         '/atlas/emergency_stop',  self._cb_estop,   10)
        self.create_subscription(String,       '/atlas/version',         self._cb_version, 1)
        self.create_subscription(Int32,        '/atlas/power_status',    self._cb_power,   10)
        self.create_subscription(OccupancyGrid,'/map',                   self._cb_map,     _LATCHED_QOS)
        self.create_subscription(LaserScan,    '/atlas/scan_filtered',   self._cb_laser,   sens)
        # Nav2 global plan — published when a new plan is computed
        self.create_subscription(Path, '/plan', self._cb_plan, sens)

        # ── TF2 pose timer ────────────────────────────────────────────
        # Reads map→base_link transform at 10 Hz.
        # Works transparently for both slam_toolbox and AMCL because both
        # localization systems update the map→odom TF transform.
        #
        # To switch localization backend:
        #   • slam_toolbox: enable start_localization_slam_toolbox_node in
        #     a1_map_server.launch.py  (no change needed here)
        #   • AMCL:         enable amcl node in a1_map_server.launch.py
        #     (no change needed here; AMCL also publishes /amcl_pose if needed)
        #
        # Frame names follow a1_localization.yaml:
        #   map_frame = "map"    base_frame = "base_link"
        if _TF2:
            self.create_timer(0.1, self._cb_tf_pose)   # 10 Hz

        # ── publishers ────────────────────────────────────────────────
        self._pub_cmd_vel     = self.create_publisher(Twist, '/cmd_vel', 10)
        self._pub_initialpose = self.create_publisher(
            PoseWithCovarianceStamped, '/initialpose', _LATCHED_QOS
        )
        # Costmap filter masks (virtual wall → keepout, special area → speed)
        # Latched so nav2 receives them even after a late (re)start.
        self._pub_keepout_mask = self.create_publisher(
            OccupancyGrid, '/keepout_filter_mask', _LATCHED_QOS)
        self._pub_speed_mask   = self.create_publisher(
            OccupancyGrid, '/speed_filter_mask',   _LATCHED_QOS)
        if _NAV2:
            self._pub_keepout_info = self.create_publisher(
                CostmapFilterInfo, '/keepout_filter_info', _LATCHED_QOS)
            self._pub_speed_info   = self.create_publisher(
                CostmapFilterInfo, '/speed_filter_info',   _LATCHED_QOS)
        else:
            self._pub_keepout_info = None
            self._pub_speed_info   = None

        # ── TF2 ──────────────────────────────────────────────────────
        if _TF2:
            self._tf_buffer   = tf2_ros.Buffer()
            self._tf_listener = tf2_ros.TransformListener(self._tf_buffer, self)

        # ── Nav2 action clients ───────────────────────────────────────
        if _NAV2:
            self._nav_client   = ActionClient(self, NavigateToPose,  '/navigate_to_pose')
            self._route_client = ActionClient(self, FollowWaypoints, '/follow_waypoints')
        else:
            self._nav_client   = None
            self._route_client = None
            self.get_logger().warn('nav2_msgs unavailable — navigation actions disabled')

        self.get_logger().info('AtlasROSNode ready  (nav2=%s  tf2=%s)' % (_NAV2, _TF2))

    # ══════════════════════════════════════════════════════════════════
    # Subscription callbacks
    # ══════════════════════════════════════════════════════════════════

    def _cb_odom(self, msg: Odometry):
        with self._lock:
            # Always update velocity from odometry
            self._speed = {
                'vx': round(msg.twist.twist.linear.x,  4),
                'vy': round(msg.twist.twist.linear.y,  4),
                'wz': round(msg.twist.twist.angular.z, 4),
            }
            # Use odometry for pose ONLY as fallback before TF2 is ready.
            # Once TF2 (map→base_link) is available it takes over as the
            # authoritative source, which reflects relocate/AMCL/slam_toolbox.
            if not self._tf2_pose_ok:
                q = msg.pose.pose.orientation
                self._pose = {
                    'x':   round(msg.pose.pose.position.x, 4),
                    'y':   round(msg.pose.pose.position.y, 4),
                    'yaw': round(_quat_to_yaw(q.x, q.y, q.z, q.w), 4),
                }

    def _cb_imu(self, msg: Imu):
        with self._lock:
            self._imu = {
                'status': 'ok',
                'acceleration': {
                    'x': round(msg.linear_acceleration.x, 4),
                    'y': round(msg.linear_acceleration.y, 4),
                    'z': round(msg.linear_acceleration.z, 4),
                },
                'gyroscope': {
                    'x': round(msg.angular_velocity.x, 6),
                    'y': round(msg.angular_velocity.y, 6),
                    'z': round(msg.angular_velocity.z, 6),
                },
            }

    def _cb_battery(self, msg: BatteryState):
        charge_map = {
            BatteryState.POWER_SUPPLY_STATUS_CHARGING:     2,
            BatteryState.POWER_SUPPLY_STATUS_DISCHARGING:  0,
            BatteryState.POWER_SUPPLY_STATUS_NOT_CHARGING: 0,
            BatteryState.POWER_SUPPLY_STATUS_FULL:         1,
        }
        with self._lock:
            self._battery['battery']     = round(msg.percentage * 100, 1)
            self._battery['voltage']     = round(msg.voltage, 2)
            self._battery['charge_flag'] = charge_map.get(msg.power_supply_status, 0)

    def _cb_estop(self, msg: Bool):
        with self._lock:
            self._battery['emergency_stop'] = bool(msg.data)

    def _cb_version(self, msg: String):
        with self._lock:
            self._version = msg.data

    def _cb_power(self, msg: Int32):
        with self._lock:
            self._power_on = bool(msg.data)

    def _cb_map(self, msg: OccupancyGrid):
        with self._lock:
            self._map_meta = {
                'width':      msg.info.width,
                'height':     msg.info.height,
                'resolution': msg.info.resolution,
                'origin': {
                    'x':   round(msg.info.origin.position.x, 4),
                    'y':   round(msg.info.origin.position.y, 4),
                    'yaw': round(_quat_to_yaw(
                        msg.info.origin.orientation.x,
                        msg.info.origin.orientation.y,
                        msg.info.origin.orientation.z,
                        msg.info.origin.orientation.w,
                    ), 4),
                },
            }
            self._map_data = bytes(msg.data)
        # Republish filter masks now that we have map metadata
        self._publish_costmap_filters()

    def _cb_laser(self, msg: LaserScan):
        scale = 1.0 / msg.info_resolution if hasattr(msg, 'info_resolution') else 20.0
        pts, angle = [], msg.angle_min
        for r in msg.ranges:
            if msg.range_min < r < msg.range_max:
                pts.append([
                    int(r * math.cos(angle) * scale),
                    int(r * math.sin(angle) * scale),
                ])
            angle += msg.angle_increment
        with self._lock:
            self._laser = {'coordinates': pts[:500]}  # cap for JSON size

    def _cb_tf_pose(self):
        """10 Hz timer: read map→base_link from TF2 as the authoritative pose.
        Works for both slam_toolbox and AMCL without any config change.
        """
        if not _TF2:
            return
        try:
            t = self._tf_buffer.lookup_transform('map', 'base_link', RclpyTime())
            x   = t.transform.translation.x
            y   = t.transform.translation.y
            yaw = _quat_to_yaw(
                t.transform.rotation.x, t.transform.rotation.y,
                t.transform.rotation.z, t.transform.rotation.w,
            )
            with self._lock:
                self._pose = {'x': round(x, 4), 'y': round(y, 4), 'yaw': round(yaw, 4)}
                self._tf2_pose_ok = True
        except Exception:
            pass  # TF not ready yet; _cb_odom fallback is active

    def _cb_plan(self, msg: Path):
        """Store the nav2 global plan, decimated to ≤300 points for JSON efficiency."""
        poses = msg.poses
        step = max(1, len(poses) // 300)
        pts = [
            [round(p.pose.position.x, 3), round(p.pose.position.y, 3)]
            for p in poses[::step]
        ]
        with self._lock:
            self._nav_path = pts

    # ══════════════════════════════════════════════════════════════════
    # Thread-safe getters
    # ══════════════════════════════════════════════════════════════════

    def get_pose(self) -> dict:
        with self._lock:
            return dict(self._pose)

    def get_speed(self) -> dict:
        with self._lock:
            return dict(self._speed)

    def get_imu(self) -> dict:
        with self._lock:
            return dict(self._imu)

    def get_battery(self) -> dict:
        with self._lock:
            return dict(self._battery)

    def get_laser(self) -> dict:
        with self._lock:
            return {'coordinates': list(self._laser['coordinates'])}

    def get_version(self) -> str:
        with self._lock:
            return self._version

    def get_mode(self) -> int:
        with self._lock:
            return self._mode

    def get_status(self) -> dict:
        with self._lock:
            return {
                'mode':           self._mode,
                'nav_state':      self._nav_state,
                'laser':          self._imu.get('status', 'ok'),
                'imu':            self._imu.get('status', 'ok'),
                'emergency_stop': self._battery.get('emergency_stop', False),
                'battery':        self._battery.get('battery', 0.0),
                'charge_flag':    self._battery.get('charge_flag', 0),
                'linear_speed':   self._speed.get('vx', 0.0),
                'angular_speed':  self._speed.get('wz', 0.0),
                'pose':           dict(self._pose),
            }

    def get_nav_path(self) -> list:
        with self._lock:
            return list(self._nav_path)

    def get_map_meta(self) -> Optional[dict]:
        with self._lock:
            return dict(self._map_meta) if self._map_meta else None

    def get_map_raw(self) -> tuple[Optional[bytes], Optional[dict]]:
        with self._lock:
            return self._map_data, dict(self._map_meta) if self._map_meta else None

    def get_nav_status(self) -> dict:
        with self._lock:
            return {
                'state':        self._nav_state,
                'current_goal': self._nav_current_goal,
            }

    def get_settings(self) -> dict:
        with self._lock:
            return dict(self._settings)

    def get_waypoints(self) -> list:
        with self._lock:
            return list(self._waypoints.values())

    def get_routes(self) -> list:
        with self._lock:
            return list(self._routes.keys())

    def get_route(self, name: str = '') -> Optional[dict]:
        with self._lock:
            if name:
                return self._routes.get(name)
            return next(iter(self._routes.values()), None)

    def get_virtual_walls(self) -> list:
        with self._lock:
            return list(self._virtual_walls)

    def get_special_areas(self) -> list:
        with self._lock:
            return list(self._special_areas.values())

    # ══════════════════════════════════════════════════════════════════
    # Commands
    # ══════════════════════════════════════════════════════════════════

    def serialize_slam_map(self, path_base: str) -> tuple[bool, str]:
        """Call /slam_toolbox/serialize_map to save .posegraph + .data files.

        path_base: full path WITHOUT extension, e.g. /path/to/maps/foo/foo
        Returns (success: bool, message: str).
        Only works when slam_toolbox (mapping mode) is currently running.
        """
        import threading

        if not _SLAM_SRV or self._slam_serialize_client is None:
            return False, 'slam_toolbox srv not available'

        client = self._slam_serialize_client
        if not client.wait_for_service(timeout_sec=3.0):
            return False, '/slam_toolbox/serialize_map service not available (slam not running)'

        req = _SerializePoseGraph.Request()
        req.filename = path_base   # slam_toolbox appends .posegraph and .data

        done   = threading.Event()
        holder = [None]

        def _cb(future):
            holder[0] = future.result()
            done.set()

        future = client.call_async(req)
        future.add_done_callback(_cb)

        if not done.wait(timeout=20.0):
            return False, 'serialize_map timed out (map too large?)'

        res = holder[0]
        if res is None:
            return False, 'serialize_map returned no result'
        if res.result == 0:   # RESULT_SUCCESS
            return True, 'ok'
        return False, f'slam_toolbox serialize failed (code={res.result})'

    def set_mode(self, mode: int):
        with self._lock:
            self._mode = mode

    def publish_twist(self, vx: float, vy: float, wz: float):
        msg = Twist()
        msg.linear.x  = float(vx)
        msg.linear.y  = float(vy)
        msg.angular.z = float(wz)
        self._pub_cmd_vel.publish(msg)

    def publish_initialpose(self, x: float, y: float, yaw: float):
        msg = PoseWithCovarianceStamped()
        msg.header.stamp    = self.get_clock().now().to_msg()
        msg.header.frame_id = 'map'
        msg.pose.pose.position.x    = float(x)
        msg.pose.pose.position.y    = float(y)
        msg.pose.pose.orientation.z = math.sin(yaw / 2.0)
        msg.pose.pose.orientation.w = math.cos(yaw / 2.0)
        msg.pose.covariance[0]  = 0.25
        msg.pose.covariance[7]  = 0.25
        msg.pose.covariance[35] = 0.068
        self._pub_initialpose.publish(msg)

    def send_nav_goal(self, x: float, y: float, yaw: float) -> tuple[bool, str]:
        if not _NAV2 or self._nav_client is None:
            return False, 'nav2_msgs not available'
        if not self._nav_client.wait_for_server(timeout_sec=1.0):
            return False, 'navigate_to_pose action server not ready'

        goal = NavigateToPose.Goal()
        goal.pose.header.stamp    = self.get_clock().now().to_msg()
        goal.pose.header.frame_id = 'map'
        goal.pose.pose.position.x    = float(x)
        goal.pose.pose.position.y    = float(y)
        goal.pose.pose.orientation.z = math.sin(yaw / 2.0)
        goal.pose.pose.orientation.w = math.cos(yaw / 2.0)

        with self._lock:
            self._nav_state        = 'navigating'
            self._nav_current_goal = {'x': x, 'y': y, 'yaw': yaw}

        future = self._nav_client.send_goal_async(goal)
        future.add_done_callback(self._on_goal_accepted)
        return True, 'ok'

    def send_route_goal(self, waypoints: list) -> tuple[bool, str]:
        if not _NAV2 or self._route_client is None:
            return False, 'nav2_msgs not available'
        if not self._route_client.wait_for_server(timeout_sec=1.0):
            return False, 'follow_waypoints action server not ready'

        from geometry_msgs.msg import PoseStamped
        goal = FollowWaypoints.Goal()
        for wp in waypoints:
            pose = PoseStamped()
            pose.header.stamp    = self.get_clock().now().to_msg()
            pose.header.frame_id = 'map'
            pose.pose.position.x    = float(wp['x'])
            pose.pose.position.y    = float(wp['y'])
            yaw = float(wp.get('yaw', 0.0))
            pose.pose.orientation.z = math.sin(yaw / 2.0)
            pose.pose.orientation.w = math.cos(yaw / 2.0)
            goal.poses.append(pose)

        with self._lock:
            self._nav_state = 'navigating'

        future = self._route_client.send_goal_async(goal)
        future.add_done_callback(self._on_goal_accepted)
        return True, 'ok'

    def send_charge_sequence(self, approach_wp: dict, dock_wp: dict | None) -> tuple[bool, str]:
        """Approach charger, then automatically dock when approach succeeds."""
        ok, msg = self.send_nav_goal(
            approach_wp['x'], approach_wp['y'], approach_wp.get('yaw', 0.0))
        if not ok:
            return False, msg
        if dock_wp:
            with self._lock:
                self._next_goal = {'x': dock_wp['x'], 'y': dock_wp['y'],
                                   'yaw': dock_wp.get('yaw', 0.0)}
        return True, 'ok'

    def cancel_nav(self):
        with self._lock:
            handle = self._nav_goal_handle
            self._next_goal = None   # also cancel queued dock
        if handle:
            handle.cancel_goal_async()
        with self._lock:
            self._nav_state       = 'cancelled'
            self._nav_goal_handle = None
            self._nav_path        = []

    # -- action callbacks (called from executor thread) ---------------

    def _on_goal_accepted(self, future):
        handle = future.result()
        if not handle.accepted:
            with self._lock:
                self._nav_state = 'failed'
            return
        with self._lock:
            self._nav_goal_handle = handle
        handle.get_result_async().add_done_callback(self._on_goal_result)

    def _on_goal_result(self, future):
        status = future.result().status   # 4=SUCCEEDED 5=CANCELED 6=ABORTED
        with self._lock:
            next_goal = self._next_goal
            self._next_goal       = None
            self._nav_goal_handle = None
            self._nav_path        = []
            if status == 4:
                self._nav_state = 'succeeded'
            elif status == 5:
                self._nav_state = 'cancelled'
                next_goal = None   # don't chain after cancel
            else:
                self._nav_state = 'failed'
                next_goal = None

        # Auto-chain next goal (e.g. dock after approach)
        if next_goal:
            self.send_nav_goal(next_goal['x'], next_goal['y'], next_goal.get('yaw', 0.0))

    # ── in-memory CRUD ───────────────────────────────────────────────

    def update_settings(self, updates: dict):
        with self._lock:
            self._settings.update(updates)
        self._apply_settings_to_nav2()

    # ── Apply settings to running nav2 nodes ────────────────────────

    def _get_param_client(self, node_name: str):
        """Return cached SetParameters service client for the given node."""
        if node_name not in self._param_clients:
            self._param_clients[node_name] = self.create_client(
                SetParameters, f'/{node_name}/set_parameters')
        return self._param_clients[node_name]

    def _set_param(self, node_name: str, pname: str, value, ptype: int):
        """Send a single parameter change to a nav2 node (async, best-effort)."""
        client = self._get_param_client(node_name)
        if not client.wait_for_service(timeout_sec=0.4):
            self.get_logger().debug(
                f'settings: /{node_name}/set_parameters not available')
            return
        pv = ParameterValue(type=ptype)
        if ptype == ParameterType.PARAMETER_DOUBLE:
            pv.double_value = float(value)
        elif ptype == ParameterType.PARAMETER_DOUBLE_ARRAY:
            pv.double_array_value = [float(v) for v in value]
        req = SetParameters.Request()
        req.parameters = [Parameter(name=pname, value=pv)]
        client.call_async(req)   # fire-and-forget

    def _apply_settings_to_nav2(self):
        """Push _settings values to running nav2 nodes via set_parameters."""
        with self._lock:
            s = dict(self._settings)

        D  = ParameterType.PARAMETER_DOUBLE
        DA = ParameterType.PARAMETER_DOUBLE_ARRAY

        max_spd  = float(s.get('max_speed',         0.7))
        min_spd  = float(s.get('min_speed',         0.1))
        infl_r   = float(s.get('inflation_radius',  0.35))
        rob_r    = float(s.get('robot_radius',       0.3))
        xy_tol   = float(s.get('xy_goal_tolerance',  0.2))
        yaw_tol  = float(s.get('yaw_goal_tolerance', 0.2))

        changes = [
            # node                          param name                       value              type
            ('velocity_smoother',           'max_velocity',                  [max_spd,0.,2.], DA),
            ('velocity_smoother',           'min_velocity',                  [-max_spd,0.,-2.], DA),
            ('controller_server',           'FollowPath.vx_max',             max_spd,         D),
            ('controller_server',           'general_goal_checker.xy_goal_tolerance',  xy_tol,  D),
            ('controller_server',           'general_goal_checker.yaw_goal_tolerance', yaw_tol, D),
            ('local_costmap/local_costmap', 'inflation_layer.inflation_radius', infl_r,        D),
            ('global_costmap/global_costmap','inflation_layer.inflation_radius', infl_r,       D),
            ('local_costmap/local_costmap', 'robot_radius',                  rob_r,           D),
            ('global_costmap/global_costmap','robot_radius',                 rob_r,           D),
        ]

        for node_name, pname, val, ptype in changes:
            try:
                self._set_param(node_name, pname, val, ptype)
            except Exception as e:
                self.get_logger().warn(
                    f'settings apply [{node_name}/{pname}]: {e}')

    def upsert_waypoint(self, wp: dict):
        with self._lock:
            self._waypoints[wp['name']] = wp

    def delete_waypoint(self, name: str) -> bool:
        with self._lock:
            return self._waypoints.pop(name, None) is not None

    def upsert_route(self, route: dict):
        with self._lock:
            self._routes[route['name']] = route

    def delete_route(self, name: str) -> bool:
        with self._lock:
            return self._routes.pop(name, None) is not None

    def set_virtual_walls(self, walls: list):
        with self._lock:
            self._virtual_walls = list(walls)
        self._publish_costmap_filters()

    def set_special_areas(self, areas: list):
        with self._lock:
            self._special_areas = {a['id']: a for a in areas}
        self._publish_costmap_filters()

    def delete_special_area(self, area_id: str) -> bool:
        with self._lock:
            return self._special_areas.pop(area_id, None) is not None


    # ── Costmap filter publishing ────────────────────────────────────

    def _publish_costmap_filters(self):
        """Rasterize virtual walls + special areas onto OccupancyGrid masks
        and publish them so nav2 KeepoutFilter / SpeedFilter can use them."""
        with self._lock:
            meta   = self._map_meta
            walls  = list(self._virtual_walls)
            areas  = list(self._special_areas.values())
            max_spd = self._settings.get('max_speed', 0.7)

        if meta is None:
            return  # map not loaded yet

        W   = meta['width']
        H   = meta['height']
        res = meta['resolution']
        ox  = meta['origin']['x']
        oy  = meta['origin']['y']
        now = self.get_clock().now().to_msg()

        # ── keepout mask: virtual walls + forbidden areas ─────────────
        keepout = [0] * (W * H)
        for wall in walls:
            pts = wall.get('points', [])
            for i in range(len(pts) - 1):
                _raster_line(keepout, W, H, res, ox, oy,
                             pts[i]['x'], pts[i]['y'],
                             pts[i+1]['x'], pts[i+1]['y'], 100)
        for area in areas:
            if area.get('type') == 'forbidden':
                _raster_polygon(keepout, W, H, res, ox, oy,
                                area.get('polygon', []), 100)

        # ── speed mask: slow / trigger areas (percent of max_speed) ──
        speed = [0] * (W * H)
        for area in areas:
            if area.get('type') in ('slow', 'trigger'):
                pct = max(1, min(99, int(area.get('speed', 0.3) / max_spd * 100)))
                _raster_polygon(speed, W, H, res, ox, oy,
                                area.get('polygon', []), pct)

        def _make_grid(data):
            g = OccupancyGrid()
            g.header.stamp    = now
            g.header.frame_id = 'map'
            g.info.resolution = res
            g.info.width      = W
            g.info.height     = H
            g.info.origin.position.x    = ox
            g.info.origin.position.y    = oy
            g.info.origin.orientation.w = 1.0
            g.data = data
            return g

        self._pub_keepout_mask.publish(_make_grid(keepout))
        self._pub_speed_mask.publish(_make_grid(speed))

        if _NAV2 and self._pub_keepout_info is not None:
            ki = CostmapFilterInfo()
            ki.header.stamp    = now
            ki.header.frame_id = 'map'
            ki.type            = 0       # KEEPOUT_FILTER
            ki.filter_mask_topic = '/keepout_filter_mask'
            ki.base            = 0.0
            ki.multiplier      = 1.0
            self._pub_keepout_info.publish(ki)

            si = CostmapFilterInfo()
            si.header.stamp    = now
            si.header.frame_id = 'map'
            si.type            = 1       # SPEED_FILTER_PERCENT
            si.filter_mask_topic = '/speed_filter_mask'
            si.base            = 0.0
            si.multiplier      = 1.0
            self._pub_speed_info.publish(si)


# ──────────────────────────────────────────────────────────────────────────────
# Rasterization helpers (module-level for clarity)
# ──────────────────────────────────────────────────────────────────────────────

def _w2g(wx: float, wy: float, res: float, ox: float, oy: float):
    """World → grid cell (col, row)."""
    return int((wx - ox) / res), int((wy - oy) / res)


def _raster_line(data, W, H, res, ox, oy, x0w, y0w, x1w, y1w, val, thick=2):
    """Bresenham line on grid; thick=cell radius for wall visibility."""
    gx0, gy0 = _w2g(x0w, y0w, res, ox, oy)
    gx1, gy1 = _w2g(x1w, y1w, res, ox, oy)
    for dx in range(-thick, thick + 1):
        for dy in range(-thick, thick + 1):
            _bresenham(data, W, H, gx0+dx, gy0+dy, gx1+dx, gy1+dy, val)


def _bresenham(data, W, H, x0, y0, x1, y1, val):
    dx = abs(x1-x0); dy = abs(y1-y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    while True:
        if 0 <= x0 < W and 0 <= y0 < H:
            data[y0 * W + x0] = val
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 > -dy: err -= dy; x0 += sx
        if e2 <  dx: err += dx; y0 += sy


def _raster_polygon(data, W, H, res, ox, oy, polygon, val):
    """Scanline fill for a polygon expressed in world coords."""
    if len(polygon) < 3:
        return
    pts = [_w2g(p['x'], p['y'], res, ox, oy) for p in polygon]
    xs  = [p[0] for p in pts]; ys = [p[1] for p in pts]
    y_lo = max(0, min(ys)); y_hi = min(H-1, max(ys))
    n = len(pts)
    for y in range(y_lo, y_hi + 1):
        xs_cross = []
        for i in range(n):
            ax, ay = pts[i]; bx, by = pts[(i+1) % n]
            if (ay <= y < by) or (by <= y < ay):
                t = (y - ay) / (by - ay)
                xs_cross.append(ax + t * (bx - ax))
        xs_cross.sort()
        for k in range(0, len(xs_cross) - 1, 2):
            for x in range(max(0, int(xs_cross[k])), min(W, int(xs_cross[k+1]) + 1)):
                data[y * W + x] = val


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _quat_to_yaw(x: float, y: float, z: float, w: float) -> float:
    siny = 2.0 * (w * z + x * y)
    cosy = 1.0 - 2.0 * (y * y + z * z)
    return math.atan2(siny, cosy)


# ──────────────────────────────────────────────────────────────────────────────
# Module-level singleton
# ──────────────────────────────────────────────────────────────────────────────

_node: Optional[AtlasROSNode] = None


def init_node() -> AtlasROSNode:
    global _node
    _node = AtlasROSNode()
    return _node


def get_node() -> AtlasROSNode:
    assert _node is not None, 'call init_node() first'
    return _node
