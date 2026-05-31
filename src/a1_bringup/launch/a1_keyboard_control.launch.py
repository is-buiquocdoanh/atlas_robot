from sphinx import package_dir
import launch
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from ament_index_python.packages import get_package_share_directory
import os

def generate_launch_description():
    package_dir = get_package_share_directory('a1_bringup')
    twist_mux_params = os.path.join(package_dir, 'config', 'twist_mux.yaml')

    return LaunchDescription([
        # Node(
        #     package='twist_mux',
        #     executable='twist_mux',
        #     name='twist_mux',
        #     parameters=[twist_mux_params],
        #     remappings=[('cmd_vel_out', 'cmd_vel')]
        # ),
        Node(
            package='a1_bringup',
            executable='keyboard_control_node.py',
            name='keyboard_control_node',
        ),
    ])