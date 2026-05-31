from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory
import os

def generate_launch_description():
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
        # parameters=[{'use_sim_time': True}],
    )
    
    # Atlas API
    atlas_api = Node(
        package='atlas_api',
        executable='atlas_api',
        name='atlas_api',
        output='screen',
        # parameters=[{'use_sim_time': True}]
    )

    return LaunchDescription([
        a1_simulation,
        a1_laser_filter,
        a1_joystick,
        a1_fake_status,
        odom_relay,
        atlas_api
    ])

# save map
#ros2 run nav2_map_server map_saver_cli -f map