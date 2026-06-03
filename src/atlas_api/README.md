# atlas_api — Robot Backend API

**Author:** Bui Quoc Doanh  
**Contact:** roboticsvn.ai@gmail.com  
**Package:** `atlas_api`  
**ROS 2 Distribution:** Humble  

---

## 1. Tổng quan

`atlas_api` là lớp trung gian (middleware) kết nối hệ thống ROS 2 của robot với giao diện Web và các ứng dụng bên ngoài. Package cung cấp:

- **REST API** (port `8080`) — điều khiển robot, quản lý bản đồ, waypoint, route, cài đặt
- **WebSocket** (port `9090`) — push trạng thái robot real-time đến client (~5 Hz)
- **LaunchManager** — tự động khởi động/tắt các stack nav2 / slam_toolbox theo chế độ hoạt động
- **ROS Node** — subscribe/publish topic, gọi Nav2 action, đọc TF2

Package này **độc lập với phần cứng robot** — chỉ cần các topic ROS 2 chuẩn được định nghĩa bên dưới.

---

## 2. Kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│                      atlas_api                          │
│                                                         │
│  Thread: atlas-ros  ──  rclpy MultiThreadedExecutor    │
│            │                                            │
│            ▼                                            │
│  AtlasROSNode  ←── subscribe: /atlas/odom, /map, …    │
│            │       publish:  /cmd_vel, /initialpose, … │
│            │       action:   /navigate_to_pose          │
│            │                                            │
│  Thread: atlas-ws  ──  asyncio WebSocket  :9090        │
│  Thread: atlas-bc  ──  broadcast loop  5 Hz            │
│  Main thread       ──  Flask REST API  :8080            │
└─────────────────────────────────────────────────────────┘
```

### Luồng hoạt động

```
Khởi động main()
    │
    ├─► Đọc env ATLAS_ROBOT ('sim' | 'real')
    ├─► init_node()          → tạo AtlasROSNode, subscribe topics
    ├─► init_launch_manager() → khởi tạo LaunchManager với robot_type
    ├─► executor.spin()      → bắt đầu xử lý ROS callbacks (thread riêng)
    ├─► ws_server.start()    → WebSocket server (thread riêng)
    ├─► broadcast_loop()     → gửi status 5 Hz qua WS (thread riêng)
    └─► app.run()            → Flask REST API (main thread, blocking)
