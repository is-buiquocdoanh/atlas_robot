"""
Map REST endpoints.

Map files are persisted under ~/.atlas/maps/.
The current occupancy grid is streamed live from the /map ROS topic.
"""
import io
import os
import subprocess
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, send_file

from ..ros_node import get_node

bp = Blueprint('map_api', __name__)

_MAPS_DIR    = os.path.expanduser('~/.atlas/maps')
_map_store:  dict = {}          # name → {name, alias, created_at}
_current_map: dict = {'name': '', 'alias': ''}


# ── helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _occupancy_to_pgm(data: bytes, width: int, height: int) -> bytes:
    """Convert ROS OccupancyGrid data to a PGM image (no external deps)."""
    buf = io.BytesIO()
    buf.write(f'P5\n{width} {height}\n255\n'.encode())
    # Flip rows: ROS origin is bottom-left, image origin is top-left
    rows = []
    for row in range(height):
        start = row * width
        rows.append(data[start:start + width])
    for row in reversed(rows):
        for b in row:
            v = int.from_bytes([b], byteorder='little', signed=True)
            pixel = 127 if v < 0 else (255 if v == 0 else 0)
            buf.write(bytes([pixel]))
    buf.seek(0)
    return buf.read()


def _occupancy_to_png(data: bytes, width: int, height: int) -> bytes:
    """Convert to PNG using numpy if available, else fall back to PGM."""
    try:
        import numpy as np
        arr = np.frombuffer(data, dtype=np.int8).reshape((height, width))
        img = np.where(arr < 0, 127, np.where(arr == 0, 255, 0)).astype(np.uint8)
        img = np.flipud(img)

        # Encode as PNG via stdlib zlib
        import zlib
        import struct

        def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
            c = chunk_type + data
            return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

        scanlines = b''.join(b'\x00' + img[row].tobytes() for row in range(height))
        compressed = zlib.compress(scanlines, 9)

        png = b'\x89PNG\r\n\x1a\n'
        png += _png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 0, 0, 0, 0))
        png += _png_chunk(b'IDAT', compressed)
        png += _png_chunk(b'IEND', b'')
        return png
    except ImportError:
        return _occupancy_to_pgm(data, width, height)


# ── endpoints ─────────────────────────────────────────────────────────────────

@bp.get('/atlas/map')
def get_map():
    meta = get_node().get_map_meta()
    if meta is None:
        return jsonify({'status': 'error', 'message': 'no map available yet'}), 503
    return jsonify({**meta, **_current_map, 'image_url': '/atlas/map/image'})


@bp.get('/atlas/map/image')
def get_map_image():
    data, meta = get_node().get_map_raw()
    if data is None or meta is None:
        return jsonify({'status': 'error', 'message': 'no map available yet'}), 503

    try:
        png = _occupancy_to_png(data, meta['width'], meta['height'])
        mime = 'image/png'
    except Exception:
        png  = _occupancy_to_pgm(data, meta['width'], meta['height'])
        mime = 'image/x-portable-graymap'

    return send_file(io.BytesIO(png), mimetype=mime)


@bp.get('/atlas/map/current')
def get_current_map():
    return jsonify(_current_map)


@bp.get('/atlas/map/list')
def list_maps():
    return jsonify({'maps': list(_map_store.values())})


@bp.post('/atlas/map/save')
def save_map():
    body  = request.get_json(force=True) or {}
    alias = body.get('alias', 'unnamed')
    name  = uuid.uuid4().hex[:16]

    os.makedirs(_MAPS_DIR, exist_ok=True)
    path = os.path.join(_MAPS_DIR, name)
    try:
        subprocess.run(
            ['ros2', 'run', 'nav2_map_server', 'map_saver_cli', '-f', path],
            timeout=15, check=True, capture_output=True,
        )
    except Exception as e:
        get_node().get_logger().warn(f'map_saver_cli: {e}')

    _map_store[name] = {'name': name, 'alias': alias, 'created_at': _now_iso()}
    _current_map.update({'name': name, 'alias': alias})
    return jsonify({'status': 'success', 'name': name})


@bp.post('/atlas/map/apply')
def apply_map():
    body = request.get_json(force=True) or {}
    name = body.get('name', '')
    if name not in _map_store:
        return jsonify({'status': 'error', 'message': f'map "{name}" not found'}), 404

    _current_map.update({'name': name, 'alias': _map_store[name].get('alias', '')})

    yaml_path = os.path.join(_MAPS_DIR, name + '.yaml')
    if os.path.exists(yaml_path):
        subprocess.Popen([
            'ros2', 'run', 'nav2_map_server', 'map_server',
            '--ros-args', '-p', f'yaml_filename:={yaml_path}',
        ])
    return jsonify({'status': 'success'})


@bp.post('/atlas/map/rename')
def rename_map():
    body  = request.get_json(force=True) or {}
    name  = body.get('name', '')
    alias = body.get('alias', '')
    if name not in _map_store:
        return jsonify({'status': 'error', 'message': f'map "{name}" not found'}), 404
    _map_store[name]['alias'] = alias
    if _current_map['name'] == name:
        _current_map['alias'] = alias
    return jsonify({'status': 'success'})


@bp.delete('/atlas/map/<name>')
def delete_map(name):
    if name not in _map_store:
        return jsonify({'status': 'error', 'message': f'map "{name}" not found'}), 404
    _map_store.pop(name)
    for ext in ('.pgm', '.yaml', '.posegraph', '.data'):
        p = os.path.join(_MAPS_DIR, name + ext)
        if os.path.exists(p):
            os.remove(p)
    return jsonify({'status': 'success'})


@bp.get('/atlas/map/export/<name>')
def export_map(name):
    yaml_path = os.path.join(_MAPS_DIR, name + '.yaml')
    if not os.path.exists(yaml_path):
        return jsonify({'status': 'error', 'message': 'map file not found on disk'}), 404
    return send_file(yaml_path, as_attachment=True, download_name=f'{name}.yaml')


@bp.post('/atlas/map/import')
def import_map():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'no file field in form-data'}), 400
    f    = request.files['file']
    name = uuid.uuid4().hex[:16]
    os.makedirs(_MAPS_DIR, exist_ok=True)
    f.save(os.path.join(_MAPS_DIR, name + '.yaml'))
    _map_store[name] = {'name': name, 'alias': f.filename, 'created_at': _now_iso()}
    return jsonify({'status': 'success', 'name': name})
