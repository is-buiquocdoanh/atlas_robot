#!/usr/bin/env python3
"""
Fake hardware status publisher for simulation.

Topics published (all prefixed /atlas/):
  /atlas/version         std_msgs/String          — software version string
  /atlas/imu             sensor_msgs/Imu          — IMU with Gaussian noise
  /atlas/battery         sensor_msgs/BatteryState — slowly draining battery
  /atlas/emergency_stop  std_msgs/Bool            — e-stop state (default: released)
  /atlas/power_status    std_msgs/Int32           — external power (0=off, 1=on)

Parameters:
  ~initial_battery    (float, 0.85)   initial charge fraction [0.0–1.0]
  ~battery_drain_rate (float, 0.002)  charge fraction lost per second
  ~publish_rate       (float, 10.0)   Hz
  ~use_sim_time       (bool,  true)
"""
import math
import random

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import BatteryState, Imu
from std_msgs.msg import Bool, Int32, String

VERSION = 'ATLAS-v1.0.0'


class FakeRobotStatus(Node):

    def __init__(self):
        super().__init__('fake_robot_status')

        self.declare_parameter('initial_battery',    0.85)
        self.declare_parameter('battery_drain_rate', 0.002)
        self.declare_parameter('publish_rate',       10.0)

        self._battery = float(self.get_parameter('initial_battery').value)
        self._drain   = float(self.get_parameter('battery_drain_rate').value)
        rate          = float(self.get_parameter('publish_rate').value)

        # mutable state (can be toggled via ROS params or future services)
        self._estop          = False
        self._external_power = False

        # publishers
        self._pub_version = self.create_publisher(String,       '/atlas/version',        1)
        self._pub_imu     = self.create_publisher(Imu,          '/atlas/imu',            10)
        self._pub_battery = self.create_publisher(BatteryState, '/atlas/battery',        10)
        self._pub_estop   = self.create_publisher(Bool,         '/atlas/emergency_stop', 10)
        self._pub_power   = self.create_publisher(Int32,        '/atlas/power_status',   10)

        self._timer = self.create_timer(1.0 / rate, self._publish_all)
        self.get_logger().info(
            f'FakeRobotStatus running  battery={self._battery:.0%}  rate={rate} Hz'
        )

    # ------------------------------------------------------------------
    def _publish_all(self):
        stamp = self.get_clock().now().to_msg()
        self._publish_version()
        self._publish_imu(stamp)
        self._publish_battery(stamp)
        self._pub_estop.publish(Bool(data=self._estop))
        self._pub_power.publish(Int32(data=1 if self._external_power else 0))

    # -- version -------------------------------------------------------
    def _publish_version(self):
        self._pub_version.publish(String(data=VERSION))

    # -- IMU -----------------------------------------------------------
    def _publish_imu(self, stamp):
        msg = Imu()
        msg.header.stamp    = stamp
        msg.header.frame_id = 'imu_link'

        # Gravity on Z + small Gaussian noise
        msg.linear_acceleration.x = random.gauss(0.0,  0.015)
        msg.linear_acceleration.y = random.gauss(0.0,  0.015)
        msg.linear_acceleration.z = 9.81 + random.gauss(0.0, 0.04)

        # Near-zero angular velocity
        msg.angular_velocity.x = random.gauss(0.0, 5e-4)
        msg.angular_velocity.y = random.gauss(0.0, 5e-4)
        msg.angular_velocity.z = random.gauss(0.0, 5e-4)

        # Upright identity orientation
        msg.orientation.w = 1.0

        # Diagonal covariance matrices (low uncertainty)
        for i in (0, 4, 8):
            msg.orientation_covariance[i]         = 1e-6
            msg.angular_velocity_covariance[i]    = 1e-6
            msg.linear_acceleration_covariance[i] = 1e-4

        self._pub_imu.publish(msg)

    # -- Battery -------------------------------------------------------
    def _publish_battery(self, stamp):
        # Drain slowly; wrap at 10 % for endless demo
        self._battery = max(0.0, self._battery - self._drain / 10.0)
        if self._battery <= 0.10:
            self._battery = 0.85
            self.get_logger().info('Battery demo: reset to 85 %')

        msg = BatteryState()
        msg.header.stamp = stamp
        msg.voltage      = 22.0 + self._battery * 4.2   # 22 V – 26.2 V
        msg.percentage   = float(self._battery)
        msg.power_supply_status = (
            BatteryState.POWER_SUPPLY_STATUS_CHARGING
            if self._estop is False and self._external_power
            else BatteryState.POWER_SUPPLY_STATUS_DISCHARGING
        )
        msg.present = True
        self._pub_battery.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = FakeRobotStatus()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
