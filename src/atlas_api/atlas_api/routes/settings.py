from flask import Blueprint, jsonify, request
from ..ros_node import get_node

bp = Blueprint('settings', __name__)


@bp.get('/atlas/settings')
def get_settings():
    return jsonify(get_node().get_settings())


@bp.post('/atlas/settings')
def update_settings():
    data = request.get_json(force=True) or {}
    get_node().update_settings(data)
    return jsonify({'status': 'success'})
