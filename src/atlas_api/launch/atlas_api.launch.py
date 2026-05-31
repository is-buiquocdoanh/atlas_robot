"""
Launch the Atlas API server (REST on :8080, WebSocket on :9090).

Usage:
  ros2 launch atlas_api atlas_api.launch.py
  ros2 launch atlas_api atlas_api.launch.py rest_port:=8080 ws_port:=9090
"""
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument('use_sim_time', default_value='false'),

        Node(
            package='atlas_api',
            executable='atlas_api_node',
            name='atlas_api_node',
            output='screen',
            parameters=[{
                'use_sim_time': LaunchConfiguration('use_sim_time'),
            }],
        ),
    ])