```

---

## 3. Đầu vào ROS 2

### 3.1 Topics Subscribe

| Topic | Message Type | Mô tả |
|-------|-------------|-------|
| `/atlas/odom` | `nav_msgs/Odometry` | Odometry — cập nhật speed, fallback pose khi TF2 chưa sẵn sàng |
| `/atlas/imu` | `sensor_msgs/Imu` | Dữ liệu IMU (acceleration, gyroscope) |
| `/atlas/battery` | `sensor_msgs/BatteryState` | Phần trăm pin, voltage, trạng thái sạc |
| `/atlas/emergency_stop` | `std_msgs/Bool` | Tín hiệu dừng khẩn cấp |
| `/atlas/version` | `std_msgs/String` | Chuỗi phiên bản firmware robot |
| `/atlas/power_status` | `std_msgs/Int32` | Trạng thái nguồn (0=off, 1=on) |
| `/map` | `nav_msgs/OccupancyGrid` | Bản đồ từ map_server (QoS: TRANSIENT_LOCAL) |
| `/atlas/scan_filtered` | `sensor_msgs/LaserScan` | Dữ liệu LiDAR đã lọc |
| `/plan` | `nav_msgs/Path` | Global path từ Nav2 planner |

> **Lưu ý tên topic:** Tất cả topic robot đều có namespace `/atlas/`. Khi áp dụng cho robot khác, cần remap trong launch file hoặc thay đổi tên trong `ros_node.py`.

### 3.2 Topics Publish

| Topic | Message Type | Mô tả |
|-------|-------------|-------|
| `/cmd_vel` | `geometry_msgs/Twist` | Lệnh vận tốc điều khiển trực tiếp |
| `/initialpose` | `geometry_msgs/PoseWithCovarianceStamped` | Đặt vị trí ban đầu cho AMCL/slam_toolbox (QoS: TRANSIENT_LOCAL) |
| `/keepout_filter_mask` | `nav_msgs/OccupancyGrid` | Mặt nạ vùng cấm (virtual walls + forbidden areas) |
| `/speed_filter_mask` | `nav_msgs/OccupancyGrid` | Mặt nạ vùng giảm tốc |
| `/keepout_filter_info` | `nav2_msgs/CostmapFilterInfo` | Metadata cho KeepoutFilter |
| `/speed_filter_info` | `nav2_msgs/CostmapFilterInfo` | Metadata cho SpeedFilter |

### 3.3 TF2 Frames

| Transform | Mô tả |
|-----------|-------|
| `map` → `base_link` | Pose robot trong bản đồ — đọc ở 10 Hz, ưu tiên hơn odometry |

> TF2 hoạt động tự động với cả **slam_toolbox** và **AMCL** (cả hai đều publish transform `map → odom`).

### 3.4 Nav2 Action Clients

| Action Server | Type | Mô tả |
|--------------|------|-------|
| `/navigate_to_pose` | `nav2_msgs/action/NavigateToPose` | Di chuyển robot đến một điểm |
| `/follow_waypoints` | `nav2_msgs/action/FollowWaypoints` | Thực thi route qua nhiều điểm |

### 3.5 Services

| Service | Type | Mô tả |
|---------|------|-------|
| `/slam_toolbox/serialize_map` | `slam_toolbox/srv/SerializePoseGraph` | Lưu posegraph khi đang mapping |

---

## 4. REST API

Base URL: `http://<host>:8080`  
CORS: cho phép tất cả origins (`*`)

### 4.1 System

| Method | Endpoint | Body | Mô tả |
|--------|----------|------|-------|
| GET | `/atlas/status` | — | Trạng thái tổng hợp robot |
| GET | `/atlas/mode` | — | Chế độ hiện tại (0/1/2/3) |
| POST | `/atlas/mode` | `{"mode": 0-3, "map": "<name>"}` | Đổi chế độ hoạt động |
| GET | `/atlas/launch/status` | — | Trạng thái các process launch |
| GET | `/atlas/version` | — | Phiên bản firmware |
| GET | `/atlas/hostname` | — | Hostname máy tính robot |

**Chế độ (mode):**

| Giá trị | Tên | Hành động |
|---------|-----|----------|
| `0` | Idle | Tắt tất cả (slam + nav) |
| `1` | Mapping | Khởi động `a1_slam_toolbox_<robot>.launch.py` (tạo bản đồ mới) |
| `2` | Navigation | Khởi động `a1_map_server_<robot>.launch.py` + `a1_navigation_<robot>.launch.py` |
| `3` | Incremental Mapping | Khởi động slam_toolbox với posegraph có sẵn (mở rộng bản đồ cũ) |

### 4.2 Chassis

| Method | Endpoint | Body | Mô tả |
|--------|----------|------|-------|
| GET | `/atlas/chassis/pose` | — | `{x, y, yaw}` trong frame map |
| GET | `/atlas/chassis/speed` | — | `{vx, vy, wz}` (m/s, rad/s) |
| GET | `/atlas/chassis/imu` | — | Acceleration + gyroscope |
| GET | `/atlas/chassis/battery` | — | Pin, voltage, charge_flag |
| GET | `/atlas/chassis/laser` | — | Tọa độ điểm LiDAR (tối đa 500 điểm) |
| POST | `/atlas/chassis/move` | `{"vx":0.3,"vy":0,"wz":0}` | Gửi lệnh vận tốc (giới hạn ±2.0 m/s, ±3.5 rad/s) |
| POST | `/atlas/chassis/max_speed` | `{"speed":0.5}` | Đặt tốc độ tối đa (0.1–1.0 m/s) |

### 4.3 Navigation

