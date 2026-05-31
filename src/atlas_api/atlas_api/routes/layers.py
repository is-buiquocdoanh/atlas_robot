"""Virtual wall and special area endpoints."""
import uuid
from flask import Blueprint, jsonify, request
from ..ros_node import get_node

bp = Blueprint('layers', __name__)


# ── Virtual Wall ──────────────────────────────────────────────────────────────

@bp.get('/atlas/virtual_wall')
def get_virtual_wall():
    return jsonify({'walls': get_node().get_virtual_walls()})


@bp.post('/atlas/virtual_wall')
def set_virtual_wall():
    data  = request.get_json(force=True) or {}
    walls = data.get('walls', [])
    get_node().set_virtual_walls(walls)
    return jsonify({'status': 'success'})


@bp.delete('/atlas/virtual_wall')
def clear_virtual_wall():
    get_node().set_virtual_walls([])
    return jsonify({'status': 'success'})


# ── Special Area ──────────────────────────────────────────────────────────────

@bp.get('/atlas/special_area')
def get_special_area():
    return jsonify({'areas': get_node().get_special_areas()})


@bp.post('/atlas/special_area')
def set_special_area():
    data  = request.get_json(force=True) or {}
    areas = data.get('areas', [])
    for a in areas:
        if 'id' not in a:
            a['id'] = uuid.uuid4().hex[:8]
    get_node().set_special_areas(areas)
    return jsonify({'status': 'success'})


@bp.delete('/atlas/special_area/<area_id>')
def delete_special_area(area_id):
    if not get_node().delete_special_area(area_id):
        return jsonify({'status': 'error', 'message': f'area "{area_id}" not found'}), 404
    return jsonify({'status': 'success'})
