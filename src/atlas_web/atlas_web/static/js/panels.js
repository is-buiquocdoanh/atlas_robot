/**
 * panels.js — Panel content for each nav item.
 * Each panel function renders HTML into #nav-panel-inner and binds events.
 */
'use strict';

/* ── Shared helpers ──────────────────────────────────────────────────────── */
const P = {
  root: () => document.getElementById('nav-panel-inner'),

  render(html) {
    const el = this.root();
    if (el) el.innerHTML = html;
    return el;
  },

  get(id) { return document.getElementById(id); },

  on(id, ev, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  },
};

/* ── State (synced from main.js) ─────────────────────────────────────────── */
window.PanelState = {
  waypoints: [],
  routes:    [],
  walls:     [],
  areas:     [],
  maps:      [],
  logs:      [],
  status:    {},
  settings:  {},
};

/* ══════════════════════════════════════════════════════════════════════════
   1. NAVI MODE
   ══════════════════════════════════════════════════════════════════════════ */
window.renderNaviMode = function() {
  const s = PanelState.status;
  const p = s.pose ?? {};
  P.render(`
    <div class="panel-title">Navigation Mode</div>
    <div class="p-card">
      <div class="p-card-header">Robot Status</div>
      <div class="kv-grid">
        <div class="kv-row"><span class="kv-key">State</span>
          <span class="kv-val" id="nm-state">
            <span class="badge badge-${s.nav_state==='navigating'?'nav':'idle'}">${s.nav_state??'idle'}</span>
          </span></div>
        <div class="kv-row"><span class="kv-key">Position</span>
          <span class="kv-val">(${f2(p.x)}, ${f2(p.y)})</span></div>
        <div class="kv-row"><span class="kv-key">Heading</span>
          <span class="kv-val">${deg(p.yaw)}°</span></div>
        <div class="kv-row"><span class="kv-key">Speed</span>
          <span class="kv-val">${f2(s.linear_speed)} m/s</span></div>
        <div class="kv-row"><span class="kv-key">Battery</span>
          <span class="kv-val">${f1(s.battery)}%</span></div>
        <div class="kv-row"><span class="kv-key">E-Stop</span>
          <span class="kv-val ${s.emergency_stop?'badge badge-err':'badge badge-ok'}">${s.emergency_stop?'ACTIVE':'Off'}</span></div>
      </div>
    </div>

    <div class="p-card">
      <div class="p-card-header">Send Goal</div>
      <div class="pf-row3">
        <div><label class="pf-label">X (m)</label><input class="pf-input" id="nm-gx" type="number" value="${f3(p.x)}" step="0.1"></div>
        <div><label class="pf-label">Y (m)</label><input class="pf-input" id="nm-gy" type="number" value="${f3(p.y)}" step="0.1"></div>
        <div><label class="pf-label">θ (°)</label><input class="pf-input" id="nm-gt" type="number" value="0" step="5"></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary btn-sm" id="nm-btn-go">✈ Navigate</button>
        <button class="btn btn-secondary btn-sm" id="nm-btn-cancel">✖ Cancel</button>
        <button class="btn btn-secondary btn-sm" id="nm-btn-click">🖱 Click map</button>
      </div>
    </div>

    <div class="p-card">
      <div class="p-card-header">Relocate</div>
      <div class="pf-row3">
        <div><label class="pf-label">X</label><input class="pf-input" id="nm-rx" type="number" value="${f3(p.x)}" step="0.1"></div>
        <div><label class="pf-label">Y</label><input class="pf-input" id="nm-ry" type="number" value="${f3(p.y)}" step="0.1"></div>
        <div><label class="pf-label">θ (°)</label><input class="pf-input" id="nm-rt" type="number" value="${deg(p.yaw)}" step="5"></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary btn-sm" id="nm-btn-reloc">⊙ Set Pose</button>
        <button class="btn btn-secondary btn-sm" id="nm-btn-use-pose">📍 Current</button>
      </div>
    </div>
  `);

  P.on('nm-btn-go', 'click', async () => {
    const x = +P.get('nm-gx').value, y = +P.get('nm-gy').value;
    const yaw = +P.get('nm-gt').value * Math.PI / 180;
    const r = await API.post('/atlas/nav/goal', { x, y, yaw });
    r.ok ? (toast('Navigation started ▶'), MapEngine.setGoal({x,y}))
         : toast(r.data?.message ?? 'Error', 'err');
  });

  P.on('nm-btn-cancel', 'click', async () => {
    await API.post('/atlas/nav/cancel', {});
    MapEngine.clearGoal(); toast('Cancelled', 'info');
  });

  P.on('nm-btn-click', 'click', () => {
    MapEngine.setTool('nav', world => {
      P.get('nm-gx').value = f3(world.x);
      P.get('nm-gy').value = f3(world.y);
      toast('Goal set — click Navigate to confirm', 'info');
      MapEngine.setTool('nav');
    });
  });

  P.on('nm-btn-reloc', 'click', async () => {
    const x = +P.get('nm-rx').value, y = +P.get('nm-ry').value;
    const yaw = +P.get('nm-rt').value * Math.PI / 180;
    const r = await API.post('/atlas/nav/relocate', { x, y, yaw });
    r.ok ? toast('Pose set 📍') : toast(r.data?.message ?? 'Error', 'err');
  });

  P.on('nm-btn-use-pose', 'click', () => {
    const p2 = PanelState.status.pose ?? {};
    if (P.get('nm-rx')) P.get('nm-rx').value = f3(p2.x);
    if (P.get('nm-ry')) P.get('nm-ry').value = f3(p2.y);
    if (P.get('nm-rt')) P.get('nm-rt').value = deg(p2.yaw);
  });
};

