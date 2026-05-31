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

from geometry_msgs.msg import PoseWithCovarianceStamped, Twist
from nav_msgs.msg import OccupancyGrid, Odometry
from sensor_msgs.msg import BatteryState, Imu, LaserScan
from std_msgs.msg import Bool, Int32, String

try:
    import tf2_ros
    _TF2 = True
except ImportError:
    _TF2 = False

try:
    from nav2_msgs.action import FollowWaypoints, NavigateToPose
    _NAV2 = True
except ImportError:
    _NAV2 = False

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

        # ── publishers ────────────────────────────────────────────────
        self._pub_cmd_vel     = self.create_publisher(Twist, '/cmd_vel', 10)
        self._pub_initialpose = self.create_publisher(
            PoseWithCovarianceStamped, '/initialpose', _LATCHED_QOS
        )

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
        q = msg.pose.pose.orientation
        with self._lock:
            self._pose = {
                'x':   round(msg.pose.pose.position.x, 4),
                'y':   round(msg.pose.pose.position.y, 4),
                'yaw': round(_quat_to_yaw(q.x, q.y, q.z, q.w), 4),
            }
            self._speed = {
                'vx': round(msg.twist.twist.linear.x,  4),
                'vy': round(msg.twist.twist.linear.y,  4),
                'wz': round(msg.twist.twist.angular.z, 4),
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
                'laser':          self._imu.get('status', 'ok'),
                'imu':            self._imu.get('status', 'ok'),
                'emergency_stop': self._battery.get('emergency_stop', False),
                'battery':        self._battery.get('battery', 0.0),
                'charge_flag':    self._battery.get('charge_flag', 0),
                'linear_speed':   self._speed.get('vx', 0.0),
                'angular_speed':  self._speed.get('wz', 0.0),
                'pose':           dict(self._pose),
            }

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

    def cancel_nav(self):
        with self._lock:
            handle = self._nav_goal_handle
        if handle:
            handle.cancel_goal_async()
        with self._lock:
            self._nav_state       = 'cancelled'
            self._nav_goal_handle = None

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
            if status == 4:
                self._nav_state = 'succeeded'
            elif status == 5:
                self._nav_state = 'cancelled'
            else:
                self._nav_state = 'failed'
            self._nav_goal_handle = None

    # ── in-memory CRUD ───────────────────────────────────────────────

    def update_settings(self, updates: dict):
        with self._lock:
            self._settings.update(updates)

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

    def set_special_areas(self, areas: list):
        with self._lock:
            self._special_areas = {a['id']: a for a in areas}

    def delete_special_area(self, area_id: str) -> bool:
        with self._lock:
            return self._special_areas.pop(area_id, None) is not None


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
