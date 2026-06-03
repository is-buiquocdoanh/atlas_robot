"""
Map REST endpoints.

Maps are stored under <workspace>/src/a1_maps/<name>/<name>.{yaml,pgm,...}
On startup all existing maps in that directory are scanned into _map_store.
Falls back to ~/.atlas/maps if a1_maps cannot be located.
"""
import glob
import io
import os
import re
import shutil
import subprocess
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, send_file

from ..ros_node import get_node

bp = Blueprint('map_api', __name__)


# ── resolve maps directory ────────────────────────────────────────────────────

def _resolve_maps_dir() -> str:
    try:
        from ament_index_python.packages import get_package_share_directory
        pkg_dir = get_package_share_directory('a1_slam')
        ws_dir  = os.path.abspath(os.path.join(pkg_dir, '..', '..', '..', '..'))
        d = os.path.join(ws_dir, 'src', 'a1_maps')
        if os.path.isdir(d):
            return d
    except Exception:
        pass
    return os.path.expanduser('~/.atlas/maps')


_MAPS_DIR     = _resolve_maps_dir()
_map_store:   dict = {}   # name → {name, alias, path, created_at}
_current_map: dict = {'name': '', 'alias': '', 'path': ''}


# ── helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_name(alias: str) -> str:
    """Convert alias to a safe directory/file name."""
    s = re.sub(r'[^\w-]', '_', alias.strip()).strip('_')
    return s or 'map'


def _scan_maps():
    """Populate _map_store with maps already on disk (called once at startup)."""
    # Scan subdirectory maps: a1_maps/<dir>/<any>.yaml
    # and flat maps:          a1_maps/<any>.yaml
    patterns = [
        os.path.join(_MAPS_DIR, '*', '*.yaml'),
        os.path.join(_MAPS_DIR, '*.yaml'),
    ]
    seen_dirs = set()
    for yaml_path in sorted(p for pat in patterns for p in glob.glob(pat)):
        # Determine the key: use parent dir name for subdir maps, stem for flat maps
        parent = os.path.basename(os.path.dirname(yaml_path))
        stem   = os.path.splitext(os.path.basename(yaml_path))[0]
        is_subdir = (parent != os.path.basename(_MAPS_DIR))
        name = parent if is_subdir else stem

        if name in _map_store or name in seen_dirs:
            continue
        if is_subdir:
            seen_dirs.add(name)

        _map_store[name] = {
            'name':       name,
            'alias':      stem.replace('_', ' ').title(),
            'path':       yaml_path,
            'created_at': _now_iso(),
        }


_scan_maps()


# ── module-level helpers (imported by other routes) ───────────────────────────

def get_current_map_info() -> dict:
    return dict(_current_map)


def get_current_map_yaml() -> str:
    return _current_map.get('path', '')


def set_current_map(name: str) -> str:
    """Set current map by name key, return its yaml path."""
    if name in _map_store:
        entry = _map_store[name]
        _current_map.update({
            'name':  name,
            'alias': entry.get('alias', ''),
            'path':  entry.get('path', ''),
        })
    return get_current_map_yaml()


# ── PGM helpers ───────────────────────────────────────────────────────────────

def _read_pgm(path: str):
    """Read a binary PGM (P5) file. Returns (bytes, width, height)."""
    with open(path, 'rb') as f:
        magic = f.readline().strip()
        if magic != b'P5':
            raise ValueError(f'Not a P5 PGM: {magic}')
        line = f.readline()
        while line.startswith(b'#'):
            line = f.readline()
        w, h = map(int, line.split())
        f.readline()  # maxval
        return f.read(), w, h


def _grayscale_to_png(data: bytes, w: int, h: int) -> bytes:
    """Encode raw 8-bit grayscale bytes as a minimal PNG (pure Python)."""
    import struct, zlib
    def _chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)
    scanlines = b''.join(b'\x00' + data[r*w:(r+1)*w] for r in range(h))
    png = b'\x89PNG\r\n\x1a\n'
    png += _chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 0, 0, 0, 0))
    png += _chunk(b'IDAT', zlib.compress(scanlines, 6))
    png += _chunk(b'IEND', b'')
    return png


