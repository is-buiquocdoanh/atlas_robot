from launch import LaunchDescription
from launch_ros.actions import Node
from launch.substitutions import LaunchConfiguration
from launch.actions import DeclareLaunchArgument

import os
from ament_index_python.packages import get_package_share_directory

def generate_launch_description():
    
    package_dir = get_package_share_directory('a1_bringup')
    joy_params = os.path.join(package_dir, 'config', 'joystick.yaml')
    twist_mux_params = os.path.join(package_dir, 'config', 'twist_mux.yaml')


    # Node đọc tay cầm và xuất /joy
    joy_node = Node(
            package='joy',
            executable='joy_node',
            parameters=[{'use_sim_time': False}],
         )
    # Node chuyển /joy -> /cmd_vel_joy
    teleop_node = Node(
            package='teleop_twist_joy',
            executable='teleop_node',
            name='teleop_node',
            parameters=[joy_params],
            remappings=[('/cmd_vel','/atlas/cmd_vel_joy')]
         )

    # Node mux các lệnh /cmd_vel_* thành /cmd_vel
    twist_mux_node = Node(
            package='twist_mux',
            executable='twist_mux',
            name='twist_mux',
            output='screen',
            parameters=[twist_mux_params],
            remappings=[('/cmd_vel_out', '/cmd_vel')]  # output cuối cùng ra /cmd_vel
    )

    return LaunchDescription([
        joy_node,
        teleop_node,
        twist_mux_node    
    ])