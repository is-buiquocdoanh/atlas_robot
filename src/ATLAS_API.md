# ATLAS SLAM WEB APIs

**Navigation Version:** ATLAS-v1.0.0  
**Base URL:** `http://{host}`  
**Content-Type:** `application/json`

---

## Glossary

| Term | Description |
|------|-------------|
| `host` | IP address of the robot's navigation system (e.g. `192.168.1.100`). Must be on the same LAN as the client. |
| `hostname` | Human-readable name of the navigation host |
| Navigation mode | Mode in which the robot executes navigation commands |
| Mapping mode | Mode in which the robot scans and builds a map |
| Incremental mapping | Extends an existing map without discarding it |
| Virtual wall | Line constraints drawn on the map to restrict robot movement |
| Special area | Polygon zones that trigger behaviours (e.g. speed change, action) |
| Waypoint | Named, calibrated pose (x, y, yaw) stored on the map |
| Route | Ordered list of waypoints for patrol/loop navigation |

---

## Response Convention

All endpoints return `application/json`.  
Success: `{"status": "success"}` or a data object.  
Error: `{"status": "error", "message": "..."}` with an appropriate HTTP status code.

---

## 1. System

### 1.1 Get navigation version

```
GET /atlas/version
```

**Response**
```json
{
  "version": "ATLAS-v1.0.0"
}
```

---

### 1.2 Get current mode

```
GET /atlas/mode
```

**Response**
```json
{
  "mode": 2
}
```

| Value | Mode |
|-------|------|
| `1` | Mapping mode |
| `2` | Navigation mode |
| `3` | Incremental mapping mode |

---

### 1.3 Set operating mode

```
POST /atlas/mode
```

**Body**
```json
{
  "mode": 1
}
```

**Response**
```json
{
  "status": "success"
}
```

> After switching to mapping mode (`mode=1` or `mode=3`), manually drive the robot to scan the environment, then call **Save Map** when done.  
> Before switching to incremental mapping (`mode=3`), ensure the robot is correctly localised to avoid map drift.

---

### 1.4 Get hostname

```
GET /atlas/hostname
```

**Response**
```json
{
  "hostname": "atlas-robot"
}
```

---

### 1.5 Get full system status

Returns a combined snapshot of the most commonly polled fields.

```
GET /atlas/status
```

**Response**
```json
{
  "mode": 2,
  "laser": "ok",
  "imu": "ok",
  "emergency_stop": false,
  "battery": 85,
  "charge_flag": 1,
  "linear_speed": 0.0,
  "angular_speed": 0.0,
  "pose": { "x": 1.2, "y": 3.4, "yaw": 0.97 }
}
```

---

## 2. Chassis

### 2.1 Get robot pose

Returns the current position and heading in the map frame.

```
GET /atlas/chassis/pose
```

**Response**
```json
{
  "x": 1.2,
  "y": 3.4,
  "yaw": 0.97
}
```

> `x`, `y` are in metres; `yaw` is in radians (−π to π).

---

### 2.2 Get current speed

```
GET /atlas/chassis/speed
```

**Response**
```json
{
  "vx": 0.3,
  "vy": 0.0,
  "vz": 0.0,
  "wz": 0.5
}
```

> `vx`, `vy`, `vz` are linear velocities (m/s); `wz` is angular velocity (rad/s).

---

### 2.3 Get IMU state

```
GET /atlas/chassis/imu
```

**Response**
```json
{
  "status": "ok",
  "acceleration": { "x": 0.01, "y": -0.02, "z": 9.81 },
  "gyroscope":    { "x": 0.0,  "y": 0.0,   "z": 0.0  }
}
```

> Returns `"status": "error"` when the IMU is faulty.

---

### 2.4 Get battery & power status

```
GET /atlas/chassis/battery
```

**Response**
```json
{
  "battery": 85,
  "charge_flag": 1,
  "emergency_stop": false,
  "voltage": 24.1
}
```

