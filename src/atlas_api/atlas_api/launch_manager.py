"""
LaunchManager — spawns and terminates ROS 2 launch processes for mode switching.

Mode 0 (idle):         stop everything
Mode 1 / 3 (mapping): a1_slam_toolbox.launch.py
Mode 2 (navigation):  a1_map_server.launch.py  +  a1_navigation.launch.py

Kill strategy: ros2 launch is spawned with start_new_session=True, so it
becomes its own process-group leader.  os.killpg() sends the signal to the
entire group (launch process + all child nodes it spawned), ensuring slam_toolbox,
rviz2, nav2 nodes etc. are all terminated — not just the launch wrapper.
"""
from __future__ import annotations

import os
import signal
import subprocess
import threading
from typing import Optional


class LaunchManager:
    _KEYS = ('slam', 'map_server', 'navigation')

    def __init__(self, logger=None, robot_type: str = 'real'):
        self._logger = logger
        self._robot  = robot_type   # 'sim' | 'real'
        self._lock   = threading.Lock()
        self._procs: dict[str, Optional[subprocess.Popen]] = {k: None for k in self._KEYS}

    # ── internal helpers ──────────────────────────────────────────────────────

    def _log(self, msg: str):
        if self._logger:
            self._logger.info(msg)

    def _alive(self, key: str) -> bool:
        p = self._procs.get(key)
        return p is not None and p.poll() is None

    def _kill(self, key: str):
        """Terminate the entire process group so child ROS nodes are also killed."""
        p = self._procs.get(key)
        if p and p.poll() is None:
            self._log(f'Stopping {key} (pid={p.pid})')
            try:
                pgid = os.getpgid(p.pid)
                os.killpg(pgid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                p.wait(timeout=8)
            except subprocess.TimeoutExpired:
                try:
                    pgid = os.getpgid(p.pid)
                    os.killpg(pgid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        self._procs[key] = None

    def _spawn(self, key: str, cmd: list):
        self._kill(key)
        self._log(f'Starting {key}: {" ".join(cmd)}')
        self._procs[key] = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,   # new session → new process group → killpg kills all children
        )

    # ── public API ────────────────────────────────────────────────────────────

    def start_mapping(self):
        """Kill nav stack, start slam_toolbox for fresh SLAM (no existing map)."""
        with self._lock:
            self._kill('navigation')
            self._kill('map_server')
            self._spawn('slam', ['ros2', 'launch', 'a1_slam',
                                 f'a1_slam_toolbox_{self._robot}.launch.py'])

    def start_incremental_mapping(self, posegraph_base: str):
        """Kill nav stack, start slam_toolbox and load an existing posegraph for extension.

        posegraph_base: path WITHOUT extension, e.g.
            /path/to/maps/warehouse/warehouse
        slam_toolbox will look for <base>.posegraph and <base>.data.
        """
        with self._lock:
            self._kill('navigation')
            self._kill('map_server')
            cmd = ['ros2', 'launch', 'a1_slam', f'a1_slam_toolbox_{self._robot}.launch.py']
            if posegraph_base:
                cmd += [f'map_file:={posegraph_base}']
            self._spawn('slam', cmd)

    def start_navigation(self, map_yaml: str = ''):
        """Kill slam, start map_server + navigation."""
        with self._lock:
            self._kill('slam')
            cmd_map = ['ros2', 'launch', 'a1_slam', f'a1_map_server_{self._robot}.launch.py']
            if map_yaml and os.path.exists(map_yaml):
                cmd_map += [f'map:={map_yaml}']
            self._spawn('map_server', cmd_map)
            self._spawn('navigation', ['ros2', 'launch', 'a1_slam',
                                       f'a1_navigation_{self._robot}.launch.py'])

    def stop_navigation(self):
        """Stop map_server and navigation (go to idle without starting slam)."""
        with self._lock:
            self._kill('navigation')
            self._kill('map_server')

    def restart_map_server(self, map_yaml: str = ''):
        """Restart only the map_server with a new map yaml (live map switch)."""
        with self._lock:
            cmd_map = ['ros2', 'launch', 'a1_slam', f'a1_map_server_{self._robot}.launch.py']
            if map_yaml and os.path.exists(map_yaml):
                cmd_map += [f'map:={map_yaml}']
            self._spawn('map_server', cmd_map)

    def stop_all(self):
        """Kill every managed process."""
        with self._lock:
            for key in self._KEYS:
                self._kill(key)

    def get_status(self) -> dict:
        with self._lock:
            return {k: self._alive(k) for k in self._KEYS}


# ── module-level singleton ────────────────────────────────────────────────────

_manager: Optional[LaunchManager] = None


def init_launch_manager(logger=None, robot_type: str = 'real') -> LaunchManager:
    global _manager
    _manager = LaunchManager(logger, robot_type)
    return _manager


def get_launch_manager() -> LaunchManager:
    if _manager is None:
        raise RuntimeError('call init_launch_manager() first')
    return _manager
