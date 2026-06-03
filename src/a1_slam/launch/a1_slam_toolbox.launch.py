import os

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory


def generate_launch_description():
    use_sim_time      = LaunchConfiguration('use_sim_time')
    slam_params_file  = LaunchConfiguration('slam_params_file')
    # Optional: path to existing posegraph (WITHOUT extension) for incremental mapping.
    # Leave empty for fresh SLAM.  slam_toolbox ignores this when empty.
    map_file          = LaunchConfiguration('map_file')

    declare_use_sim_time_argument = DeclareLaunchArgument(
        'use_sim_time',
        default_value='true',
        description='Use simulation/Gazebo clock')

    declare_slam_params_file_cmd = DeclareLaunchArgument(
        'slam_params_file',
        default_value=os.path.join(
            get_package_share_directory('a1_slam'), 'config', 'a1_slam_toolbox.yaml'),
        description='Full path to the slam_toolbox ROS2 parameters file')

    declare_map_file_cmd = DeclareLaunchArgument(
        'map_file',
        default_value='',
        description='Path to existing posegraph (no extension) for incremental mapping; '
                    'empty = start fresh SLAM')

    rviz_config = os.path.join(
        get_package_share_directory('a1_slam'), 'rviz', 'slam_toolbox_default.rviz')

    start_async_slam_toolbox_node = Node(
        parameters=[
            slam_params_file,
            {'use_sim_time':   use_sim_time,
             'map_file_name':  map_file},   # empty string → ignored by slam_toolbox
        ],
        package='slam_toolbox',
        executable='async_slam_toolbox_node',
        name='slam_toolbox',
        output='screen')

    rviz_node = Node(
        package='rviz2',
        executable='rviz2',
        name='rviz2',
        output='screen',
        arguments=['-d', rviz_config]
    )

    ld = LaunchDescription()
    ld.add_action(declare_use_sim_time_argument)
    ld.add_action(declare_slam_params_file_cmd)
    ld.add_action(declare_map_file_cmd)
    ld.add_action(start_async_slam_toolbox_node)
    ld.add_action(rviz_node)
    return ld