| `charge_flag` | Meaning |
|---------------|---------|
| `0` | Not charging |
| `1` | Idle / standby |
| `2` | Charging at charging pile |
| `3` | Adapter charging |
| `8` | Docking in progress |

| `emergency_stop` | Meaning |
|-----------------|---------|
| `false` | E-stop released (normal) |
| `true` | E-stop pressed (robot halted) |

---

### 2.5 Get laser scan data

Returns the current 2-D laser point cloud as pixel coordinates on the map.

```
GET /atlas/chassis/laser
```

**Response**
```json
{
  "coordinates": [
    [364, 166],
    [365, 167]
  ]
}
```

---

### 2.6 Manual velocity command

Directly drives the robot. Commands are one-shot; send `{"vx":0,"wz":0}` to stop.

```
POST /atlas/chassis/move
```

**Body**
```json
{
  "vx": 0.3,
  "vy": 0.0,
  "wz": 0.0
}
```

**Response**
```json
{
  "status": "success"
}
```

**Examples**

| Action | Body |
|--------|------|
| Forward 0.3 m/s | `{"vx": 0.3, "vy": 0.0, "wz": 0.0}` |
| Reverse 0.3 m/s | `{"vx": -0.3, "vy": 0.0, "wz": 0.0}` |
| Rotate left 0.5 rad/s | `{"vx": 0.0, "vy": 0.0, "wz": 0.5}` |
| Rotate right 0.5 rad/s | `{"vx": 0.0, "vy": 0.0, "wz": -0.5}` |
| Stop | `{"vx": 0.0, "vy": 0.0, "wz": 0.0}` |

---

### 2.7 Set maximum navigation speed

```
POST /atlas/chassis/max_speed
```

**Body**
```json
{
  "speed": 0.5
}
```

**Response**
```json
{
  "status": "success"
}
```

> Valid range: `0.1` – `1.0` m/s.

---

### 2.8 External power control

**Turn on external power**
```
POST /atlas/chassis/power/on
```

**Turn off external power**
```
POST /atlas/chassis/power/off
```

**Body:** `{}`

**Response**
```json
{
  "status": "success"
}
```

---

## 3. Navigation

### 3.1 Navigate to coordinates

Sends the robot to an absolute map pose.

```
POST /atlas/nav/goal
```

**Body**
```json
{
  "x": 2.5,
  "y": -1.0,
  "yaw": 1.57
}
```

**Response**
```json
{
  "status": "success"
}
```

> `yaw` is in radians.

---

### 3.2 Navigate to named waypoint

```
POST /atlas/nav/goal_name
```

**Body**
```json
{
  "name": "reception"
}
```

**Response**
```json
{
  "status": "success"
}
```

> Returns `{"status": "error", "message": "waypoint not found"}` when the name does not exist.

---

### 3.3 Navigate through multiple waypoints

Executes a sequence of poses in order.

```
POST /atlas/nav/goal_list
```

**Body**
```json
[
  { "name": "P1", "x": 2.5,  "y": -1.0, "yaw": 1.57 },
  { "name": "P2", "x": 5.0,  "y":  2.3, "yaw": 0.0  },
  { "name": "P3", "x": -1.5, "y":  0.8, "yaw": 3.14 }
]
```

**Response**
```json
{
  "status": "success"
}
```

---

### 3.4 Cancel current navigation goal

```
POST /atlas/nav/cancel
```

**Body:** `{}`

**Response**
```json
{
  "status": "success"
}
```

---

### 3.5 Get navigation status

```
GET /atlas/nav/status
```

**Response**
```json
{
  "state": "navigating",
  "current_goal": { "x": 2.5, "y": -1.0, "yaw": 1.57 },
  "distance_remaining": 3.2,
  "active_waypoint_index": 1
}
```

| `state` | Meaning |
|---------|---------|
| `idle` | No active goal |
| `navigating` | Moving toward goal |
| `succeeded` | Goal reached |
| `failed` | Navigation failed |
| `cancelled` | Goal was cancelled |

