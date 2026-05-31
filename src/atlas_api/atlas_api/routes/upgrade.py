import os
import subprocess
from flask import Blueprint, jsonify, request

bp = Blueprint('upgrade', __name__)

_UPGRADE_DIR = os.path.expanduser('~/.atlas/upgrades')


@bp.post('/atlas/upgrade')
def upgrade():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'no file field in form-data'}), 400
    f = request.files['file']
    os.makedirs(_UPGRADE_DIR, exist_ok=True)
    path = os.path.join(_UPGRADE_DIR, f.filename)
    f.save(path)
    os.chmod(path, 0o755)
    subprocess.Popen(['bash', path])
    return jsonify({'status': 'success',
                    'message': 'Upgrade started. System will restart automatically.'})