| Method | Endpoint | Body | Mô tả |
|--------|----------|------|-------|
| GET | `/atlas/nav/status` | — | `{state, current_goal}` |
| POST | `/atlas/nav/goal` | `{"x":1.0,"y":2.0,"yaw":0.0}` | Đặt mục tiêu theo tọa độ |
| POST | `/atlas/nav/goal_name` | `{"name":"office"}` | Đặt mục tiêu theo tên waypoint |
| POST | `/atlas/nav/goal_list` | `[{x,y,yaw}, ...]` | Thực thi danh sách điểm |
| POST | `/atlas/nav/cancel` | — | Hủy điều hướng hiện tại |
| POST | `/atlas/nav/relocate` | `{"x":0.0,"y":0.0,"yaw":0.0}` | Đặt lại vị trí robot trên bản đồ |
| POST | `/atlas/nav/charge` | `{"name":"charging_pile"}` | Tự động về trạm sạc (approach → dock) |
| POST | `/atlas/nav/charge_approach` | `{"name":"charging_pile"}` | Chỉ đến vị trí trước trạm sạc |
| POST | `/atlas/nav/charge_dock` | `{"name":"charging_pile"}` | Chỉ vào dock |

**Trạng thái nav:** `idle` → `navigating` → `succeeded` | `failed` | `cancelled`

### 4.4 Map

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/atlas/map` | Metadata bản đồ hiện tại + URL ảnh |
| GET | `/atlas/map/image` | Ảnh PNG bản đồ từ OccupancyGrid đang chạy |
| GET | `/atlas/map/current` | Bản đồ đang được chọn |
| GET | `/atlas/map/list` | Danh sách tất cả bản đồ đã lưu |
| POST | `/atlas/map/save` | `{"alias":"Floor 1"}` — lưu bản đồ hiện tại |
| POST | `/atlas/map/apply` | `{"name":"<id>"}` — chuyển sang bản đồ khác |
| POST | `/atlas/map/rename` | `{"name":"<id>","alias":"New name"}` |
| DELETE | `/atlas/map/<name>` | Xóa bản đồ |
| GET | `/atlas/map/export/<name>` | Tải file `.yaml` bản đồ |
| POST | `/atlas/map/import` | Upload file `.yaml` (multipart/form-data, field: `file`) |
| GET | `/atlas/map/thumbnail/<name>` | Ảnh thumbnail nhỏ (PNG, ≤200px) |
| GET | `/atlas/map/has_posegraph/<name>` | Kiểm tra có posegraph để incremental mapping không |

**Lưu trữ bản đồ:**
```
<workspace>/src/a1_maps/
└── <map_name>/
    ├── <map_name>.yaml       ← nav2_map_server
    ├── <map_name>.pgm        ← ảnh bản đồ
    ├── <map_name>.posegraph  ← slam_toolbox (nếu có)
    └── <map_name>.data       ← slam_toolbox (nếu có)
```
> Fallback: `~/.atlas/maps/` nếu không tìm thấy package `a1_maps`.

### 4.5 Waypoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/atlas/waypoints` | Danh sách waypoints |
| POST | `/atlas/waypoints` | `{"name":"A","type":"delivery","x":1,"y":2,"yaw":0}` |
| DELETE | `/atlas/waypoints/<name>` | Xóa waypoint |

**Loại waypoint:** `delivery`, `charging_pile`, `dock` (tuỳ định nghĩa)