---

### 3.6 Relocate (set initial pose)

Manually corrects the robot's estimated pose on the map.

```
POST /atlas/nav/relocate
```

**Body**
```json
{
  "x": 1.0,
  "y": 3.0,
  "yaw": 0.14
}
```

**Response**
```json
{
  "status": "success"
}
```

---

### 3.7 Navigate to charging pile

```
POST /atlas/nav/charge
```

**Body**
```json
{
  "type": 0,
  "name": "charging_pile"
}
```

| `type` | Behaviour |
|--------|-----------|
| `0` | Drive directly to charging pile contact |
| `1` | Navigate to vicinity then dock |

**Response**
```json
{
  "status": "success"
}
```

---

## 4. Route (Patrol)

A route is an ordered list of named waypoints used for autonomous patrol loops.

### 4.1 Get current route

```
GET /atlas/route
```

**Response**
```json
{
  "name": "warehouse_patrol",
  "loop": true,
  "waypoints": [
    { "name": "P1", "x": 13.18, "y":  4.79, "yaw": 0.25 },
    { "name": "P2", "x": 11.98, "y": -8.29, "yaw": 1.68 }
  ]
}
```

---

### 4.2 Get all saved routes

```
GET /atlas/route/list
```

**Response**
```json
{
  "routes": ["warehouse_patrol", "office_round", "perimeter"]
}
```

---

### 4.3 Save / update a route

```
POST /atlas/route
```

**Body**
```json
{
  "name": "warehouse_patrol",
  "loop": true,
  "waypoints": [
    { "name": "P1", "x": 13.18, "y":  4.79, "yaw": 0.25 },
    { "name": "P2", "x": 11.98, "y": -8.29, "yaw": 1.68 },
    { "name": "P3", "x":  6.86, "y": -2.73, "yaw": 3.13 }
  ]
}
```

**Response**
```json
{
  "status": "success"
}
```

---

### 4.4 Delete a route

```
DELETE /atlas/route/{name}
```

**Response**
```json
{
  "status": "success"
}
```

---

### 4.5 Start route patrol

```
POST /atlas/route/start
```

**Body**
```json
{
  "name": "warehouse_patrol",
  "loop": true
}
```

**Response**
```json
{
  "status": "success"
}
```

---

### 4.6 Stop route patrol

```
POST /atlas/route/stop
```

**Body:** `{}`

**Response**
```json
{
  "status": "success"
}
```

---

## 5. Map

### 5.1 Get current map data

Returns the map as a binary occupancy grid image (PGM) plus metadata.

```
GET /atlas/map
```

**Response**
```json
{
  "name": "warehouse",
  "alias": "Warehouse Floor 1",
  "width": 600,
  "height": 580,
  "resolution": 0.05,
  "origin": { "x": -15.0, "y": -14.5, "yaw": 0.0 },
  "image_url": "/atlas/map/image"
}
```

---

### 5.2 Get map image (raw PGM/PNG)

```
GET /atlas/map/image
```

**Response:** Binary image data (`image/png` or `image/x-portable-graymap`).

---

### 5.3 Get current map name

```
GET /atlas/map/current
```

**Response**
```json
{
  "name": "674e32391fad7ad8a1422360357d0516",
  "alias": "Warehouse Floor 1"
}
```

---

### 5.4 Get all saved maps

```
GET /atlas/map/list
```

**Response**
```json
{
  "maps": [
    { "name": "674e32391fad7ad8a1422360357d0516", "alias": "Warehouse Floor 1", "created_at": "2025-01-15T10:30:00Z" },
    { "name": "9a1b2c3d4e5f",                   "alias": "Office Level 2",    "created_at": "2025-03-20T08:00:00Z" }
  ]
}
```

---

### 5.5 Save current scanned map

Call this after finishing a mapping session to persist the map.

```
POST /atlas/map/save
```