/* ══════════════════════════════════════════════════════════════════════════
   2. BUILD MODE
   ══════════════════════════════════════════════════════════════════════════ */
window.renderBuildMode = function() {
  P.render(`
    <div class="panel-title">Build / Mapping Mode</div>
    <div class="p-card">
      <div class="p-card-header">Mode Control</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-primary btn-full" id="bm-start">▶ Start Mapping (mode 1)</button>
        <button class="btn btn-secondary btn-full" id="bm-incr">↑ Incremental Map (mode 3)</button>
        <button class="btn btn-secondary btn-full" id="bm-tonav">🧭 Switch to Navigation</button>
      </div>
    </div>
    <div class="p-card">
      <div class="p-card-header">Save Map</div>
      <label class="pf-label">Map Name / Alias</label>
      <input class="pf-input" id="bm-alias" type="text" placeholder="Warehouse Floor 1">
      <button class="btn btn-primary btn-full" id="bm-save">💾 Save Current Map</button>
    </div>
  `);

  P.on('bm-start',  'click', () => setMode(1));
  P.on('bm-incr',   'click', () => setMode(3));
  P.on('bm-tonav',  'click', () => setMode(2));
  P.on('bm-save', 'click', async () => {
    const alias = P.get('bm-alias').value.trim() || 'unnamed';
    const r = await API.post('/atlas/map/save', { alias });
    r.ok ? toast(`Map "${alias}" saved ✓`) : toast(r.data?.message ?? 'Save failed', 'err');
  });

  async function setMode(m) {
    const r = await API.post('/atlas/mode', { mode: m });
    r.ok ? toast(`Mode ${m} set`) : toast(r.data?.message ?? 'Error', 'err');
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   3. POSITION (Waypoints)
   ══════════════════════════════════════════════════════════════════════════ */
window.renderPosition = async function() {
  const r = await API.get('/atlas/waypoints');
  PanelState.waypoints = r.ok ? (r.data.waypoints ?? []) : [];
  MapEngine.setWaypoints(PanelState.waypoints);

  P.render(`
    <div class="panel-title">Positions / Waypoints
      <div class="pt-right">
        <button class="btn btn-primary btn-sm" id="wp-add-btn">+ Add</button>
      </div>
    </div>

    <div id="wp-add-form" class="p-card" style="display:none">
      <div class="p-card-header">New Waypoint</div>
      <label class="pf-label">Name</label>
      <input class="pf-input" id="wp-name" placeholder="office_desk">
      <label class="pf-label">Type</label>
      <select class="pf-input" id="wp-type">
        <option value="delivery">Delivery</option>
        <option value="charger">Charger</option>
        <option value="avoid">Avoid</option>
        <option value="custom">Custom</option>
      </select>
      <div class="pf-row3">
        <div><label class="pf-label">X (m)</label><input class="pf-input" id="wp-x" type="number" value="0" step="0.1"></div>
        <div><label class="pf-label">Y (m)</label><input class="pf-input" id="wp-y" type="number" value="0" step="0.1"></div>
        <div><label class="pf-label">Yaw (°)</label><input class="pf-input" id="wp-yaw" type="number" value="0" step="5"></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary btn-sm" id="wp-pick-btn">🖱 Pick on map</button>
        <button class="btn btn-primary btn-sm"   id="wp-save-btn">Save</button>
        <button class="btn btn-secondary btn-sm" id="wp-cancel-btn">Cancel</button>
      </div>
    </div>

    <div class="item-list" id="wp-list">
      ${PanelState.waypoints.map(w => _wpRow(w)).join('') || '<div style="color:#9ca3af;font-size:12px;padding:8px">No waypoints</div>'}
    </div>
  `);

  P.on('wp-add-btn', 'click', () => {
    P.get('wp-add-form').style.display = '';
    P.get('wp-add-btn').style.display = 'none';
    MapEngine.setTool('position');
  });

  P.on('wp-pick-btn', 'click', () => {
    MapEngine.setTool('position', world => {
      P.get('wp-x').value   = f3(world.x);
      P.get('wp-y').value   = f3(world.y);
      MapEngine.setTool('position');
      toast('Coordinates filled from map', 'info');
    });
  });

  P.on('wp-save-btn', 'click', async () => {
    const name = P.get('wp-name').value.trim();
    if (!name) { toast('Name required', 'err'); return; }
    const r = await API.post('/atlas/waypoints', {
      name, type: P.get('wp-type').value,
      x: +P.get('wp-x').value, y: +P.get('wp-y').value,
      yaw: +P.get('wp-yaw').value * Math.PI / 180,
    });
    r.ok ? (toast(`"${name}" saved`), window.renderPosition())
         : toast(r.data?.message ?? 'Error', 'err');
    MapEngine.setTool('nav');
  });

  P.on('wp-cancel-btn', 'click', () => {
    P.get('wp-add-form').style.display = 'none';
    P.get('wp-add-btn').style.display = '';
    MapEngine.setTool('nav');
  });

  // Go / Delete buttons
  document.querySelectorAll('[data-wp-go]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { x, y, yaw } = PanelState.waypoints.find(w => w.name === btn.dataset.wpGo) ?? {};
      if (x == null) return;
      const r = await API.post('/atlas/nav/goal', { x, y, yaw });
      r.ok ? (MapEngine.setGoal({x,y}), toast(`Navigating to "${btn.dataset.wpGo}"`))
           : toast(r.data?.message ?? 'Error', 'err');
    });
  });

  document.querySelectorAll('[data-wp-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete "${btn.dataset.wpDel}"?`)) return;
      const r = await API.del(`/atlas/waypoints/${btn.dataset.wpDel}`);
      r.ok ? (toast('Deleted'), window.renderPosition())
           : toast(r.data?.message ?? 'Error', 'err');
    });
  });
};

