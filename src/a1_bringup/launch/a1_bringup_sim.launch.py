from launch import LaunchDescription
from launch.actions import ExecuteProcess, IncludeLaunchDescription, RegisterEventHandler
from launch.event_handlers import OnProcessExit
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory
import os

def generate_launch_description():
    # Kill all running ROS nodes before bringing up
    kill_all_ros = ExecuteProcess(
        cmd=['bash', '-c',
             'pkill -9 -f "/opt/ros/humble/lib/" || true;'
             'pkill -9 -f "/opt/ros/humble/bin/ros2" || true;'
             'ros2 daemon stop 2>/dev/null || true;'
             'sleep 2;'
             'ros2 daemon start 2>/dev/null || true;'
             'sleep 1'],
        output='screen',
        name='kill_all_ros',
    )

    # a1 simulation
    a1_simulation = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(
            get_package_share_directory('a1_description'),
            'launch',
            'a1_simulation.launch.py'
        ))
    )

    # a1 laser filter
    a1_laser_filter = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(
            get_package_share_directory('a1_bringup'),
            'launch',
            'a1_laser_filter.launch.py'
        ))
    )

    # a1 joystick
    a1_joystick = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(
            get_package_share_directory('a1_bringup'),
            'launch',
            'a1_joystick.launch.py'
        ))
    )

    # a1 fake status
    a1_fake_status = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(
            get_package_share_directory('a1_bringup'),
            'launch',
            'a1_fake_status.launch.py'
        ))
    )

    # Relay /odom → /atlas/odom
    odom_relay = Node(
        package='topic_tools',
        executable='relay',
        name='odom_relay',
        output='screen',
        arguments=['/odom', '/atlas/odom'],
    )

    # Atlas API
    atlas_api_sim = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(
            get_package_share_directory('atlas_api'),
            'launch',
            'atlas_api_sim.launch.py'
        ))
    )

    # Atlas Web
    atlas_web = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(
            get_package_share_directory('atlas_web'),
            'launch',
            'atlas_web.launch.py'
        ))
    )

    # Start all nodes only after kill_all_ros finishes
    start_all = RegisterEventHandler(
        OnProcessExit(
            target_action=kill_all_ros,
            on_exit=[
                a1_simulation,
                a1_laser_filter,
                a1_joystick,
                a1_fake_status,
                odom_relay,
                atlas_api_sim,
                atlas_web,
            ]
        )
    )

    return LaunchDescription([
        kill_all_ros,
        start_all,
    ])

# save map
#ros2 run nav2_map_server map_saver_cli -f map