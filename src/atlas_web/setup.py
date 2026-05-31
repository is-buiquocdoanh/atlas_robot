from glob import glob
from setuptools import find_packages, setup

package_name = 'atlas_web'

setup(
    name=package_name,
    version='1.0.0',
    packages=find_packages(exclude=['test']),
    package_data={
        package_name: [
            'static/index.html',
            'static/css/*.css',
            'static/js/*.js',
            'static/img/*',
        ]
    },
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/launch', glob('launch/*.launch.py')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='doanh',
    maintainer_email='doanh762003@gmail.com',
    description='AMR Web Dashboard for Atlas robot',
    license='Apache-2.0',
    extras_require={'test': ['pytest']},
    entry_points={
        'console_scripts': [
            'atlas_web_node = atlas_web.server:main',
        ],
    },
)