function _wpRow(w) {
  const typeColor = { charger:'#f59e0b', delivery:'#7c3aed', avoid:'#dc2626' };
  const tc = typeColor[w.type] ?? '#059669';
  return `
    <div class="item-row">
      <div>
        <div class="item-name" style="color:${tc}">${w.name}</div>
        <div class="item-meta">${w.type} · (${f2(w.x)}, ${f2(w.y)}) ${deg(w.yaw)}°</div>
      </div>
      <div class="item-acts">
        <button class="btn btn-sm btn-secondary" data-wp-go="${w.name}">Go</button>
        <button class="btn btn-sm btn-danger"    data-wp-del="${w.name}">✕</button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   4. NAVI ROUTE
   ══════════════════════════════════════════════════════════════════════════ */
window.renderNaviRoute = async function() {
  const r = await API.get('/atlas/route/list');
  const names = r.ok ? (r.data.routes ?? []) : [];

  P.render(`
    <div class="panel-title">Navi Routes
      <div class="pt-right">
        <button class="btn btn-primary btn-sm" id="rt-new-btn">+ New</button>
      </div>
    </div>

    <div id="rt-new-form" class="p-card" style="display:none">
      <div class="p-card-header">Create Route</div>
      <label class="pf-label">Name</label>
      <input class="pf-input" id="rt-name" placeholder="patrol_loop">
      <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px">
        <input type="checkbox" id="rt-loop"> Loop continuously
      </label>
      <label class="pf-label">Waypoints (JSON array or from list below)</label>
      <textarea class="pf-input" id="rt-json" rows="5"
        placeholder='[{"name":"P1","x":1.0,"y":2.0,"yaw":0},...]' style="resize:vertical"></textarea>
      <div class="btn-row">
        <button class="btn btn-secondary btn-sm" id="rt-fill-wp">From Waypoints</button>
        <button class="btn btn-primary btn-sm"   id="rt-save-btn">Save</button>
        <button class="btn btn-secondary btn-sm" id="rt-cancel-btn">Cancel</button>
      </div>
    </div>

    <div class="item-list" id="rt-list">
      ${names.map(n => _routeRow(n)).join('') || '<div style="color:#9ca3af;font-size:12px;padding:8px">No routes</div>'}
    </div>
  `);

  P.on('rt-new-btn', 'click', () => {
    P.get('rt-new-form').style.display = '';
    P.get('rt-new-btn').style.display = 'none';
  });

  P.on('rt-fill-wp', 'click', () => {
    const wps = PanelState.waypoints.map(w => ({ name:w.name, x:w.x, y:w.y, yaw:w.yaw }));
    P.get('rt-json').value = JSON.stringify(wps, null, 2);
  });

  P.on('rt-save-btn', 'click', async () => {
    const name = P.get('rt-name').value.trim();
    if (!name) { toast('Name required', 'err'); return; }
    let waypoints;
    try { waypoints = JSON.parse(P.get('rt-json').value); }
    catch { toast('Invalid JSON', 'err'); return; }
    const r2 = await API.post('/atlas/route', {
      name, loop: P.get('rt-loop').checked, waypoints,
    });
    r2.ok ? (toast(`Route "${name}" saved`), window.renderNaviRoute())
           : toast(r2.data?.message ?? 'Error', 'err');
  });

  P.on('rt-cancel-btn', 'click', () => {
    P.get('rt-new-form').style.display = 'none';
    P.get('rt-new-btn').style.display = '';
  });

  document.querySelectorAll('[data-rt-start]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r2 = await API.post('/atlas/route/start', { name: btn.dataset.rtStart });
      r2.ok ? toast(`Patrol started: ${btn.dataset.rtStart} ▶`)
             : toast(r2.data?.message ?? 'Error', 'err');
    });
  });

  document.querySelectorAll('[data-rt-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete route "${btn.dataset.rtDel}"?`)) return;
      await API.del(`/atlas/route/${btn.dataset.rtDel}`);
      toast('Deleted'); window.renderNaviRoute();
    });
  });

  // Load active route on map
  if (names.length) {
    const r2 = await API.get('/atlas/route');
    if (r2.ok && r2.data.waypoints) {
      MapEngine.setRoutes([{ name: r2.data.name, waypoints: r2.data.waypoints }]);
    }
  }
};

