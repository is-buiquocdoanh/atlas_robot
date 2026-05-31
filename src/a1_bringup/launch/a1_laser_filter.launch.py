from launch import LaunchDescription
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory
import os

def generate_launch_description():

    config = os.path.join(
        get_package_share_directory('a1_bringup'),
        'config',
        'scan_filter.yaml'
    )

    return LaunchDescription([
        # Node for the laser filter chain
        Node(
            package='laser_filters',
            executable='scan_to_scan_filter_chain',
            name='scan_filterer',
            parameters=[config],
            remappings=[
                ('scan', '/atlas/scan_top'),
                ('scan_filtered', '/atlas/scan_filtered')
            ],
            output='screen'
        ),

    ])