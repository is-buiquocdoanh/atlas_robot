from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument('use_sim_time',       default_value='true'),
        DeclareLaunchArgument('initial_battery',    default_value='0.85'),
        DeclareLaunchArgument('battery_drain_rate', default_value='0.002'),
        DeclareLaunchArgument('publish_rate',       default_value='10.0'),

        Node(
            package='a1_bringup',
            executable='fake_robot_status.py',
            name='fake_robot_status',
            output='screen',
            parameters=[{
                'use_sim_time':       LaunchConfiguration('use_sim_time'),
                'initial_battery':    LaunchConfiguration('initial_battery'),
                'battery_drain_rate': LaunchConfiguration('battery_drain_rate'),
                'publish_rate':       LaunchConfiguration('publish_rate'),
            }],
        ),
    ])