# ── image conversion ───────────────────────────────────────────────────────────

def _occupancy_to_pgm(data: bytes, width: int, height: int) -> bytes:
    """Convert ROS OccupancyGrid data to a PGM image (no external deps)."""
    buf = io.BytesIO()
    buf.write(f'P5\n{width} {height}\n255\n'.encode())
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
    try:
        import numpy as np
        import struct
        import zlib

        arr = np.frombuffer(data, dtype=np.int8).reshape((height, width))
        img = np.where(arr < 0, 127, np.where(arr == 0, 255, 0)).astype(np.uint8)
        img = np.flipud(img)

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


@bp.get('/atlas/map/has_posegraph/<path:name>')
def has_posegraph(name):
    """Check whether a map has slam_toolbox posegraph data (needed for incremental mapping)."""
    entry = _map_store.get(name)
    if not entry:
        return jsonify({'status': 'error', 'message': 'not found'}), 404
    base = os.path.splitext(entry.get('path', ''))[0]
    has_pg = os.path.exists(base + '.posegraph') and os.path.exists(base + '.data')
    return jsonify({'has_posegraph': has_pg, 'name': name})


@bp.get('/atlas/map/thumbnail/<path:name>')
def get_map_thumbnail(name):
    """Return a small PNG thumbnail for any saved map (reads its .pgm file)."""
    entry = _map_store.get(name)
    if not entry:
        return jsonify({'status': 'error', 'message': 'not found'}), 404
    yaml_path = entry.get('path', '')
    pgm_path  = os.path.splitext(yaml_path)[0] + '.pgm'
    if not os.path.exists(pgm_path):
        return jsonify({'status': 'error', 'message': 'pgm not found'}), 404
    try:
        data, w, h = _read_pgm(pgm_path)
        # Downsample to ≤200 px wide for thumbnail
        scale = max(1, w // 200)
        tw, th = w // scale, h // scale
        thumb = bytearray(tw * th)
        for ry in range(th):
            for rx in range(tw):
                thumb[ry * tw + rx] = data[(ry * scale) * w + (rx * scale)]
        png = _grayscale_to_png(bytes(thumb), tw, th)
        return send_file(io.BytesIO(png), mimetype='image/png')
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@bp.get('/atlas/map/image')
def get_map_image():
    data, meta = get_node().get_map_raw()
    if data is None or meta is None:
        return jsonify({'status': 'error', 'message': 'no map available yet'}), 503
    try:
        png  = _occupancy_to_png(data, meta['width'], meta['height'])
        mime = 'image/png'
    except Exception:
        png  = _occupancy_to_pgm(data, meta['width'], meta['height'])
        mime = 'image/x-portable-graymap'
    return send_file(io.BytesIO(png), mimetype=mime)


@bp.get('/atlas/map/current')
def get_current_map_ep():
    return jsonify(_current_map)


@bp.get('/atlas/map/list')
def list_maps():
    # Re-scan to pick up any maps added externally
    _scan_maps()
    return jsonify({'maps': list(_map_store.values())})


@bp.post('/atlas/map/save')
def save_map():
    body  = request.get_json(force=True) or {}
    alias = body.get('alias', 'unnamed')
    base  = _safe_name(alias)

    # Find a unique directory name under _MAPS_DIR
    name = base
    i = 1
    while os.path.exists(os.path.join(_MAPS_DIR, name)):
        name = f'{base}_{i}'
        i += 1

    map_dir     = os.path.join(_MAPS_DIR, name)
    path_prefix = os.path.join(map_dir, name)
    yaml_path   = path_prefix + '.yaml'

    os.makedirs(map_dir, exist_ok=True)
    node = get_node()

    # ── Step 1: save .yaml + .pgm via map_saver_cli ──────────────────────
    map_saver_ok = False
    try:
        subprocess.run(
            ['ros2', 'run', 'nav2_map_server', 'map_saver_cli', '-f', path_prefix],
            timeout=15, check=True, capture_output=True,
        )
        map_saver_ok = True
    except Exception as e:
        node.get_logger().warn(f'map_saver_cli: {e}')

    # ── Step 2: save .posegraph + .data via slam_toolbox serialize ────────
    # Only available when slam_toolbox is running (mapping modes 1 / 3).
    posegraph_ok  = False
    posegraph_msg = 'skipped (slam not running)'
    ok, msg = node.serialize_slam_map(path_prefix)
    if ok:
        posegraph_ok  = True
        posegraph_msg = 'saved'
    else:
        node.get_logger().warn(f'serialize_slam_map: {msg}')
        posegraph_msg = msg

    # ── Register in map store regardless (yaml/pgm are the minimum) ───────
    _map_store[name] = {
        'name':       name,
        'alias':      alias,
        'path':       yaml_path,
        'created_at': _now_iso(),
    }
    _current_map.update({'name': name, 'alias': alias, 'path': yaml_path})

    return jsonify({
        'status':    'success',
        'name':      name,
        'path':      yaml_path,
        'files': {
            'yaml_pgm':  map_saver_ok,
            'posegraph': posegraph_ok,
            'posegraph_note': posegraph_msg,
        },
    })


@bp.post('/atlas/map/apply')
def apply_map():
    body = request.get_json(force=True) or {}
    name = body.get('name', '')
    if name not in _map_store:
        return jsonify({'status': 'error', 'message': f'map "{name}" not found'}), 404

    entry = _map_store[name]
    _current_map.update({
        'name':  name,
        'alias': entry.get('alias', ''),
        'path':  entry.get('path', ''),
    })

    yaml_path = entry.get('path', '')
    if yaml_path and os.path.exists(yaml_path):
        try:
            from ..launch_manager import get_launch_manager
            lm = get_launch_manager()
            ls = lm.get_status()
            if ls.get('map_server') or ls.get('navigation'):
                lm.restart_map_server(yaml_path)
        except Exception:
            pass

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


@bp.delete('/atlas/map/<path:name>')
def delete_map(name):
    if name not in _map_store:
        return jsonify({'status': 'error', 'message': f'map "{name}" not found'}), 404

    entry    = _map_store.pop(name)
    yaml_dir = os.path.dirname(entry.get('path', ''))

    # If the map lives in its own subdirectory inside _MAPS_DIR, remove the whole dir
    if yaml_dir and os.path.dirname(yaml_dir) == _MAPS_DIR and os.path.isdir(yaml_dir):
        shutil.rmtree(yaml_dir, ignore_errors=True)
    else:
        # Flat map — remove individual files
        base = os.path.splitext(entry.get('path', ''))[0]
        for ext in ('.pgm', '.yaml', '.posegraph', '.data'):
            p = base + ext
            if os.path.exists(p):
                os.remove(p)

    return jsonify({'status': 'success'})


@bp.get('/atlas/map/export/<path:name>')
def export_map(name):
    if name not in _map_store:
        return jsonify({'status': 'error', 'message': 'map not found'}), 404
    yaml_path = _map_store[name].get('path', '')
    if not yaml_path or not os.path.exists(yaml_path):
        return jsonify({'status': 'error', 'message': 'map file not found on disk'}), 404
    return send_file(yaml_path, as_attachment=True,
                     download_name=f'{_map_store[name].get("alias", name)}.yaml')


@bp.post('/atlas/map/import')
def import_map():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'no file field in form-data'}), 400
    f    = request.files['file']
    base = _safe_name(os.path.splitext(f.filename)[0]) if f.filename else 'imported'
    name = base
    i = 1
    while os.path.exists(os.path.join(_MAPS_DIR, name)):
        name = f'{base}_{i}'
        i += 1

    map_dir   = os.path.join(_MAPS_DIR, name)
    yaml_path = os.path.join(map_dir, name + '.yaml')
    os.makedirs(map_dir, exist_ok=True)
    f.save(yaml_path)

    _map_store[name] = {
        'name':       name,
        'alias':      f.filename or name,
        'path':       yaml_path,
        'created_at': _now_iso(),
    }
    return jsonify({'status': 'success', 'name': name})