**Body**
```json
{
  "alias": "Warehouse Floor 1"
}
```

**Response**
```json
{
  "status": "success",
  "name": "674e32391fad7ad8a1422360357d0516"
}
```

---

### 5.6 Switch to a saved map

After switching, the robot relocates to the charging pile position by default.  
Recommended: perform this switch while the robot is physically at the charging pile.

```
POST /atlas/map/apply
```

**Body**
```json
{
  "name": "674e32391fad7ad8a1422360357d0516"
}
```

**Response**
```json
{
  "status": "success"
}
```

---

### 5.7 Rename a map

```
POST /atlas/map/rename
```

**Body**
```json
{
  "name": "674e32391fad7ad8a1422360357d0516",
  "alias": "Warehouse Floor 1 – Updated"
}
```

**Response**
```json
{
  "status": "success"
}
```

---

### 5.8 Delete a map

> Cannot be undone.

```
DELETE /atlas/map/{name}
```

**Response**
```json
{
  "status": "success"
}
```

---

### 5.9 Export (download) a map

```
GET /atlas/map/export/{name}
```

**Response:** Binary blob (`application/octet-stream`) containing the map archive (`.pgm` + `.yaml` + posegraph).

---

### 5.10 Import (upload) a map

```
POST /atlas/map/import
Content-Type: multipart/form-data
```

**Body:** Form field `file` containing the map archive.

**Response**
```json
{
  "status": "success",
  "name": "674e32391fad7ad8a1422360357d0516"
}
```

---

## 6. Waypoints (Calibration Positions)

Named poses stored on the current map, used as navigation targets.

### 6.1 Get all waypoints

```
GET /atlas/waypoints
```

**Response**
```json
{
  "waypoints": [
    { "name": "reception",     "type": "delivery", "x": -2.06, "y": 0.77,  "yaw": 0.19  },
    { "name": "charging_pile", "type": "charger",  "x":  0.0,  "y": 0.0,   "yaw": 0.0   },
    { "name": "lobby",         "type": "avoid",    "x": -0.91, "y": 0.48,  "yaw": -0.01 }
  ]
}
```

| `type` | Meaning |
|--------|---------|
| `delivery` | Delivery / task stop |
| `charger` | Charging pile position |
| `avoid` | Robot slows or avoids lingering |
| `custom` | User-defined type |

---

### 6.2 Add or update a waypoint

```
POST /atlas/waypoints
```

**Body**
```json
{
  "name": "office_desk",
  "type": "delivery",
  "x": 3.5,
  "y": 1.2,
  "yaw": 1.57
}
```

**Response**
```json
{
  "status": "success"
}
```

---

### 6.3 Delete a waypoint

```
DELETE /atlas/waypoints/{name}
```

**Response**
```json
{
  "status": "success"
}
```

---

## 7. Virtual Wall

Virtual walls are polyline segments drawn on the map that the planner treats as obstacles.

### 7.1 Get virtual walls

```
GET /atlas/virtual_wall
```

**Response**
```json
{
  "walls": [
    {
      "id": "wall_001",
      "points": [[120, 85], [145, 85], [145, 110]]
    },
    {
      "id": "wall_002",
      "points": [[200, 50], [220, 50]]
    }
  ]
}
```

> Coordinates are pixel positions on the map image.

---

### 7.2 Update virtual walls

Replaces all current virtual walls.

```
POST /atlas/virtual_wall
```

**Body**
```json
{
  "walls": [
    {
      "id": "wall_001",
      "points": [[120, 85], [145, 85], [145, 110]]
    }
  ]
}
```

**Response**
```json
{
  "status": "success"
}
```

---

### 7.3 Clear all virtual walls

```
DELETE /atlas/virtual_wall
```

**Body:** `{}`

**Response**
```json
{
  "status": "success"
}
```

---

## 8. Special Area

Special areas are polygon regions on the map that modify robot behaviour when entered.

