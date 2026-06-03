/**
 * main.js — App bootstrap: sidebar, status bar, toolbar, WebSocket wiring.
 */
'use strict';

/* ── Shared state ────────────────────────────────────────────────────────── */
const App = {
  activePanel: null,
  mode: 2,            // 1=mapping, 2=nav
  logs: [],
  startTime: Date.now(),
};

/* ── Utility ─────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

window.toast = function(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3200);
};

function addLog(msg, level = 'info') {
  const t = new Date().toTimeString().slice(0,8);
  PanelState.logs.unshift({ t, msg, level });
  if (PanelState.logs.length > 200) PanelState.logs.pop();
  App.logs = PanelState.logs;
}

/* ── Sidebar resize ──────────────────────────────────────────────────────── */
function initSidebarResize() {
  const handle  = $('sidebar-resize-handle');
  const sidebar = $('sidebar');
  let dragging  = false, startX = 0, startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX   = e.clientX;
    startW   = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.max(190, Math.min(window.innerWidth * 0.65,
                           startW + (e.clientX - startX)));
    sidebar.style.width = newW + 'px';
    sidebar.style.setProperty('--sidebar-w', newW + 'px');
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
}

/* ── Sidebar toggle ──────────────────────────────────────────────────────── */
function initSidebarToggle() {
  $('btn-sidebar-toggle').addEventListener('click', () => {
    $('sidebar').classList.toggle('collapsed');
  });
}

/* ── Nav item routing ────────────────────────────────────────────────────── */
const PANEL_MAP = {
  'navi-mode':    renderNaviMode,
  'build-mode':   renderBuildMode,
  'position':     renderPosition,
  'navi-route':   renderNaviRoute,
  'virtual-wall': renderVirtualWall,
  'special-area': renderSpecialArea,
  'map-list':     renderMapList,
  'robot-status': renderRobotStatus,
  'logs':         renderLogs,
  'api-request':  renderApiRequest,
  'settings':     renderSettings,
};

function activatePanel(id) {
  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === id);
  });

  App.activePanel = id;

  // Open sidebar if collapsed
  $('sidebar').classList.remove('collapsed');

  // Reset tool when switching away from drawing modes
  if (!['virtual-wall','special-area','position'].includes(id)) {
    MapEngine.cancelDraw();
    MapEngine.setTool('nav');
    // Clear toolbar active state (no persistent-callback tool active)
    document.querySelectorAll('.tb-btn[data-tool]').forEach(b => b.classList.remove('active'));
  }

  const fn = PANEL_MAP[id];
  if (fn) fn();
  else {
    document.getElementById('nav-panel-inner').innerHTML =
      `<div class="panel-title">${id}</div><div style="color:#9ca3af;font-size:12px">Coming soon</div>`;
  }
}

function initNavItems() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => activatePanel(item.dataset.id));
  });
}

/* ── Toolbar buttons ─────────────────────────────────────────────────────── */

// Build a persistent nav-goal callback for the toolbar Navi Goal button.
// "Persistent" = after each execution it re-registers itself so the next
// click+drag on the map fires another goal without needing to click the button again.
function _makeNavToolCb() {
  const cb = async (world, yaw) => {
    const r = await API.post('/atlas/nav/goal', { x: world.x, y: world.y, yaw });
    if (r.ok) {
      MapEngine.setGoal({ ...world, yaw });
      toast(`Navi → (${world.x.toFixed(2)}, ${world.y.toFixed(2)}) θ=${(yaw * 180 / Math.PI).toFixed(0)}°`);
      addLog(`Nav goal: (${world.x.toFixed(2)}, ${world.y.toFixed(2)}) yaw=${(yaw * 180 / Math.PI).toFixed(0)}°`);
    } else {
      toast(r.data?.message ?? 'Nav error', 'err');
    }
    MapEngine.setTool('nav', cb);  // stay in nav-tool mode
  };
  return cb;
}

