from flask import Blueprint, jsonify, request
from ..ros_node import get_node

bp = Blueprint('route_api', __name__)

_active_route: str = ''


@bp.get('/atlas/route')
def get_route():
    route = get_node().get_route()
    if route is None:
        return jsonify({'status': 'error', 'message': 'no route defined'}), 404
    return jsonify(route)


@bp.get('/atlas/route/list')
def list_routes():
    return jsonify({'routes': get_node().get_routes()})


@bp.post('/atlas/route')
def save_route():
    data = request.get_json(force=True) or {}
    if 'name' not in data or 'waypoints' not in data:
        return jsonify({'status': 'error', 'message': 'name and waypoints required'}), 400
    route = {
        'name':      str(data['name']),
        'loop':      bool(data.get('loop', False)),
        'waypoints': data['waypoints'],
    }
    get_node().upsert_route(route)
    return jsonify({'status': 'success'})


@bp.delete('/atlas/route/<name>')
def delete_route(name):
    if not get_node().delete_route(name):
        return jsonify({'status': 'error', 'message': f'route "{name}" not found'}), 404
    return jsonify({'status': 'success'})


@bp.post('/atlas/route/start')
def start_route():
    global _active_route
    data  = request.get_json(force=True) or {}
    name  = data.get('name', '')
    route = get_node().get_route(name)
    if not route:
        return jsonify({'status': 'error', 'message': f'route "{name}" not found'}), 404
    ok, msg = get_node().send_route_goal(route['waypoints'])
    if not ok:
        return jsonify({'status': 'error', 'message': msg}), 503
    _active_route = name
    return jsonify({'status': 'success'})


@bp.post('/atlas/route/stop')
def stop_route():
    global _active_route
    _active_route = ''
    get_node().cancel_nav()
    return jsonify({'status': 'success'})