### 8.1 Get all special areas

```
GET /atlas/special_area
```

**Response**
```json
{
  "areas": [
    {
      "id": "area_001",
      "name": "slow_zone",
      "type": 0,
      "speed": 0.3,
      "polygon": [[100, 80], [150, 80], [150, 130], [100, 130]]
    },
    {
      "id": "area_002",
      "name": "no_entry",
      "type": 1,
      "speed": 0.0,
      "polygon": [[200, 200], [250, 200], [250, 250], [200, 250]]
    }
  ]
}
```

| `type` | Behaviour |
|--------|-----------|
| `0` | Speed reduction zone |
| `1` | No-entry / forbidden zone |
| `2` | Action trigger zone (fires event on entry/exit) |

---

### 8.2 Save / update special areas

```
POST /atlas/special_area
```

**Body**
```json
{
  "areas": [
    {
      "id": "area_001",
      "name": "slow_zone",
      "type": 0,
      "speed": 0.3,
      "polygon": [[100, 80], [150, 80], [150, 130], [100, 130]]
    }
  ]
}
```

**Response**
```json
{
  "status": "success"
}
```

---

### 8.3 Delete a special area

```
DELETE /atlas/special_area/{id}
```

**Response**
```json
{
  "status": "success"
}
```

---

## 9. Settings

### 9.1 Get all settings

```
GET /atlas/settings
```

**Response**
```json
{
  "max_speed": 0.7,
  "min_speed": 0.1,
  "inflation_radius": 0.35,
  "robot_radius": 0.3,
  "xy_goal_tolerance": 0.2,
  "yaw_goal_tolerance": 0.2,
  "language": "en"
}
```

---

### 9.2 Update settings

```
POST /atlas/settings
```

**Body** (partial update supported)
```json
{
  "max_speed": 0.5,
  "inflation_radius": 0.4
}
```

**Response**
```json
{
  "status": "success"
}
```

---

## 10. Upgrade

### 10.1 Upload firmware / navigation upgrade

```
POST /atlas/upgrade
Content-Type: multipart/form-data
```

**Body:** Form field `file` containing the upgrade package.

**Response**
```json
{
  "status": "success",
  "message": "Upgrade started. System will restart automatically."
}
```

---

## 11. WebSocket — Real-Time Streams

Connect to receive push updates without polling. All messages are JSON.

### 11.1 Main status stream

```
WS ws://{host}/atlas/ws/status
```

**Server → Client message (published at ~10 Hz)**
```json
{
  "type": "status",
  "timestamp": 1748563200.123,
  "pose":          { "x": 1.2, "y": 3.4, "yaw": 0.97 },
  "speed":         { "vx": 0.3, "vy": 0.0, "wz": 0.0 },
  "battery":       85,
  "charge_flag":   1,
  "emergency_stop": false,
  "laser":         "ok",
  "imu":           "ok",
  "mode":          2
}
```

---

### 11.2 Navigation event stream

```
WS ws://{host}/atlas/ws/nav
```

**Server → Client messages**
```json
{ "type": "nav_started",   "goal": { "x": 2.5, "y": -1.0, "yaw": 1.57 } }
{ "type": "nav_progress",  "distance_remaining": 2.1, "waypoint_index": 1 }
{ "type": "nav_succeeded", "goal": { "x": 2.5, "y": -1.0, "yaw": 1.57 } }
{ "type": "nav_failed",    "reason": "obstacle" }
{ "type": "nav_cancelled" }
```

---

### 11.3 Map build stream

Active during mapping mode (`mode=1` or `mode=3`).

```
WS ws://{host}/atlas/ws/map_build
```

**Server → Client message (published at ~2 Hz)**
```json
{
  "type": "map_update",
  "timestamp": 1748563200.123,
  "width": 400,
  "height": 380,
  "resolution": 0.05,
  "image_base64": "<base64-encoded PGM data>"
}
```

---

### 11.4 Special area entry/exit events