function _routeRow(name) {
  return `
    <div class="item-row">
      <div class="item-name">🔄 ${name}</div>
      <div class="item-acts">
        <button class="btn btn-sm btn-primary"   data-rt-start="${name}">▶</button>
        <button class="btn btn-sm btn-secondary" data-rt-stop>■</button>
        <button class="btn btn-sm btn-danger"    data-rt-del="${name}">✕</button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   5. VIRTUAL WALL
   ══════════════════════════════════════════════════════════════════════════ */
window.renderVirtualWall = async function() {
  const r = await API.get('/atlas/virtual_wall');
  PanelState.walls = r.ok ? (r.data.walls ?? []) : [];
  MapEngine.setWalls(PanelState.walls);

  P.render(`
    <div class="panel-title">Virtual Walls
      <div class="pt-right">
        <button class="btn btn-primary btn-sm" id="vw-draw-btn">✏ Draw</button>
      </div>
    </div>
    <div class="p-card" style="background:#fef2f2;border-color:#fca5a5">
      <div style="font-size:11px;color:#991b1b">
        📌 Click <b>Draw</b> then click on the map to place wall points.<br>
        Double-click to finish. Right-click to undo a point.
      </div>
    </div>
    <div class="item-list" id="vw-list">
      ${PanelState.walls.map((w,i) => _wallRow(w,i)).join('') || '<div style="color:#9ca3af;font-size:12px;padding:8px">No virtual walls</div>'}
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn btn-danger btn-sm btn-full" id="vw-clear-all">🗑 Clear All Walls</button>
    </div>
  `);

  P.on('vw-draw-btn', 'click', () => {
    toast('Click on map to draw wall · Double-click to finish', 'info');
    MapEngine.setTool('wall', async points => {
      const newWall = {
        id: 'wall_' + Date.now(),
        points: points.map(p => ({ x: p.x, y: p.y })),
      };
      PanelState.walls.push(newWall);
      const r2 = await API.post('/atlas/virtual_wall', { walls: PanelState.walls });
      r2.ok ? (MapEngine.setWalls(PanelState.walls), window.renderVirtualWall())
             : toast(r2.data?.message ?? 'Error', 'err');
      MapEngine.setTool('nav');
    });
  });

  P.on('vw-clear-all', 'click', async () => {
    if (!confirm('Clear all virtual walls?')) return;
    const r2 = await API.del('/atlas/virtual_wall');
    r2.ok ? (PanelState.walls = [], MapEngine.setWalls([]), toast('Walls cleared'), window.renderVirtualWall())
           : toast(r2.data?.message ?? 'Error', 'err');
  });

  document.querySelectorAll('[data-vw-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.vwDel;
      PanelState.walls = PanelState.walls.filter(w => w.id !== id);
      await API.post('/atlas/virtual_wall', { walls: PanelState.walls });
      MapEngine.setWalls(PanelState.walls);
      window.renderVirtualWall();
    });
  });
};

function _wallRow(w, i) {
  return `
    <div class="item-row">
      <div>
        <div class="item-name">Wall ${i+1}</div>
        <div class="item-meta">${w.points.length} points</div>
      </div>
      <div class="item-acts">
        <button class="btn btn-sm btn-danger" data-vw-del="${w.id}">✕</button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   6. SPECIAL AREA
   ══════════════════════════════════════════════════════════════════════════ */
window.renderSpecialArea = async function() {
  const r = await API.get('/atlas/special_area');
  PanelState.areas = r.ok ? (r.data.areas ?? []) : [];
  MapEngine.setAreas(PanelState.areas);

  P.render(`
    <div class="panel-title">Special Areas
      <div class="pt-right">
        <button class="btn btn-primary btn-sm" id="sa-draw-btn">✏ Draw</button>
      </div>
    </div>

    <div id="sa-new-form" class="p-card" style="display:none">
      <div class="p-card-header">New Area</div>
      <label class="pf-label">Name</label>
      <input class="pf-input" id="sa-name" placeholder="slow_zone">
      <div class="pf-row">
        <div><label class="pf-label">Type</label>
          <select class="pf-input" id="sa-type">
            <option value="slow">Slow zone</option>
            <option value="forbidden">Forbidden</option>
            <option value="trigger">Trigger</option>
          </select>
        </div>
        <div><label class="pf-label">Speed (m/s)</label>
          <input class="pf-input" id="sa-speed" type="number" value="0.3" step="0.1" min="0" max="2">
        </div>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:8px">
        Now click on the map to draw the polygon. Click near start point to close.
      </div>
      <div class="btn-row">
        <button class="btn btn-danger btn-sm" id="sa-cancel-draw">Cancel Draw</button>
      </div>
    </div>
    <div class="p-card" style="background:#fef9c3;border-color:#fde68a">
      <div style="font-size:11px;color:#92400e">
        📌 Click <b>Draw</b>, set name/type, then draw polygon on map.<br>
        Click near first vertex to close. Right-click to undo.
      </div>
    </div>
    <div class="item-list">
      ${PanelState.areas.map(a => _areaRow(a)).join('') || '<div style="color:#9ca3af;font-size:12px;padding:8px">No special areas</div>'}
    </div>
  `);

  P.on('sa-draw-btn', 'click', () => {
    P.get('sa-new-form').style.display = '';
    P.get('sa-draw-btn').style.display = 'none';
    toast('Click on map to draw area polygon · Click start to close', 'info');
    MapEngine.setTool('area', async points => {
      const name  = P.get('sa-name')?.value.trim() || 'area_' + Date.now();
      const type  = P.get('sa-type')?.value  ?? 'slow';
      const speed = +(P.get('sa-speed')?.value ?? 0.3);
      const area  = {
        id: 'area_' + Date.now(),
        name, type, speed,
        polygon: points.map(p => ({ x: p.x, y: p.y })),
      };
      PanelState.areas.push(area);
      const r2 = await API.post('/atlas/special_area', { areas: PanelState.areas });
      r2.ok ? (MapEngine.setAreas(PanelState.areas), toast(`Area "${name}" saved`), window.renderSpecialArea())
             : toast(r2.data?.message ?? 'Error', 'err');
      MapEngine.setTool('nav');
    });
  });

  P.on('sa-cancel-draw', 'click', () => {
    MapEngine.cancelDraw();
    MapEngine.setTool('nav');
    window.renderSpecialArea();
  });

  document.querySelectorAll('[data-sa-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.saDel;
      PanelState.areas = PanelState.areas.filter(a => a.id !== id);
      await API.post('/atlas/special_area', { areas: PanelState.areas });
      MapEngine.setAreas(PanelState.areas);
      window.renderSpecialArea();
    });
  });
};

