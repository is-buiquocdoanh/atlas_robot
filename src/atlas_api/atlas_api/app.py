"""Flask application factory — registers all API blueprints."""
import os
from flask import Flask, jsonify, send_from_directory

_STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')

from .routes.system     import bp as system_bp
from .routes.chassis    import bp as chassis_bp
from .routes.navigation import bp as nav_bp
from .routes.map_api    import bp as map_bp
from .routes.waypoints  import bp as waypoints_bp
from .routes.route_api  import bp as route_bp
from .routes.layers     import bp as layers_bp
from .routes.settings   import bp as settings_bp
from .routes.upgrade    import bp as upgrade_bp

_ENDPOINTS = {
    'system': [
        'GET  /atlas/version',
        'GET  /atlas/mode',
        'POST /atlas/mode          {"mode": 1|2|3, "map": "<map_id>"}',
        'GET  /atlas/launch/status',
        'GET  /atlas/hostname',
        'GET  /atlas/status',
    ],
    'chassis': [
        'GET  /atlas/chassis/pose',
        'GET  /atlas/chassis/speed',
        'GET  /atlas/chassis/imu',
        'GET  /atlas/chassis/battery',
        'GET  /atlas/chassis/laser',
        'POST /atlas/chassis/move         {"vx":0.3,"vy":0,"wz":0}',
        'POST /atlas/chassis/max_speed    {"speed":0.5}',
        'POST /atlas/chassis/power/on',
        'POST /atlas/chassis/power/off',
    ],
    'navigation': [
        'GET  /atlas/nav/status',
        'POST /atlas/nav/goal             {"x":1.0,"y":2.0,"yaw":0.0}',
        'POST /atlas/nav/goal_name        {"name":"office"}',
        'POST /atlas/nav/goal_list        [{"x":...,"y":...,"yaw":...}, ...]',
        'POST /atlas/nav/cancel',
        'POST /atlas/nav/relocate         {"x":0.0,"y":0.0,"yaw":0.0}',
        'POST /atlas/nav/charge           {"name":"charging_pile"}',
    ],
    'map': [
        'GET  /atlas/map',
        'GET  /atlas/map/image            (PNG binary)',
        'GET  /atlas/map/current',
        'GET  /atlas/map/list',
        'POST /atlas/map/save             {"alias":"Floor 1"}',
        'POST /atlas/map/apply            {"name":"<map_id>"}',
        'POST /atlas/map/rename           {"name":"<id>","alias":"new name"}',
        'DEL  /atlas/map/<name>',
        'GET  /atlas/map/export/<name>',
        'POST /atlas/map/import           (multipart/form-data, field: file)',
    ],
    'waypoints': [
        'GET  /atlas/waypoints',
        'POST /atlas/waypoints            {"name":"A","type":"delivery","x":1,"y":2,"yaw":0}',
        'DEL  /atlas/waypoints/<name>',
    ],
    'route': [
        'GET  /atlas/route',
        'GET  /atlas/route/list',
        'POST /atlas/route                {"name":"p1","loop":true,"waypoints":[...]}',
        'DEL  /atlas/route/<name>',
        'POST /atlas/route/start          {"name":"p1"}',
        'POST /atlas/route/stop',
    ],
    'virtual_wall': [
        'GET  /atlas/virtual_wall',
        'POST /atlas/virtual_wall         {"walls":[{"id":"w1","points":[[x,y],...]}]}',
        'DEL  /atlas/virtual_wall',
    ],
    'special_area': [
        'GET  /atlas/special_area',
        'POST /atlas/special_area         {"areas":[{"id":"a1","type":0,"speed":0.3,"polygon":[...]}]}',
        'DEL  /atlas/special_area/<id>',
    ],
    'settings': [
        'GET  /atlas/settings',
        'POST /atlas/settings             {"max_speed":0.5,...}',
    ],
    'websocket': [
        'WS   ws://<host>:9090/           broadcast {"type":"status",...} @ 5 Hz',
    ],
}


def create_app() -> Flask:
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 256 * 1024 * 1024   # 256 MB upload limit

    for bp in (system_bp, chassis_bp, nav_bp, map_bp,
               waypoints_bp, route_bp, layers_bp, settings_bp, upgrade_bp):
        app.register_blueprint(bp)

    @app.get('/ui')
    @app.get('/ui/')
    def ui():
        return send_from_directory(_STATIC_DIR, 'index.html')

    @app.get('/')
    def index():
        return jsonify({
            'name':      'Atlas API',
            'version':   'v1.0.0',
            'rest':      'http://<host>:8080',
            'websocket': 'ws://<host>:9090',
            'endpoints': _ENDPOINTS,
        })

    @app.after_request
    def _cors(response):
        response.headers['Access-Control-Allow-Origin']  = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,DELETE,OPTIONS'
        return response

    return app
