from launch import LaunchDescription
from launch.actions import SetEnvironmentVariable
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        SetEnvironmentVariable('ATLAS_ROBOT', 'sim'),

        Node(
            package='atlas_api',
            executable='atlas_api_node',
            name='atlas_api_node',
            output='screen',
            parameters=[{'use_sim_time': True}],
        ),
    ])
