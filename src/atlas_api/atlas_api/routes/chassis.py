from flask import Blueprint, jsonify, request
from ..ros_node import get_node

bp = Blueprint('chassis', __name__)

_MAX_LIN = 2.0
_MAX_ANG = 3.5


@bp.get('/atlas/chassis/pose')
def get_pose():
    return jsonify(get_node().get_pose())


@bp.get('/atlas/chassis/speed')
def get_speed():
    return jsonify(get_node().get_speed())


@bp.get('/atlas/chassis/imu')
def get_imu():
    return jsonify(get_node().get_imu())


@bp.get('/atlas/chassis/battery')
def get_battery():
    return jsonify(get_node().get_battery())


@bp.get('/atlas/chassis/laser')
def get_laser():
    return jsonify(get_node().get_laser())


@bp.post('/atlas/chassis/move')
def move():
    data = request.get_json(force=True) or {}
    vx = max(-_MAX_LIN, min(_MAX_LIN, float(data.get('vx', 0.0))))
    vy = max(-_MAX_LIN, min(_MAX_LIN, float(data.get('vy', 0.0))))
    wz = max(-_MAX_ANG, min(_MAX_ANG, float(data.get('wz', 0.0))))
    get_node().publish_twist(vx, vy, wz)
    return jsonify({'status': 'success'})


@bp.post('/atlas/chassis/max_speed')
def set_max_speed():
    data = request.get_json(force=True) or {}
    try:
        speed = float(data['speed'])
    except (KeyError, ValueError):
        return jsonify({'status': 'error', 'message': 'speed field required'}), 400
    if not (0.1 <= speed <= 1.0):
        return jsonify({'status': 'error', 'message': 'speed must be 0.1–1.0 m/s'}), 400
    get_node().update_settings({'max_speed': speed})
    return jsonify({'status': 'success'})


@bp.post('/atlas/chassis/power/on')
def power_on():
    get_node().update_settings({'external_power': True})
    return jsonify({'status': 'success'})


@bp.post('/atlas/chassis/power/off')
def power_off():
    get_node().update_settings({'external_power': False})
    return jsonify({'status': 'success'})
