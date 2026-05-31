from flask import Blueprint, jsonify, request
from ..ros_node import get_node

bp = Blueprint('navigation', __name__)


@bp.get('/atlas/nav/status')
def nav_status():
    return jsonify(get_node().get_nav_status())


@bp.post('/atlas/nav/goal')
def nav_goal():
    data = request.get_json(force=True) or {}
    try:
        x   = float(data['x'])
        y   = float(data['y'])
        yaw = float(data.get('yaw', 0.0))
    except (KeyError, ValueError) as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

    ok, msg = get_node().send_nav_goal(x, y, yaw)
    if not ok:
        return jsonify({'status': 'error', 'message': msg}), 503
    return jsonify({'status': 'success'})


@bp.post('/atlas/nav/goal_name')
def nav_goal_name():
    data = request.get_json(force=True) or {}
    name = data.get('name', '')
    wps  = {w['name']: w for w in get_node().get_waypoints()}
    wp   = wps.get(name)
    if not wp:
        return jsonify({'status': 'error', 'message': f'waypoint "{name}" not found'}), 404
    ok, msg = get_node().send_nav_goal(wp['x'], wp['y'], wp.get('yaw', 0.0))
    if not ok:
        return jsonify({'status': 'error', 'message': msg}), 503
    return jsonify({'status': 'success'})


@bp.post('/atlas/nav/goal_list')
def nav_goal_list():
    data = request.get_json(force=True)
    if not isinstance(data, list) or len(data) == 0:
        return jsonify({'status': 'error', 'message': 'body must be a non-empty list'}), 400
    ok, msg = get_node().send_route_goal(data)
    if not ok:
        return jsonify({'status': 'error', 'message': msg}), 503
    return jsonify({'status': 'success'})


@bp.post('/atlas/nav/cancel')
def nav_cancel():
    get_node().cancel_nav()
    return jsonify({'status': 'success'})


@bp.post('/atlas/nav/relocate')
def relocate():
    data = request.get_json(force=True) or {}
    try:
        x   = float(data['x'])
        y   = float(data['y'])
        yaw = float(data.get('yaw', 0.0))
    except (KeyError, ValueError) as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400
    get_node().publish_initialpose(x, y, yaw)
    return jsonify({'status': 'success'})


@bp.post('/atlas/nav/charge')
def nav_charge():
    data        = request.get_json(force=True) or {}
    charge_name = data.get('name', 'charging_pile')
    wps         = {w['name']: w for w in get_node().get_waypoints()}
    wp          = wps.get(charge_name)
    if not wp:
        return jsonify({'status': 'error',
                        'message': f'charging waypoint "{charge_name}" not found'}), 404
    ok, msg = get_node().send_nav_goal(wp['x'], wp['y'], wp.get('yaw', 0.0))
    if not ok:
        return jsonify({'status': 'error', 'message': msg}), 503
    return jsonify({'status': 'success'})
