from flask import Blueprint, jsonify, request
from ..ros_node import get_node

bp = Blueprint('waypoints', __name__)

_REQUIRED = ('name', 'x', 'y')


@bp.get('/atlas/waypoints')
def get_waypoints():
    return jsonify({'waypoints': get_node().get_waypoints()})


@bp.post('/atlas/waypoints')
def upsert_waypoint():
    data = request.get_json(force=True) or {}
    missing = [f for f in _REQUIRED if f not in data]
    if missing:
        return jsonify({'status': 'error', 'message': f'missing fields: {missing}'}), 400
    wp = {
        'name': str(data['name']),
        'type': str(data.get('type', 'custom')),
        'x':    float(data['x']),
        'y':    float(data['y']),
        'yaw':  float(data.get('yaw', 0.0)),
    }
    get_node().upsert_waypoint(wp)
    return jsonify({'status': 'success'})


@bp.delete('/atlas/waypoints/<name>')
def delete_waypoint(name):
    if not get_node().delete_waypoint(name):
        return jsonify({'status': 'error', 'message': f'waypoint "{name}" not found'}), 404
    return jsonify({'status': 'success'})