// Build a persistent relocate callback for the toolbar Set Pose button.
function _makeRelocateToolCb() {
  const cb = async (world, yaw) => {
    const r = await API.post('/atlas/nav/relocate', { x: world.x, y: world.y, yaw });
    if (r.ok) {
      MapEngine.setPose({ ...world, yaw });
      toast(`Pose set (${world.x.toFixed(2)}, ${world.y.toFixed(2)}) θ=${(yaw * 180 / Math.PI).toFixed(0)}°`);
      addLog(`Relocate: (${world.x.toFixed(2)}, ${world.y.toFixed(2)}) yaw=${(yaw * 180 / Math.PI).toFixed(0)}°`);
    } else {
      toast(r.data?.message ?? 'Relocate error', 'err');
    }
    MapEngine.setTool('relocate', cb);  // stay in relocate-tool mode
  };
  return cb;
}

function initToolbar() {
  // Tool buttons — nav and relocate get auto-execute callbacks
  document.querySelectorAll('.tb-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      document.querySelectorAll('.tb-btn[data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (tool === 'nav') {
        MapEngine.setTool('nav', _makeNavToolCb());
      } else if (tool === 'relocate') {
        MapEngine.setTool('relocate', _makeRelocateToolCb());
      } else {
        MapEngine.setTool(tool);
      }
    });
  });

  $('btn-cancel-navi').addEventListener('click', async () => {
    await API.post('/atlas/nav/cancel', {});
    MapEngine.clearGoal();
    toast('Navigation cancelled', 'info');
    addLog('Navigation cancelled by user', 'warn');
  });

  $('btn-charge-approach').addEventListener('click', async () => {
    const r = await API.post('/atlas/nav/charge_approach', { name: 'charging_pile' });
    r.ok ? (toast('Approaching charger…'), addLog('Charge approach started'))
         : toast(r.data?.message ?? 'Charging waypoint not found', 'err');
  });

  $('btn-charge-dock').addEventListener('click', async () => {
    const r = await API.post('/atlas/nav/charge_dock', { name: 'charging_pile' });
    r.ok ? (toast('Docking into charger…'), addLog('Dock started'))
         : toast(r.data?.message ?? 'Dock waypoint not found — create "charging_pile_dock"', 'err');
  });

  $('btn-charge').addEventListener('click', async () => {
    const r = await API.post('/atlas/nav/charge', { name: 'charging_pile' });
    r.ok ? (toast('Full charge sequence started'), addLog('Charge sequence: approach + dock'))
         : toast(r.data?.message ?? 'Charging waypoint not found', 'err');
  });

  $('btn-stop-all').addEventListener('click', async () => {
    await API.post('/atlas/chassis/move', { vx:0, vy:0, wz:0 });
    await API.post('/atlas/nav/cancel', {});
    MapEngine.clearGoal();
    toast('Robot stopped ⛔', 'err');
    addLog('Emergency stop triggered', 'error');
  });
}

/* ── Context menu on map ─────────────────────────────────────────────────── */
function initContextMenu() {
  let _ctxWorld = null;
  const menu = $('ctx-menu');

  function hide() { menu.hidden = true; }
  document.addEventListener('click', hide);
  document.addEventListener('keydown', e => { if(e.key==='Escape') hide(); });

  MapEngine.init('map-canvas', 'map-bg', {
    onContext: (world, screenPos) => {
      _ctxWorld = world;
      menu.style.left = screenPos.x + 'px';
      menu.style.top  = screenPos.y + 'px';
      menu.hidden = false;
    },
  });

  $('ctx-nav-here').addEventListener('click', async () => {
    if (!_ctxWorld) return;
    const { x, y } = _ctxWorld;
    const r = await API.post('/atlas/nav/goal', { x, y, yaw: 0 });
    r.ok ? (MapEngine.setGoal(_ctxWorld), toast(`Navigating to (${x.toFixed(2)}, ${y.toFixed(2)})`),
            addLog(`Goal set: (${x.toFixed(2)}, ${y.toFixed(2)})`))
         : toast(r.data?.message ?? 'Error', 'err');
  });

  $('ctx-add-wp').addEventListener('click', () => {
    if (!_ctxWorld) return;
    activatePanel('position');
    // Pre-fill waypoint form after panel renders
    setTimeout(() => {
      const xEl = $('wp-x'), yEl = $('wp-y');
      if (xEl) xEl.value = _ctxWorld.x.toFixed(3);
      if (yEl) yEl.value = _ctxWorld.y.toFixed(3);
      const form = $('wp-add-form');
      if (form) form.style.display = '';
      const btn = $('wp-add-btn');
      if (btn) btn.style.display = 'none';
    }, 100);
  });

  $('ctx-relocate-here').addEventListener('click', async () => {
    if (!_ctxWorld) return;
    const { x, y } = _ctxWorld;
    await API.post('/atlas/nav/relocate', { x, y, yaw: 0 });
    toast('Pose set 📍');
  });

  $('ctx-clear-goal').addEventListener('click', async () => {
    await API.post('/atlas/nav/cancel', {});
    MapEngine.clearGoal();
    toast('Goal cleared', 'info');
  });
}