### 4.6 Route

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/atlas/route/list` | Danh sách tên tất cả routes |
| POST | `/atlas/route` | `{"name":"p1","loop":true,"waypoints":["A","B","C"]}` |
| DELETE | `/atlas/route/<name>` | Xóa route |
| POST | `/atlas/route/start` | `{"name":"p1"}` — bắt đầu thực thi route |
| POST | `/atlas/route/stop` | Dừng route |

### 4.7 Virtual Wall & Special Area

| Method | Endpoint | Body | Mô tả |
|--------|----------|------|-------|
| GET/POST/DELETE | `/atlas/virtual_wall` | `{"walls":[{"id":"w1","points":[{"x":1,"y":2},…]}]}` | Tường ảo ngăn robot |
| GET/POST | `/atlas/special_area` | `{"areas":[{"id":"a1","type":"slow","speed":0.3,"polygon":[…]}]}` | Vùng đặc biệt |
| DELETE | `/atlas/special_area/<id>` | — | Xóa vùng |

**Loại special area:** `slow` (giảm tốc), `forbidden` (cấm), `trigger` (kích hoạt hành động)

Virtual walls và special areas được rasterize thành `OccupancyGrid` và publish cho Nav2 `KeepoutFilter` / `SpeedFilter`.

### 4.8 Settings

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/atlas/settings` | Lấy tất cả cài đặt |
| POST | `/atlas/settings` | Cập nhật một hoặc nhiều cài đặt |

**Các tham số settings:**

| Key | Mặc định | Đơn vị | Áp dụng đến |
|-----|---------|--------|------------|
| `max_speed` | `0.7` | m/s | `velocity_smoother`, `controller_server` |
| `min_speed` | `0.1` | m/s | velocity_smoother |
| `inflation_radius` | `0.35` | m | local/global costmap |
| `robot_radius` | `0.3` | m | local/global costmap |
| `xy_goal_tolerance` | `0.2` | m | controller_server |
| `yaw_goal_tolerance` | `0.2` | rad | controller_server |
| `language` | `"en"` | — | UI |

Thay đổi settings được apply trực tiếp vào Nav2 nodes qua `/set_parameters` service (không cần restart).

---

## 5. WebSocket

**URL:** `ws://<host>:9090`  
**Protocol:** JSON, one-way broadcast từ server → client

### Message type: `status` (5 Hz)

```json
{
  "type": "status",
  "mode": 2,
  "nav_state": "idle",
  "laser": "ok",
  "imu": "ok",
  "emergency_stop": false,
  "battery": 62.4,
  "charge_flag": 0,
  "linear_speed": 0.0,
  "angular_speed": 0.0,
  "pose": {"x": 1.23, "y": 4.56, "yaw": 0.78},
  "current_map": "Warehouse"
}
```

**charge_flag:** `0` = discharging, `1` = full, `2` = charging

---

## 6. Cấu hình

### 6.1 Biến môi trường

| Biến | Giá trị | Mặc định | Mô tả |
|------|---------|---------|-------|
| `ATLAS_ROBOT` | `sim` hoặc `real` | `real` | Quyết định launch file sim/real được dùng |

### 6.2 Launch Arguments

```bash
# Sim
ros2 launch atlas_api atlas_api_sim.launch.py

# Real
ros2 launch atlas_api atlas_api_real.launch.py

# Hoặc truyền env thủ công
ATLAS_ROBOT=sim ros2 run atlas_api atlas_api_node
```

### 6.3 ROS Parameters

| Parameter | Mặc định | Mô tả |
|-----------|---------|-------|
| `use_sim_time` | `false` (real) / `true` (sim) | Dùng đồng hồ simulation |

### 6.4 Ports

| Service | Port | Giao thức |
|---------|------|----------|
| REST API | `8080` | HTTP |
| WebSocket | `9090` | WS |

Thay đổi port trong `main.py` (`_REST_PORT`, `_WS_PORT`).

---

## 7. LaunchManager

LaunchManager quản lý vòng đời các ROS 2 launch process. Mỗi process chạy trong session riêng (`start_new_session=True`) → `os.killpg()` kill cả process group khi tắt.

```
Mode 0 (Idle)         → stop_all()
Mode 1 (Mapping)      → a1_slam_toolbox_{sim|real}.launch.py
Mode 2 (Navigation)   → a1_map_server_{sim|real}.launch.py
                      + a1_navigation_{sim|real}.launch.py
Mode 3 (Incremental)  → a1_slam_toolbox_{sim|real}.launch.py map_file:=<path>
```

---

