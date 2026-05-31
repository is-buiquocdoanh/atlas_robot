from glob import glob
from setuptools import find_packages, setup

package_name = 'atlas_api'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/launch', glob('launch/*.launch.py')),
    ],
    package_data={'atlas_api': ['static/*', 'static/**/*']},
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='doanh',
    maintainer_email='doanh762003@gmail.com',
    description='REST + WebSocket API server for the Atlas robot navigation system',
    license='Apache-2.0',
    extras_require={'test': ['pytest']},
    entry_points={
        'console_scripts': [
            'atlas_api_node = atlas_api.main:main',
        ],
    },
)