/* ── Status bar update ───────────────────────────────────────────────────── */
function applyStatus(s) {
  PanelState.status = s;

  const bat = +(s.battery ?? 0);
  const si = n => document.getElementById(n);

  si('si-bat').textContent    = `${bat.toFixed(0)}%`;
  si('si-lspd').textContent   = (+(s.linear_speed  ?? 0)).toFixed(2);
  si('si-aspd').textContent   = (+(s.angular_speed ?? 0)).toFixed(2);
  const p = s.pose ?? {};
  si('si-x').textContent = (+(p.x??0)).toFixed(2);
  si('si-y').textContent = (+(p.y??0)).toFixed(2);

  // IMU dot
  const imuDot = document.querySelector('#si-imu .dot');
  if (imuDot) imuDot.className = `dot${s.imu === 'ok' ? '' : ' off'}`;

  // E-stop dot
  const estopDot = document.querySelector('#si-estop .dot');
  if (estopDot) estopDot.className = `dot${s.emergency_stop ? '' : ' off'}`;

  // Map canvas robot
  if (p.x != null) MapEngine.setPose({ x: p.x, y: p.y, yaw: p.yaw ?? 0 });

  // Mode indicator
  const modeLabel = { 0:'Idle', 1:'Build Mode', 2:'Navigation Mode', 3:'Incremental Mapping' };
  si('mode-label').textContent = modeLabel[s.mode] ?? 'Navigation Mode';

  // Show/hide toolbar groups
  const isNav = (s.mode ?? 2) !== 1;
  $('tb-nav').hidden   = !isNav;
  $('tb-build').hidden = isNav;

  // Live-update navi panel without full re-render (prevents button flicker)
  if (App.activePanel === 'navi-mode') _liveUpdateNaviPanel(s);
}

/* ── Live update navi panel data only (no DOM rebuild) ───────────────── */
function _liveUpdateNaviPanel(s) {
  const p = s.pose ?? {};
  const el = id => document.getElementById(id);

  const stateEl = el('nm-state');
  if (!stateEl) return; // panel not rendered yet

  stateEl.innerHTML = s.nav_state === 'navigating'
    ? '<span class="badge badge-nav">navigating</span>'
    : `<span class="badge badge-idle">${s.nav_state ?? 'idle'}</span>`;

  const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
  set('nm-live-pos',  `(${(+(p.x??0)).toFixed(2)}, ${(+(p.y??0)).toFixed(2)})`);
  set('nm-live-head', `${(+(p.yaw??0) * 180 / Math.PI).toFixed(1)}°`);
  set('nm-live-spd',  `${(+(s.linear_speed??0)).toFixed(2)} m/s`);
  set('nm-live-bat',  `${(+(s.battery??0)).toFixed(1)}%`);

  const estop = el('nm-live-estop');
  if (estop) {
    estop.className = `kv-val ${s.emergency_stop ? 'badge badge-err' : 'badge badge-ok'}`;
    estop.textContent = s.emergency_stop ? 'ACTIVE' : 'Off';
  }
  set('nm-live-map', s.current_map || '—');
}

/* ── WebSocket wiring ────────────────────────────────────────────────────── */
function initWS() {
  WS.on('status', s => applyStatus(s));

  WS.on('$open',  () => {
    const badge = $('si-laser');
    if (badge) badge.style.opacity = '1';
    addLog('WebSocket connected', 'ok');
  });

  WS.on('$close', () => {
    const badge = $('si-laser');
    if (badge) badge.style.opacity = '.4';
    addLog('WebSocket disconnected', 'warn');
  });

  WS.connect();
}

