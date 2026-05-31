from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument('port',     default_value='8888'),
        DeclareLaunchArgument('api_host', default_value='localhost:8080'),

        Node(
            package='atlas_web',
            executable='atlas_web_node',
            name='atlas_web_node',
            output='screen',
            parameters=[{
                'port':     LaunchConfiguration('port'),
                'api_host': LaunchConfiguration('api_host'),
            }],
        ),
    ])
