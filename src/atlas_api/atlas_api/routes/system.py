import os
import socket
from flask import Blueprint, jsonify, request
from ..ros_node import get_node
from ..launch_manager import get_launch_manager

bp = Blueprint('system', __name__)


@bp.get('/atlas/version')
def get_version():
    return jsonify({'version': get_node().get_version()})


@bp.get('/atlas/mode')
def get_mode():
    return jsonify({'mode': get_node().get_mode()})


@bp.post('/atlas/mode')
def set_mode():
    data = request.get_json(force=True) or {}
    mode = data.get('mode')
    if mode not in (0, 1, 2, 3):
        return jsonify({'status': 'error', 'message': 'mode must be 0 (stop), 1 (mapping), 2 (nav), or 3 (incremental)'}), 400

    lm = get_launch_manager()

    if mode == 0:
        lm.stop_all()
    elif mode == 1:
        lm.start_mapping()
    elif mode == 3:
        # Incremental mapping — need the posegraph of an existing map
        from .map_api import get_current_map_yaml, set_current_map
        map_name = data.get('map', '')
        if map_name:
            yaml_path = set_current_map(map_name)
        else:
            yaml_path = get_current_map_yaml()

        if not yaml_path or not os.path.exists(yaml_path):
            return jsonify({'status': 'error',
                            'message': 'No map selected for incremental mapping. '
                                       'Pass {"mode":3,"map":"<map_name>"} or set a current map first.'}), 400

        posegraph_base = os.path.splitext(yaml_path)[0]   # strip .yaml → posegraph path
        if not os.path.exists(posegraph_base + '.posegraph'):
            return jsonify({'status': 'error',
                            'message': f'Posegraph file not found for map "{yaml_path}". '
                                       'This map was not created by slam_toolbox and cannot be extended.'}), 400

        lm.start_incremental_mapping(posegraph_base)
    elif mode == 2:
        from .map_api import get_current_map_yaml, set_current_map
        map_name = data.get('map')
        if map_name:
            yaml_path = set_current_map(map_name)
        else:
            yaml_path = get_current_map_yaml()
        lm.start_navigation(yaml_path)

    get_node().set_mode(int(mode))
    return jsonify({'status': 'success'})


@bp.get('/atlas/launch/status')
def get_launch_status():
    return jsonify(get_launch_manager().get_status())


@bp.get('/atlas/hostname')
def get_hostname():
    return jsonify({'hostname': socket.gethostname()})


@bp.get('/atlas/status')
def get_status():
    from .map_api import get_current_map_info
    status = get_node().get_status()
    cm = get_current_map_info()
    status['current_map'] = cm.get('alias') or cm.get('name', '')
    return jsonify(status)
