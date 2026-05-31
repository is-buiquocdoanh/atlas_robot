#!/usr/bin/env python3
"""
Atlas Web UI — static file server.
Serves the dashboard at http://0.0.0.0:8888
All robot data comes from atlas_api (default localhost:8080 / ws :9090).
"""
import os
import threading
import rclpy
from rclpy.node import Node
from flask import Flask, send_from_directory

_STATIC = os.path.join(os.path.dirname(__file__), 'static')
_app = Flask(__name__, static_folder=None)


@_app.route('/', defaults={'path': ''})
@_app.route('/<path:path>')
def serve(path):
    full = os.path.join(_STATIC, path) if path else ''
    if path and os.path.isfile(full):
        return send_from_directory(_STATIC, path)
    return send_from_directory(_STATIC, 'index.html')


def main(args=None):
    rclpy.init(args=args)
    node = Node('atlas_web_node')
    node.declare_parameter('port',     8888)
    node.declare_parameter('api_host', 'localhost:8080')

    port     = node.get_parameter('port').value
    api_host = node.get_parameter('api_host').value

    ros_t = threading.Thread(target=lambda: rclpy.spin(node), daemon=True)
    ros_t.start()

    node.get_logger().info(
        f'Atlas Web UI  http://0.0.0.0:{port}  →  API {api_host}'
    )
    try:
        _app.run(host='0.0.0.0', port=port, threaded=True, use_reloader=False, debug=False)
    except KeyboardInterrupt:
        pass
    finally:
        rclpy.shutdown()


if __name__ == '__main__':
    main()
