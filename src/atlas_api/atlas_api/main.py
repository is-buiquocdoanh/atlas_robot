#!/usr/bin/env python3
"""
Atlas API server entry point.

Thread layout:
  main thread  — Flask REST API (blocking)
  atlas-ros    — rclpy MultiThreadedExecutor (spins ROS callbacks)
  atlas-ws     — asyncio event loop for WebSocket server
  atlas-bc     — status broadcast loop (~5 Hz → WebSocket)
"""
import logging
import threading
import time

import rclpy
from rclpy.executors import MultiThreadedExecutor

from . import ros_node, ws_server
from .app import create_app

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
)
log = logging.getLogger(__name__)

_REST_PORT = 8080
_WS_PORT   = 9090
_BC_HZ     = 5.0          # WebSocket status broadcast rate


def main(args=None):
    rclpy.init(args=args)

    # 1 ── ROS node + executor ──────────────────────────────────────────────
    node = ros_node.init_node()
    executor = MultiThreadedExecutor(num_threads=4)
    executor.add_node(node)

    ros_thread = threading.Thread(
        target=executor.spin, name='atlas-ros', daemon=True
    )
    ros_thread.start()
    log.info('ROS executor started')

    # 2 ── WebSocket server ─────────────────────────────────────────────────
    ws_server.start(host='0.0.0.0', port=_WS_PORT)
    log.info('WebSocket server starting on ws://0.0.0.0:%d', _WS_PORT)

    # 3 ── Status broadcast timer ───────────────────────────────────────────
    def _broadcast_loop():
        interval = 1.0 / _BC_HZ
        while rclpy.ok():
            try:
                ws_server.broadcast({'type': 'status', **node.get_status()})
            except Exception as e:
                log.debug('broadcast error: %s', e)
            time.sleep(interval)

    bc_thread = threading.Thread(
        target=_broadcast_loop, name='atlas-bc', daemon=True
    )
    bc_thread.start()

    # 4 ── Flask REST API (blocks until KeyboardInterrupt) ─────────────────
    app = create_app()
    log.info('REST API starting on http://0.0.0.0:%d', _REST_PORT)
    try:
        app.run(
            host='0.0.0.0',
            port=_REST_PORT,
            threaded=True,
            use_reloader=False,
            debug=False,
        )
    except KeyboardInterrupt:
        pass
    finally:
        log.info('Shutting down…')
        executor.shutdown(wait=False)
        rclpy.shutdown()


if __name__ == '__main__':
    main()