/* ── Polling fallback ────────────────────────────────────────────────────── */
async function pollStatus() {
  if (WS.readyState === 1) return;
  const r = await API.get('/atlas/status');
  if (r.ok) applyStatus(r.data);
}

async function pollLaser() {
  const r = await API.get('/atlas/chassis/laser');
  if (r.ok && r.data.coordinates) {
    const p = (PanelState.status.pose) ?? { x:0, y:0, yaw:0 };
    MapEngine.setLaserWorld(r.data.coordinates, p.x, p.y, p.yaw ?? 0);
  }
}

async function pollNavPath() {
  const navState = PanelState.status.nav_state;
  if (navState !== 'navigating') {
    MapEngine.clearNavPath();
    return;
  }
  const r = await API.get('/atlas/nav/path');
  if (r.ok) MapEngine.setNavPath(r.data.path ?? []);
}

/* ── Load initial overlay data ───────────────────────────────────────────── */
async function loadOverlays() {
  const [wRes, rRes, vRes, aRes] = await Promise.all([
    API.get('/atlas/waypoints'),
    API.get('/atlas/route/list'),
    API.get('/atlas/virtual_wall'),
    API.get('/atlas/special_area'),
  ]);
  if (wRes.ok) { PanelState.waypoints = wRes.data.waypoints ?? []; MapEngine.setWaypoints(PanelState.waypoints); }
  if (vRes.ok) { PanelState.walls     = vRes.data.walls     ?? []; MapEngine.setWalls(PanelState.walls); }
  if (aRes.ok) { PanelState.areas     = aRes.data.areas     ?? []; MapEngine.setAreas(PanelState.areas); }
  if (rRes.ok && rRes.data.routes?.length) {
    const r2 = await API.get('/atlas/route');
    if (r2.ok) MapEngine.setRoutes([{ name: r2.data.name, waypoints: r2.data.waypoints ?? [] }]);
  }
}

/* ── Map legend ──────────────────────────────────────────────────────────── */
function addMapLegend() {
  const wrap = document.getElementById('map-container');
  const leg  = document.createElement('div');
  leg.className = 'map-legend';
  leg.innerHTML = `
    <div class="leg-item"><div class="leg-dot" style="background:#2563eb"></div>Robot</div>
    <div class="leg-item"><div class="leg-dot" style="background:#06b6d4"></div>LiDAR</div>
    <div class="leg-item"><div class="leg-line" style="background:#22c55e"></div>Global path</div>
    <div class="leg-item"><div class="leg-line" style="background:rgba(59,130,246,.6)"></div>Route</div>
    <div class="leg-item"><div class="leg-line" style="background:#dc2626"></div>Virtual wall</div>
    <div class="leg-item"><div class="leg-dot" style="background:rgba(124,58,237,.4);width:14px;height:14px;border-radius:2px"></div>Special area</div>
    <div class="leg-item"><div class="leg-dot" style="background:#eab308"></div>Goal</div>
  `;
  wrap.appendChild(leg);

  // Cursor position display
  const cur = document.createElement('div');
  cur.id = 'cursor-pos';
  cur.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#d1d5db;padding:3px 10px;border-radius:12px;font-size:11px;pointer-events:none';
  wrap.appendChild(cur);
}

/* ── Boot ────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  initSidebarResize();
  initSidebarToggle();
  initNavItems();
  initToolbar();
  initContextMenu();    // also calls MapEngine.init()
  addMapLegend();
  initWS();

  // Load map
  await MapEngine.loadMap();

  // Load overlays
  await loadOverlays();

  // Open navi-mode panel by default
  activatePanel('navi-mode');

  // Polling loops
  setInterval(pollStatus,  3000);
  setInterval(pollLaser,   1200);
  setInterval(pollNavPath, 1500);

  addLog('Atlas Navigation UI started', 'ok');
  addLog(`Connecting to API at ${Cfg.restHost}`, 'info');

  // Auto-refresh map every 8s
  setInterval(() => MapEngine.loadMap(), 8000);
});
