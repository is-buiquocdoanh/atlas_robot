/**
 * map.js — 2D Map canvas engine
 *
 * Coordinate systems:
 *   World:  metres, ROS convention (x right, y up)
 *   Image:  pixels in the OccupancyGrid image (x right, y down; Y-flipped from world)
 *   Canvas: CSS pixels on the <canvas> element
 *   Screen: physical pixels (canvas * devicePixelRatio)
 *
 * The user controls zoom + pan.  All overlays (robot, laser, walls…) are
 * drawn in world→canvas transformed coordinates.
 */
'use strict';

window.MapEngine = (() => {

  /* ── State ────────────────────────────────────────────────────────────── */
  let _canvas, _ctx, _bg;
  let _meta   = null;   // {width,height,resolution,origin:{x,y}}
  let _zoom   = 1.0;
  let _panX   = 0, _panY = 0;

  // Robot state
  let _pose  = { x: 0, y: 0, yaw: 0 };
  let _laser = [];          // [{x,y}] world coords (converted from API pixel-offsets)

  // Overlays
  let _waypoints  = [];   // [{name,type,x,y,yaw}]
  let _routes     = [];   // [{name,waypoints:[{x,y,yaw}]}]
  let _walls      = [];   // [{id,points:[{x,y}]}]  world coords
  let _areas      = [];   // [{id,name,type,speed,polygon:[{x,y}]}]  world coords
  let _goalWorld  = null; // {x,y} or null
  let _path       = [];   // [{x,y}] world

  // Active tool
  let _tool   = 'nav';    // 'pan'|'nav'|'relocate'|'position'|'wall'|'area'|'measure'
  let _toolCb = null;     // called when tool action completes: fn(worldPos) or fn(points)

  // Drawing in progress
  let _drawPts  = [];     // points being drawn
  let _drawMouse = null;  // current mouse world pos while drawing
  let _measureA = null, _measureB = null;

  // Pan drag
  let _drag = null;       // {startX,startY,panX0,panY0}

  // Callbacks
  let _onContext = null;  // fn(worldPos, canvasPos)

  /* ── Init ─────────────────────────────────────────────────────────────── */
  function init(canvasId, bgId, { onContext } = {}) {
    _canvas = document.getElementById(canvasId);
    _bg     = document.getElementById(bgId);
    _ctx    = _canvas.getContext('2d');
    _onContext = onContext;

    _canvas.addEventListener('mousedown',  _onMouseDown);
    _canvas.addEventListener('mousemove',  _onMouseMove);
    _canvas.addEventListener('mouseup',    _onMouseUp);
    _canvas.addEventListener('click',      _onClick);
    _canvas.addEventListener('dblclick',   _onDblClick);
    _canvas.addEventListener('contextmenu',_onContextMenu);
    _canvas.addEventListener('wheel',      _onWheel, { passive: false });

    new ResizeObserver(_resize).observe(_canvas.parentElement);
    _resize();
    _renderLoop();
  }

  /* ── Resize ───────────────────────────────────────────────────────────── */
  function _resize() {
    if (!_canvas) return;
    const p = _canvas.parentElement;
    _canvas.width  = p.clientWidth;
    _canvas.height = p.clientHeight;
    if (_meta) _fitMap();
  }

  /* ── Coordinate transforms ────────────────────────────────────────────── */
  function _worldToCanvas(wx, wy) {
    if (!_meta) return { x: _canvas.width/2, y: _canvas.height/2 };
    const { resolution, origin, width, height } = _meta;
    // World → image pixel
    const ix = (wx - origin.x) / resolution;
    const iy = height - (wy - origin.y) / resolution;  // Y flip
    // Image pixel → canvas (with zoom + pan)
    const scX = _canvas.width  / width;
    const scY = _canvas.height / height;
    return {
      x: ix * scX * _zoom + _panX,
      y: iy * scY * _zoom + _panY,
    };
  }

  function _canvasToWorld(cx, cy) {
    if (!_meta) return { x: 0, y: 0 };
    const { resolution, origin, width, height } = _meta;
    const scX = _canvas.width  / width;
    const scY = _canvas.height / height;
    const ix = (cx - _panX) / (scX * _zoom);
    const iy = (cy - _panY) / (scY * _zoom);
    return {
      x: origin.x + ix * resolution,
      y: origin.y + (height - iy) * resolution,
    };
  }

  function _worldDist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /* ── Fit map to canvas on load ────────────────────────────────────────── */
  function _fitMap() {
    if (!_meta || !_canvas.width) return;
    const scX = _canvas.width  / _meta.width;
    const scY = _canvas.height / _meta.height;
    _zoom = Math.min(scX, scY) * 0.95;
    const mapW = _meta.width  * scX * _zoom;
    const mapH = _meta.height * scY * _zoom;
    _panX = (_canvas.width  - mapW) / 2;
    _panY = (_canvas.height - mapH) / 2;
  }

  /* ── Main render loop ─────────────────────────────────────────────────── */
  function _renderLoop() {
    _render();
    requestAnimationFrame(_renderLoop);
  }

  function _render() {
    const W = _canvas.width, H = _canvas.height;
    _ctx.clearRect(0, 0, W, H);

    if (!_meta) {
      _ctx.fillStyle = '#1f2937';
      _ctx.font = '14px sans-serif';
      _ctx.fillStyle = '#6b7280';
      _ctx.textAlign = 'center';
      _ctx.fillText('Waiting for map…', W/2, H/2);
      _ctx.textAlign = 'left';
      return;
    }

    // Position the bg image
    const scX = _canvas.width  / _meta.width;
    const scY = _canvas.height / _meta.height;
    if (_bg.naturalWidth) {
      _bg.style.transform =
        `translate(${_panX}px, ${_panY}px) scale(${scX * _zoom}, ${scY * _zoom})`;
    }

    _drawAreas();
    _drawWalls();
    _drawRoutes();
    _drawLaser();
    _drawGoal();
    _drawWaypoints();
    _drawRobot();
    _drawDrawingInProgress();
    _drawMeasure();
    _updateScaleBar();
  }

  /* ── Overlay draws ────────────────────────────────────────────────────── */
  function _drawRobot() {
    const { x, y } = _worldToCanvas(_pose.x, _pose.y);
    const yaw = _pose.yaw;
    const s = 14 * Math.min(_zoom, 1.5);

    _ctx.save();
    _ctx.translate(x, y);
    _ctx.rotate(-yaw);  // ROS CCW → canvas CW

    // Glow
    const grad = _ctx.createRadialGradient(0,0,0, 0,0,s*2);
    grad.addColorStop(0, 'rgba(37,99,235,.3)');
    grad.addColorStop(1, 'rgba(37,99,235,0)');
    _ctx.beginPath();
    _ctx.arc(0, 0, s*2, 0, Math.PI*2);
    _ctx.fillStyle = grad;
    _ctx.fill();

    // Arrow
    _ctx.beginPath();
    _ctx.moveTo(0, -s);
    _ctx.lineTo(-s*.65, s*.75);
    _ctx.lineTo(0, s*.3);
    _ctx.lineTo(s*.65, s*.75);
    _ctx.closePath();
    _ctx.fillStyle = '#2563eb';
    _ctx.fill();
    _ctx.strokeStyle = '#fff';
    _ctx.lineWidth = 1.5;
    _ctx.stroke();

    _ctx.beginPath();
    _ctx.arc(0, 0, 3, 0, Math.PI*2);
    _ctx.fillStyle = '#fff';
    _ctx.fill();
    _ctx.restore();
  }

  function _drawLaser() {
    if (!_laser.length) return;
    _ctx.fillStyle = 'rgba(6,182,212,.7)';
    _laser.forEach(pt => {
      const c = _worldToCanvas(pt.x, pt.y);
      _ctx.beginPath();
      _ctx.arc(c.x, c.y, Math.max(1, 1.5 * _zoom), 0, Math.PI*2);
      _ctx.fill();
    });
    // Scan lines (subtle)
    const rob = _worldToCanvas(_pose.x, _pose.y);
    _ctx.strokeStyle = 'rgba(6,182,212,.05)';
    _ctx.lineWidth = .5;
    const step = Math.max(1, Math.floor(_laser.length / 80));
    _laser.forEach((pt, i) => {
      if (i % step) return;
      const c = _worldToCanvas(pt.x, pt.y);
      _ctx.beginPath();
      _ctx.moveTo(rob.x, rob.y);
      _ctx.lineTo(c.x, c.y);
      _ctx.stroke();
    });
  }

  function _drawWaypoints() {
    _waypoints.forEach(wp => {
      const c = _worldToCanvas(wp.x, wp.y);
      const r = 7 * Math.min(_zoom, 1.5);

      _ctx.beginPath();
      _ctx.arc(c.x, c.y, r, 0, Math.PI*2);
      _ctx.fillStyle = wp.type === 'charger' ? '#f59e0b' :
                       wp.type === 'delivery' ? '#7c3aed' : '#059669';
      _ctx.fill();
      _ctx.strokeStyle = '#fff';
      _ctx.lineWidth = 1.5;
      _ctx.stroke();

      _ctx.fillStyle = '#fff';
      _ctx.font = `bold ${Math.max(9, 10 * _zoom)}px sans-serif`;
      _ctx.textAlign = 'center';
      _ctx.fillText(wp.name, c.x, c.y - r - 4);
      _ctx.textAlign = 'left';
    });
  }

  function _drawRoutes() {
    _routes.forEach(route => {
      const pts = route.waypoints;
      if (pts.length < 2) return;
      _ctx.save();
      _ctx.strokeStyle = '#3b82f6';
      _ctx.lineWidth = 2 * Math.min(_zoom, 1.5);
      _ctx.setLineDash([8, 5]);
      _ctx.globalAlpha = .7;
      _ctx.beginPath();
      pts.forEach((wp, i) => {
        const c = _worldToCanvas(wp.x, wp.y);
        i === 0 ? _ctx.moveTo(c.x, c.y) : _ctx.lineTo(c.x, c.y);
      });
      _ctx.stroke();
      _ctx.setLineDash([]);
      _ctx.restore();
    });
  }

  function _drawWalls() {
    _walls.forEach(wall => {
      const pts = wall.points;
      if (pts.length < 2) return;
      _ctx.save();
      _ctx.strokeStyle = '#dc2626';
      _ctx.lineWidth = Math.max(2, 2.5 * _zoom);
      _ctx.lineJoin = 'round';
      _ctx.lineCap  = 'round';
      _ctx.beginPath();
      pts.forEach((p, i) => {
        const c = _worldToCanvas(p.x, p.y);
        i === 0 ? _ctx.moveTo(c.x, c.y) : _ctx.lineTo(c.x, c.y);
      });
      _ctx.stroke();
      pts.forEach(p => {
        const c = _worldToCanvas(p.x, p.y);
        _ctx.beginPath();
        _ctx.arc(c.x, c.y, 3.5, 0, Math.PI*2);
        _ctx.fillStyle = '#dc2626';
        _ctx.fill();
      });
      _ctx.restore();
    });
  }

  function _drawAreas() {
    const COLORS = {
      slow:      { fill: 'rgba(234,179,8,.18)',  stroke: '#ca8a04' },
      forbidden: { fill: 'rgba(220,38,38,.18)',  stroke: '#dc2626' },
      trigger:   { fill: 'rgba(124,58,237,.18)', stroke: '#7c3aed' },
    };
    _areas.forEach(area => {
      if (area.polygon.length < 3) return;
      const col = COLORS[area.type] ?? COLORS.slow;
      _ctx.save();
      _ctx.beginPath();
      area.polygon.forEach((p, i) => {
        const c = _worldToCanvas(p.x, p.y);
        i === 0 ? _ctx.moveTo(c.x, c.y) : _ctx.lineTo(c.x, c.y);
      });
      _ctx.closePath();
      _ctx.fillStyle = col.fill;
      _ctx.fill();
      _ctx.strokeStyle = col.stroke;
      _ctx.lineWidth = 2;
      _ctx.stroke();
      // Label
      const cx = area.polygon.reduce((s,p) => s+p.x, 0) / area.polygon.length;
      const cy = area.polygon.reduce((s,p) => s+p.y, 0) / area.polygon.length;
      const cc = _worldToCanvas(cx, cy);
      _ctx.fillStyle = col.stroke;
      _ctx.font = `bold ${Math.max(9, 11 * _zoom)}px sans-serif`;
      _ctx.textAlign = 'center';
      _ctx.fillText(area.name || area.type, cc.x, cc.y + 4);
      _ctx.textAlign = 'left';
      _ctx.restore();
    });
  }

  function _drawGoal() {
    if (!_goalWorld) return;
    const rob = _worldToCanvas(_pose.x, _pose.y);
    const g   = _worldToCanvas(_goalWorld.x, _goalWorld.y);

    // Line from robot to goal
    _ctx.save();
    _ctx.strokeStyle = 'rgba(234,179,8,.5)';
    _ctx.lineWidth = 1.5;
    _ctx.setLineDash([5,5]);
    _ctx.beginPath();
    _ctx.moveTo(rob.x, rob.y);
    _ctx.lineTo(g.x, g.y);
    _ctx.stroke();
    _ctx.setLineDash([]);

    // Star
    _drawStar(_ctx, g.x, g.y, 10 * Math.min(_zoom, 1.5), '#eab308');
    _ctx.fillStyle = '#eab308';
    _ctx.font = '11px sans-serif';
    _ctx.fillText('Goal', g.x + 12, g.y - 4);
    _ctx.restore();
  }

  function _drawStar(ctx, cx, cy, r, color) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = i*4*Math.PI/5 - Math.PI/2;
      const a2 = (i*4+2)*Math.PI/5 - Math.PI/2;
      i===0 ? ctx.moveTo(Math.cos(a1)*r, Math.sin(a1)*r)
            : ctx.lineTo(Math.cos(a1)*r, Math.sin(a1)*r);
      ctx.lineTo(Math.cos(a2)*(r/2), Math.sin(a2)*(r/2));
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  /* ── Drawing in progress ──────────────────────────────────────────────── */
  function _drawDrawingInProgress() {
    if (!_drawPts.length) return;
    const isArea = _tool === 'area';
    const isWall = _tool === 'wall';
    if (!isArea && !isWall) return;

    const pts = _drawMouse ? [..._drawPts, _drawMouse] : _drawPts;

    _ctx.save();
    _ctx.strokeStyle = isArea ? '#7c3aed' : '#dc2626';
    _ctx.lineWidth   = 2.5;
    _ctx.setLineDash([6, 4]);
    _ctx.lineJoin = 'round';
    _ctx.beginPath();
    pts.forEach((p, i) => {
      const c = _worldToCanvas(p.x, p.y);
      i === 0 ? _ctx.moveTo(c.x, c.y) : _ctx.lineTo(c.x, c.y);
    });
    if (isArea && pts.length > 2) _ctx.closePath();
    _ctx.stroke();
    _ctx.setLineDash([]);

    // Points
    _drawPts.forEach((p, i) => {
      const c = _worldToCanvas(p.x, p.y);
      _ctx.beginPath();
      _ctx.arc(c.x, c.y, i===0 ? 6 : 4, 0, Math.PI*2);
      _ctx.fillStyle = i===0 ? '#fff' : (isArea ? '#7c3aed' : '#dc2626');
      _ctx.fill();
      _ctx.strokeStyle = isArea ? '#7c3aed' : '#dc2626';
      _ctx.lineWidth = 2;
      _ctx.stroke();
    });
    _ctx.restore();
  }

  function _drawMeasure() {
    if (!_measureA) return;
    const a = _worldToCanvas(_measureA.x, _measureA.y);
    const b = _measureB ? _worldToCanvas(_measureB.x, _measureB.y)
                        : (_drawMouse ? _worldToCanvas(_drawMouse.x, _drawMouse.y) : null);
    if (!b) return;

    _ctx.save();
    _ctx.strokeStyle = '#10b981';
    _ctx.lineWidth = 2;
    _ctx.setLineDash([5,4]);
    _ctx.beginPath();
    _ctx.moveTo(a.x, a.y); _ctx.lineTo(b.x, b.y);
    _ctx.stroke();
    _ctx.setLineDash([]);

    const dist = _worldDist(_measureA, _measureB ?? _drawMouse);
    const mid  = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
    const tip  = document.getElementById('measure-tip');
    if (tip) {
      tip.hidden = false;
      tip.textContent = `${dist.toFixed(2)} m`;
      tip.style.left = (mid.x + 10) + 'px';
      tip.style.top  = (mid.y - 12) + 'px';
    }
    _ctx.restore();
  }

  function _updateScaleBar() {
    if (!_meta) return;
    // 60 canvas pixels = ? metres
    const worldDist = 60 / (_canvas.width / _meta.width) / _zoom * _meta.resolution;
    const label = worldDist > 1 ? `${worldDist.toFixed(1)} m` : `${(worldDist*100).toFixed(0)} cm`;
    const el = document.getElementById('scale-label');
    if (el) el.textContent = label;
  }

  /* ── Mouse events ─────────────────────────────────────────────────────── */
  function _onMouseDown(e) {
    if (e.button === 1 || _tool === 'pan') {
      _drag = { sx: e.clientX, sy: e.clientY, px0: _panX, py0: _panY };
      _canvas.style.cursor = 'grabbing';
    }
  }

  function _onMouseMove(e) {
    const rect = _canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (_canvas.width  / rect.width);
    const cy = (e.clientY - rect.top)  * (_canvas.height / rect.height);
    const world = _canvasToWorld(cx, cy);
    _drawMouse = world;

    // Pan
    if (_drag) {
      _panX = _drag.px0 + (e.clientX - _drag.sx);
      _panY = _drag.py0 + (e.clientY - _drag.sy);
    }

    // Update cursor pos display
    const el = document.getElementById('cursor-pos');
    if (el) el.textContent = `x: ${world.x.toFixed(2)}  y: ${world.y.toFixed(2)}`;
  }

  function _onMouseUp(e) {
    if (_drag) {
      _drag = null;
      _canvas.style.cursor = '';
    }
  }

  function _onClick(e) {
    if (e.button !== 0) return;
    if (_drag) return;  // was panning

    const rect   = _canvas.getBoundingClientRect();
    const cx     = (e.clientX - rect.left) * (_canvas.width  / rect.width);
    const cy     = (e.clientY - rect.top)  * (_canvas.height / rect.height);
    const world  = _canvasToWorld(cx, cy);

    if (_tool === 'wall' || _tool === 'area') {
      // Close area if near first point
      if (_tool === 'area' && _drawPts.length >= 3) {
        const first = _worldToCanvas(_drawPts[0].x, _drawPts[0].y);
        const dist  = Math.hypot(cx - first.x, cy - first.y);
        if (dist < 14) { _finishDraw(); return; }
      }
      _drawPts.push(world);
    } else if (_tool === 'nav') {
      _goalWorld = world;
      if (_toolCb) _toolCb(world);
    } else if (_tool === 'relocate') {
      if (_toolCb) _toolCb(world);
    } else if (_tool === 'position') {
      if (_toolCb) _toolCb(world);
    } else if (_tool === 'measure') {
      if (!_measureA) { _measureA = world; }
      else            { _measureB = world; }
    }
  }

  function _onDblClick(e) {
    if (_tool === 'wall' && _drawPts.length >= 2) _finishDraw();
    if (_tool === 'area' && _drawPts.length >= 3) _finishDraw();
    if (_tool === 'measure') {
      _measureA = null; _measureB = null;
      const tip = document.getElementById('measure-tip');
      if (tip) tip.hidden = true;
    }
  }

  function _onContextMenu(e) {
    e.preventDefault();
    // Undo last draw point
    if ((_tool === 'wall' || _tool === 'area') && _drawPts.length > 0) {
      _drawPts.pop();
      return;
    }
    const rect  = _canvas.getBoundingClientRect();
    const cx    = (e.clientX - rect.left) * (_canvas.width  / rect.width);
    const cy    = (e.clientY - rect.top)  * (_canvas.height / rect.height);
    const world = _canvasToWorld(cx, cy);
    if (_onContext) _onContext(world, { x: e.clientX, y: e.clientY });
  }

  function _onWheel(e) {
    e.preventDefault();
    const rect = _canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) * (_canvas.width  / rect.width);
    const my   = (e.clientY - rect.top)  * (_canvas.height / rect.height);
    const delta = e.deltaY > 0 ? 0.87 : 1.15;
    const newZoom = Math.max(0.15, Math.min(12, _zoom * delta));
    // Zoom toward mouse position
    _panX = mx - (mx - _panX) * (newZoom / _zoom);
    _panY = my - (my - _panY) * (newZoom / _zoom);
    _zoom = newZoom;
  }

  /* ── Drawing finalization ─────────────────────────────────────────────── */
  function _finishDraw() {
    if (!_drawPts.length) return;
    const pts = [..._drawPts];
    _drawPts  = [];
    _drawMouse = null;
    if (_toolCb) _toolCb(pts);
  }

  function cancelDraw() {
    _drawPts = [];
    _drawMouse = null;
  }

  /* ── Public API ───────────────────────────────────────────────────────── */
  function setTool(tool, cb) {
    _tool   = tool;
    _toolCb = cb ?? null;
    _drawPts = [];
    _drawMouse = null;
    _measureA = null; _measureB = null;

    const tip = document.getElementById('measure-tip');
    if (tip) tip.hidden = true;

    const hint = document.getElementById('draw-hint');
    const msgs = {
      wall:     '🖱 Click to place points · Right-click to undo · Double-click to finish',
      area:     '🖱 Click to place vertices · Click near start to close · Right-click to undo',
      position: '🖱 Click on map to place waypoint',
      relocate: '🖱 Click to set initial pose',
      nav:      '🖱 Click to set navigation goal',
      measure:  '🖱 Click start · Click end · Double-click to reset',
      pan:      '',
    };
    if (hint) {
      const msg = msgs[tool] ?? '';
      hint.hidden = !msg;
      hint.textContent = msg;
    }

    const cursors = {
      wall: 'tool-active-wall', area: 'tool-active-area',
      position: 'tool-active-pos', nav: 'tool-active-nav',
      relocate: 'tool-active-reloc', pan: 'tool-pan', measure: 'crosshair',
    };
    _canvas.className = cursors[tool] ?? '';
  }

  async function loadMap() {
    const r = await API.get('/atlas/map');
    if (r.ok && r.data.width) {
      _meta = {
        width:      r.data.width,
        height:     r.data.height,
        resolution: r.data.resolution,
        origin:     r.data.origin ?? { x: 0, y: 0 },
      };
      _bg.src = `http://${Cfg.restHost}/atlas/map/image?_=${Date.now()}`;
      _bg.onload = _fitMap;
    }
  }

  function setLaserWorld(coords, poseX, poseY) {
    // coords are pixel-offsets from ros_node (scale=20, res=0.05)
    if (!_meta) return;
    _laser = coords.map(([lx, ly]) => ({
      x: poseX + lx * _meta.resolution,
      y: poseY + ly * _meta.resolution,
    }));
  }

  function setPose(p)       { _pose = p; }
  function setGoal(w)       { _goalWorld = w; }
  function clearGoal()      { _goalWorld = null; }
  function setWaypoints(w)  { _waypoints = w; }
  function setRoutes(r)     { _routes = r; }
  function setWalls(w)      { _walls = w; }
  function setAreas(a)      { _areas = a; }
  function setPath(p)       { _path = p; }
  function getZoom()        { return _zoom; }
  function getMeta()        { return _meta; }

  function zoomIn()    { _zoom = Math.min(12, _zoom * 1.2); }
  function zoomOut()   { _zoom = Math.max(.15, _zoom / 1.2); }
  function resetView() { if (_meta) _fitMap(); }

  return {
    init, loadMap, setTool, cancelDraw,
    setPose, setLaserWorld, setGoal, clearGoal,
    setWaypoints, setRoutes, setWalls, setAreas, setPath,
    zoomIn, zoomOut, resetView, getMeta, getZoom,
  };
})();