function _areaRow(a) {
  const tc = { slow:'#ca8a04', forbidden:'#dc2626', trigger:'#7c3aed' }[a.type] ?? '#6b7280';
  return `
    <div class="item-row">
      <div>
        <div class="item-name" style="color:${tc}">⬡ ${a.name || a.id}</div>
        <div class="item-meta">${a.type} · ${a.speed} m/s · ${a.polygon.length} pts</div>
      </div>
      <div class="item-acts">
        <button class="btn btn-sm btn-danger" data-sa-del="${a.id}">✕</button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   7. MAP LIST
   ══════════════════════════════════════════════════════════════════════════ */
window.renderMapList = async function() {
  const [mRes, curRes] = await Promise.all([
    API.get('/atlas/map/list'),
    API.get('/atlas/map/current'),
  ]);
  const maps   = mRes.ok  ? (mRes.data.maps   ?? []) : [];
  const curMap = curRes.ok ? (curRes.data.name ?? '') : '';
  PanelState.maps = maps;

  P.render(`
    <div class="panel-title">Maps
      <div class="pt-right">
        <button class="btn btn-secondary btn-sm" id="ml-refresh">🔄</button>
        <button class="btn btn-primary btn-sm"   id="ml-reload-map">↺ Refresh Map</button>
      </div>
    </div>
    <div class="p-card">
      <div class="p-card-header">Current Map</div>
      <div style="font-size:12px;color:#374151">
        <b id="ml-current">${curMap || '—'}</b>
      </div>
    </div>

    <div class="p-card">
      <div class="p-card-header">Upload Map</div>
      <input type="file" id="ml-upload-file" class="pf-input" accept=".yaml,.zip">
      <button class="btn btn-primary btn-sm btn-full" id="ml-upload-btn" style="margin-top:6px">⬆ Upload</button>
    </div>

    <div class="p-card-header" style="padding:4px 0;margin-top:8px">All Maps</div>
    <div class="item-list">
      ${maps.length ? maps.map(m => _mapRow(m, m.name === curMap)).join('')
                    : '<div style="color:#9ca3af;font-size:12px;padding:8px">No saved maps</div>'}
    </div>
  `);

  P.on('ml-refresh',    'click', window.renderMapList);
  P.on('ml-reload-map', 'click', () => { MapEngine.loadMap(); toast('Map reloading…', 'info'); });

  P.on('ml-upload-btn', 'click', async () => {
    const f = P.get('ml-upload-file')?.files[0];
    if (!f) { toast('Select a file first', 'err'); return; }
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await fetch(`http://${Cfg.restHost}/atlas/map/import`, { method:'POST', body:fd });
      const j = await r.json();
      r.ok ? (toast('Map uploaded ✓'), window.renderMapList())
           : toast(j.message ?? 'Upload failed', 'err');
    } catch(e) { toast(e.message, 'err'); }
  });

  document.querySelectorAll('[data-ml-apply]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = await API.post('/atlas/map/apply', { name: btn.dataset.mlApply });
      r.ok ? (toast('Map applied ✓'), MapEngine.loadMap(), window.renderMapList())
           : toast(r.data?.message ?? 'Error', 'err');
    });
  });

  document.querySelectorAll('[data-ml-dl]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.open(`http://${Cfg.restHost}/atlas/map/export/${btn.dataset.mlDl}`, '_blank');
    });
  });

  document.querySelectorAll('[data-ml-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Delete map?`)) return;
      await API.del(`/atlas/map/${btn.dataset.mlDel}`);
      toast('Map deleted'); window.renderMapList();
    });
  });
};