## 8. Yêu cầu phụ thuộc

### Python packages
```
flask
websockets
rclpy
tf2_ros
nav2_msgs
slam_toolbox (optional)
```

### ROS 2 packages
```
nav2_map_server
nav2_amcl / slam_toolbox
nav2_planner, nav2_controller, nav2_bt_navigator
nav2_behaviors, nav2_smoother, nav2_velocity_smoother
nav2_collision_monitor, nav2_waypoint_follower
nav2_lifecycle_manager
```

---

## 9. Build & Chạy

```bash
# Build
cd ~/atlas_robot
colcon build --packages-select atlas_api
source install/setup.bash

# Chạy sim
ros2 launch atlas_api atlas_api_sim.launch.py

# Chạy real
ros2 launch atlas_api atlas_api_real.launch.py

# Kiểm tra API
curl http://localhost:8080/
curl http://localhost:8080/atlas/status
```

---

## 10. Hướng dẫn áp dụng cho robot khác

### 10.1 Thay topic

Trong [ros_node.py](atlas_api/ros_node.py), tìm và thay namespace `/atlas/` bằng namespace robot của bạn:

```python
# Ví dụ thay /atlas/odom → /my_robot/odom
self.create_subscription(Odometry, '/my_robot/odom', self._cb_odom, sens)
```

Hoặc dùng remapping trong launch file:

```python
Node(
    package='atlas_api',
    executable='atlas_api_node',
    remappings=[
        ('/atlas/odom',    '/my_robot/odom'),
        ('/atlas/battery', '/my_robot/battery'),
        ('/cmd_vel',       '/my_robot/cmd_vel'),
    ]
)
```

### 10.2 Thay LaunchManager

Trong [launch_manager.py](atlas_api/launch_manager.py), thay tên package và file launch:

```python
# Thay 'a1_slam' bằng package slam/nav của robot bạn
self._spawn('slam', ['ros2', 'launch', 'my_robot_slam',
                     f'mapping_{self._robot}.launch.py'])
```

### 10.3 Thay đường dẫn bản đồ

Trong [routes/map_api.py](atlas_api/routes/map_api.py), hàm `_resolve_maps_dir()`:

```python
# Thay 'a1_slam' và 'a1_maps' bằng package/thư mục của robot bạn
pkg_dir = get_package_share_directory('my_robot_slam')
d = os.path.join(ws_dir, 'src', 'my_robot_maps')
```

### 10.4 TF2 Frame Names

Trong `ros_node.py` hàm `_cb_tf_pose()`:

```python
# Thay 'map' và 'base_link' bằng frame names của robot bạn
t = self._tf_buffer.lookup_transform('map', 'base_footprint', RclpyTime())
```

---

## 11. Cấu trúc thư mục

```
atlas_api/
├── atlas_api/
│   ├── main.py           ← Entry point, thread layout
│   ├── app.py            ← Flask factory, blueprint registration
│   ├── ros_node.py       ← AtlasROSNode (subscriptions, publishers, actions)
│   ├── launch_manager.py ← Quản lý process launch (slam/nav/map_server)
│   ├── ws_server.py      ← WebSocket broadcast server
│   └── routes/
│       ├── system.py     ← /atlas/mode, /atlas/status
│       ├── chassis.py    ← /atlas/chassis/*
│       ├── navigation.py ← /atlas/nav/*
│       ├── map_api.py    ← /atlas/map/*
│       ├── waypoints.py  ← /atlas/waypoints
│       ├── route_api.py  ← /atlas/route/*
│       ├── layers.py     ← /atlas/virtual_wall, /atlas/special_area
│       ├── settings.py   ← /atlas/settings
│       └── upgrade.py    ← /atlas/upgrade
├── launch/
│   ├── atlas_api.launch.py      ← Launch gốc (có use_sim_time arg)
│   ├── atlas_api_sim.launch.py  ← Simulation (use_sim_time=true)
│   └── atlas_api_real.launch.py ← Real robot (use_sim_time=false)
└── README.md
```