```
WS ws://{host}/atlas/ws/area_events
```

**Server → Client messages**
```json
{ "type": "area_entered", "area_id": "area_002", "area_name": "slow_zone", "timestamp": 1748563200.0 }
{ "type": "area_exited",  "area_id": "area_002", "area_name": "slow_zone", "timestamp": 1748563205.0 }
```

---

## 12. API Quick Reference

### GET endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /atlas/version` | Navigation software version |
| `GET /atlas/mode` | Current operating mode |
| `GET /atlas/hostname` | Robot hostname |
| `GET /atlas/status` | Combined system snapshot |
| `GET /atlas/chassis/pose` | Robot pose (x, y, yaw) |
| `GET /atlas/chassis/speed` | Current velocity |
| `GET /atlas/chassis/imu` | IMU state |
| `GET /atlas/chassis/battery` | Battery & power status |
| `GET /atlas/chassis/laser` | Laser scan point cloud |
| `GET /atlas/nav/status` | Navigation state & progress |
| `GET /atlas/map` | Current map metadata |
| `GET /atlas/map/image` | Current map image (binary) |
| `GET /atlas/map/current` | Current map name |
| `GET /atlas/map/list` | All saved maps |
| `GET /atlas/map/export/{name}` | Download map archive |
| `GET /atlas/waypoints` | All calibrated waypoints |
| `GET /atlas/route` | Current patrol route |
| `GET /atlas/route/list` | All saved routes |
| `GET /atlas/virtual_wall` | All virtual walls |
| `GET /atlas/special_area` | All special areas |
| `GET /atlas/settings` | All settings |

### POST endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /atlas/mode` | Set operating mode |
| `POST /atlas/chassis/move` | Manual velocity command |
| `POST /atlas/chassis/max_speed` | Set navigation max speed |
| `POST /atlas/chassis/power/on` | Turn on external power |
| `POST /atlas/chassis/power/off` | Turn off external power |
| `POST /atlas/nav/goal` | Navigate to coordinates |
| `POST /atlas/nav/goal_name` | Navigate to named waypoint |
| `POST /atlas/nav/goal_list` | Navigate through waypoint list |
| `POST /atlas/nav/cancel` | Cancel active navigation goal |
| `POST /atlas/nav/relocate` | Set initial pose on map |
| `POST /atlas/nav/charge` | Navigate to charging pile |
| `POST /atlas/map/save` | Save current scanned map |
| `POST /atlas/map/apply` | Switch to a saved map |
| `POST /atlas/map/rename` | Rename a map |
| `POST /atlas/map/import` | Upload a map archive |
| `POST /atlas/waypoints` | Add or update a waypoint |
| `POST /atlas/route` | Save or update a patrol route |
| `POST /atlas/route/start` | Start patrol on a route |
| `POST /atlas/route/stop` | Stop current patrol |
| `POST /atlas/virtual_wall` | Replace all virtual walls |
| `POST /atlas/special_area` | Replace all special areas |
| `POST /atlas/settings` | Update settings |
| `POST /atlas/upgrade` | Upload firmware upgrade |

### DELETE endpoints

| Endpoint | Description |
|----------|-------------|
| `DELETE /atlas/map/{name}` | Delete a saved map |
| `DELETE /atlas/waypoints/{name}` | Delete a waypoint |
| `DELETE /atlas/route/{name}` | Delete a patrol route |
| `DELETE /atlas/virtual_wall` | Clear all virtual walls |
| `DELETE /atlas/special_area/{id}` | Delete one special area |

### WebSocket endpoints

| Endpoint | Description |
|----------|-------------|
| `WS /atlas/ws/status` | Real-time robot status (~10 Hz) |
| `WS /atlas/ws/nav` | Navigation events (goal start/progress/done) |
| `WS /atlas/ws/map_build` | Live map updates during mapping (~2 Hz) |
| `WS /atlas/ws/area_events` | Special area entry/exit events |
