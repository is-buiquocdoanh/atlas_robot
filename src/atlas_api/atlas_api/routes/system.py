import socket
from flask import Blueprint, jsonify, request
from ..ros_node import get_node

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
    if mode not in (1, 2, 3):
        return jsonify({'status': 'error', 'message': 'mode must be 1, 2 or 3'}), 400
    get_node().set_mode(int(mode))
    return jsonify({'status': 'success'})


@bp.get('/atlas/hostname')
def get_hostname():
    return jsonify({'hostname': socket.gethostname()})


@bp.get('/atlas/status')
def get_status():
    return jsonify(get_node().get_status())