function _mapRow(m, isCurrent) {
  return `
    <div class="item-row" ${isCurrent ? 'style="border-color:#93c5fd;background:#eff6ff"' : ''}>
      <div>
        <div class="item-name">${m.alias || '(unnamed)'} ${isCurrent ? '✓' : ''}</div>
        <div class="item-meta" style="font-family:monospace">${m.name?.slice(0,16)}…</div>
      </div>
      <div class="item-acts">
        <button class="btn btn-sm btn-primary"   data-ml-apply="${m.name}">Apply</button>
        <button class="btn btn-sm btn-secondary" data-ml-dl="${m.name}">⬇</button>
        <button class="btn btn-sm btn-danger"    data-ml-del="${m.name}">✕</button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   8. ROBOT STATUS
   ══════════════════════════════════════════════════════════════════════════ */
window.renderRobotStatus = async function() {
  const [sRes, iRes, bRes] = await Promise.all([
    API.get('/atlas/status'),
    API.get('/atlas/chassis/imu'),
    API.get('/atlas/chassis/battery'),
  ]);
  const s   = sRes.ok ? sRes.data  : {};
  const imu = iRes.ok ? iRes.data  : {};
  const bat = bRes.ok ? bRes.data  : {};
  const p   = s.pose ?? {};
  const a   = imu.acceleration ?? {}, g = imu.gyroscope ?? {};

  P.render(`
    <div class="panel-title">Robot Status
      <button class="btn btn-secondary btn-sm" onclick="renderRobotStatus()">🔄</button>
    </div>

    <div class="p-card">
      <div class="p-card-header">🔋 Battery & Power</div>
      <div class="kv-grid">
        <div class="kv-row"><span class="kv-key">Level</span><span class="kv-val">${f1(bat.battery ?? s.battery)}%</span></div>
        <div class="kv-row"><span class="kv-key">Voltage</span><span class="kv-val">${f2(bat.voltage)} V</span></div>
        <div class="kv-row"><span class="kv-key">Status</span><span class="kv-val">${chargeLabel(bat.charge_flag)}</span></div>
        <div class="kv-row"><span class="kv-key">E-Stop</span>
          <span class="kv-val badge ${bat.emergency_stop ? 'badge-err' : 'badge-ok'}">${bat.emergency_stop ? 'ACTIVE' : 'Off'}</span>
        </div>
      </div>
    </div>

    <div class="p-card">
      <div class="p-card-header">📡 IMU — Acceleration (m/s²)</div>
      <div class="kv-grid">
        <div class="kv-row"><span class="kv-key">ax</span><span class="kv-val">${f4(a.x)}</span></div>
        <div class="kv-row"><span class="kv-key">ay</span><span class="kv-val">${f4(a.y)}</span></div>
        <div class="kv-row"><span class="kv-key">az</span><span class="kv-val">${f4(a.z)}</span></div>
        <div class="kv-row"><span class="kv-key">gx</span><span class="kv-val">${f5(g.x)}</span></div>
        <div class="kv-row"><span class="kv-key">gy</span><span class="kv-val">${f5(g.y)}</span></div>
        <div class="kv-row"><span class="kv-key">gz</span><span class="kv-val">${f5(g.z)}</span></div>
      </div>
    </div>

    <div class="p-card">
      <div class="p-card-header">📍 Pose & Velocity</div>
      <div class="kv-grid">
        <div class="kv-row"><span class="kv-key">X</span><span class="kv-val">${f3(p.x)} m</span></div>
        <div class="kv-row"><span class="kv-key">Y</span><span class="kv-val">${f3(p.y)} m</span></div>
        <div class="kv-row"><span class="kv-key">Yaw</span><span class="kv-val">${deg(p.yaw)}° / ${f3(p.yaw)} rad</span></div>
        <div class="kv-row"><span class="kv-key">Vx</span><span class="kv-val">${f3(s.linear_speed)} m/s</span></div>
        <div class="kv-row"><span class="kv-key">Wz</span><span class="kv-val">${f3(s.angular_speed)} rad/s</span></div>
        <div class="kv-row"><span class="kv-key">Nav state</span>
          <span class="kv-val badge ${s.nav_state==='navigating'?'badge-nav':s.nav_state==='succeeded'?'badge-ok':'badge-idle'}">${s.nav_state??'idle'}</span>
        </div>
      </div>
    </div>
  `);
};

/* ══════════════════════════════════════════════════════════════════════════
   9. LOGS
   ══════════════════════════════════════════════════════════════════════════ */
window.renderLogs = function() {
  P.render(`
    <div class="panel-title">System Logs
      <button class="btn btn-secondary btn-sm" onclick="renderLogs()">🔄 Clear</button>
    </div>
    <div id="log-panel-list">
      ${PanelState.logs.slice(0,60).map(l => `
        <div class="log-entry">
          <span class="log-time">${l.t}</span>
          <span class="log-dot ${l.level}"></span>
          <span class="log-msg">${l.msg}</span>
        </div>`).join('') || '<div style="color:#9ca3af;font-size:12px;padding:8px">No logs</div>'}
    </div>
  `);
};

/* ══════════════════════════════════════════════════════════════════════════
   10. API REQUEST
   ══════════════════════════════════════════════════════════════════════════ */
const _API_EPS = [
  { g:'System',     m:'GET',  p:'/atlas/status' },
  { g:'System',     m:'GET',  p:'/atlas/version' },
  { g:'System',     m:'GET',  p:'/atlas/mode' },
  { g:'System',     m:'POST', p:'/atlas/mode', b:'{"mode":2}' },
  { g:'Chassis',    m:'GET',  p:'/atlas/chassis/pose' },
  { g:'Chassis',    m:'GET',  p:'/atlas/chassis/speed' },
  { g:'Chassis',    m:'GET',  p:'/atlas/chassis/imu' },
  { g:'Chassis',    m:'GET',  p:'/atlas/chassis/battery' },
  { g:'Chassis',    m:'POST', p:'/atlas/chassis/move', b:'{"vx":0.3,"vy":0,"wz":0}' },
  { g:'Navigation', m:'GET',  p:'/atlas/nav/status' },
  { g:'Navigation', m:'POST', p:'/atlas/nav/goal', b:'{"x":1.0,"y":2.0,"yaw":0}' },
  { g:'Navigation', m:'POST', p:'/atlas/nav/cancel', b:'{}' },
  { g:'Navigation', m:'POST', p:'/atlas/nav/relocate', b:'{"x":0,"y":0,"yaw":0}' },
  { g:'Map',        m:'GET',  p:'/atlas/map' },
  { g:'Map',        m:'GET',  p:'/atlas/map/list' },
  { g:'Map',        m:'POST', p:'/atlas/map/save', b:'{"alias":"Floor 1"}' },
  { g:'Waypoints',  m:'GET',  p:'/atlas/waypoints' },
  { g:'Waypoints',  m:'POST', p:'/atlas/waypoints', b:'{"name":"A","type":"delivery","x":1,"y":2,"yaw":0}' },
  { g:'Route',      m:'GET',  p:'/atlas/route/list' },
  { g:'Route',      m:'POST', p:'/atlas/route/start', b:'{"name":"patrol1"}' },
  { g:'Layers',     m:'GET',  p:'/atlas/virtual_wall' },
  { g:'Layers',     m:'GET',  p:'/atlas/special_area' },
  { g:'Settings',   m:'GET',  p:'/atlas/settings' },
];

// Called by main.js via PANEL_MAP
window['renderApiRequest'] = function() {
  const groups = {};
  _API_EPS.forEach(ep => { (groups[ep.g] ??= []).push(ep); });

  const epHtml = Object.entries(groups).map(([g, eps]) => `
    <div class="api-ep-group">
      <div class="api-ep-group-title">${g}</div>
      ${eps.map(ep => `
        <div class="api-ep-item" data-ep="${_API_EPS.indexOf(ep)}">
          <span class="m-badge m-${ep.m}">${ep.m}</span>
          <span class="ep-path">${ep.p}</span>
        </div>`).join('')}
    </div>`).join('');

  P.render(`
    <div class="panel-title">API Request</div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <select class="pf-input" id="ar-method" style="width:80px">
        <option>GET</option><option>POST</option><option>DELETE</option>
      </select>
      <input class="pf-input" id="ar-path" type="text" value="/atlas/status" style="flex:1">
    </div>
    <label class="pf-label">Body (JSON)</label>
    <textarea class="pf-input" id="ar-body" rows="4" style="font-family:monospace;font-size:11px;resize:vertical" placeholder='{"key":"value"}'></textarea>
    <div class="btn-row" style="margin-bottom:8px">
      <button class="btn btn-primary btn-sm" id="ar-send">▶ Send</button>
      <span id="ar-status" style="font-size:11px;color:#6b7280"></span>
    </div>
    <pre class="api-result" id="ar-result">Response will appear here…</pre>

    <div class="p-card-header" style="margin-top:12px;padding:4px 0">Quick Endpoints</div>
    <div id="ar-ep-list" style="margin-top:4px">${epHtml}</div>
  `);

  P.on('ar-send', 'click', async () => {
    const method = P.get('ar-method').value;
    const path   = P.get('ar-path').value.trim();
    let body;
    const raw = P.get('ar-body').value.trim();
    if (raw) { try { body = JSON.parse(raw); } catch { toast('Invalid JSON', 'err'); return; } }
    const t0 = performance.now();
    const r  = await API.req(method, path, body);
    const ms = (performance.now() - t0).toFixed(0);
    const el = P.get('ar-result');
    P.get('ar-status').textContent = `HTTP ${r.status}  ·  ${ms} ms`;
    el.textContent = JSON.stringify(r.data, null, 2);
    el.className = `api-result ${r.ok ? '' : 'err'}`;
  });

  document.querySelectorAll('.api-ep-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.api-ep-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const ep = _API_EPS[+item.dataset.ep];
      P.get('ar-method').value = ep.m;
      P.get('ar-path').value   = ep.p;
      P.get('ar-body').value   = ep.b ? JSON.stringify(JSON.parse(ep.b), null, 2) : '';
    });
  });
};

/* ══════════════════════════════════════════════════════════════════════════
   11. SETTINGS
   ══════════════════════════════════════════════════════════════════════════ */
window.renderSettings = async function() {
  const r = await API.get('/atlas/settings');
  PanelState.settings = r.ok ? r.data : {};

  P.render(`
    <div class="panel-title">Settings</div>
    <div class="settings-section">
      <h4>Connection</h4>
      <div class="setting-row">
        <div><div class="lbl">REST API Host</div><div class="desc">host:port for atlas_api</div></div>
        <input class="pf-input" id="cfg-rest" value="${Cfg.restHost}">
      </div>
      <div class="setting-row">
        <div><div class="lbl">WebSocket Host</div><div class="desc">for real-time data</div></div>
        <input class="pf-input" id="cfg-ws" value="${Cfg.wsHost}">
      </div>
      <div class="btn-row">
        <button class="btn btn-primary btn-sm" id="cfg-save-conn">Apply Connection</button>
      </div>
    </div>
    <div class="settings-section">
      <h4>Navigation Parameters</h4>
      <div id="nav-settings">
        ${Object.entries(PanelState.settings).map(([k,v]) => `
          <div class="setting-row">
            <div class="lbl">${k}</div>
            <input class="pf-input" id="ns-${k}" value="${v}" style="width:120px;text-align:right">
          </div>`).join('')}
      </div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn btn-primary btn-sm" id="cfg-save-nav">💾 Save</button>
      </div>
    </div>
  `);

  P.on('cfg-save-conn', 'click', () => {
    Cfg.restHost = P.get('cfg-rest').value.trim();
    Cfg.wsHost   = P.get('cfg-ws').value.trim();
    WS.connect();
    toast('Connection settings updated', 'info');
  });

  P.on('cfg-save-nav', 'click', async () => {
    const updates = {};
    Object.keys(PanelState.settings).forEach(k => {
      const el = P.get(`ns-${k}`);
      if (el) updates[k] = isNaN(el.value) ? el.value : parseFloat(el.value);
    });
    const r2 = await API.post('/atlas/settings', updates);
    r2.ok ? toast('Settings saved ✓') : toast('Failed', 'err');
  });
};

/* ── Helper formatters ─────────────────────────────────────────────────────── */
function f1(v) { return v == null ? '—' : parseFloat(v).toFixed(1); }
function f2(v) { return v == null ? '—' : parseFloat(v).toFixed(2); }
function f3(v) { return v == null ? '0.000' : parseFloat(v).toFixed(3); }
function f4(v) { return v == null ? '—' : parseFloat(v).toFixed(4); }
function f5(v) { return v == null ? '—' : parseFloat(v).toFixed(5); }
function deg(rad) { return rad == null ? '0' : (parseFloat(rad) * 180 / Math.PI).toFixed(1); }
function chargeLabel(f) {
  return ({0:'Discharging',1:'Full',2:'Charging (pile)',3:'Adapter',8:'Docking'})[f] ?? '—';
}
