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
  const curMap = s.current_map || '—';
  const navStateBadge = s.nav_state === 'navigating'
    ? '<span class="badge badge-nav">navigating</span>'
    : `<span class="badge badge-idle">${s.nav_state ?? 'idle'}</span>`;

  P.render(`
    <div class="panel-title">Navigation Mode</div>

    <div class="p-card">
      <div class="p-card-header">Active Map</div>
      <div style="font-size:12px;color:#374151;font-weight:600;margin-bottom:8px" id="nm-live-map">${curMap}</div>
      <div class="btn-row">
        <button class="btn btn-secondary btn-sm" id="nm-restart-nav">${ICO.refresh} Restart Nav</button>
        <button class="btn btn-sm" id="nm-stop-nav"
          style="background:#dc2626;color:#fff;border-color:#dc2626">${ICO.stop} Stop Navigation</button>
      </div>
    </div>

    <div class="p-card">
      <div class="p-card-header">Robot Status</div>
      <div class="kv-grid">
        <div class="kv-row"><span class="kv-key">State</span>
          <span class="kv-val" id="nm-state">${navStateBadge}</span></div>
        <div class="kv-row"><span class="kv-key">Position</span>
          <span class="kv-val" id="nm-live-pos">(${f2(p.x)}, ${f2(p.y)})</span></div>
        <div class="kv-row"><span class="kv-key">Heading</span>
          <span class="kv-val" id="nm-live-head">${deg(p.yaw)}°</span></div>
        <div class="kv-row"><span class="kv-key">Speed</span>
          <span class="kv-val" id="nm-live-spd">${f2(s.linear_speed)} m/s</span></div>
        <div class="kv-row"><span class="kv-key">Battery</span>
          <span class="kv-val" id="nm-live-bat">${f1(s.battery)}%</span></div>
        <div class="kv-row"><span class="kv-key">E-Stop</span>
          <span class="kv-val ${s.emergency_stop?'badge badge-err':'badge badge-ok'}" id="nm-live-estop">${s.emergency_stop?'ACTIVE':'Off'}</span></div>
      </div>
    </div>

    <div class="p-card">
      <div class="p-card-header">Send Goal</div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px">
        Click <b>Click Map</b> rồi click (giữ kéo để chọn hướng) trên bản đồ
      </div>
      <div class="pf-row3">
        <div><label class="pf-label">X (m)</label><input class="pf-input" id="nm-gx" type="number" value="0" step="0.1"></div>
        <div><label class="pf-label">Y (m)</label><input class="pf-input" id="nm-gy" type="number" value="0" step="0.1"></div>
        <div><label class="pf-label">θ (°)</label><input class="pf-input" id="nm-gt" type="number" value="0" step="5"></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary btn-sm" id="nm-btn-go">${ICO.send} Navigate</button>
        <button class="btn btn-secondary btn-sm" id="nm-btn-cancel">${ICO.x} Cancel</button>
        <button class="btn btn-secondary btn-sm" id="nm-btn-click">${ICO.cursor} Click Map</button>
      </div>
    </div>

    <div class="p-card">
      <div class="p-card-header">Relocate (2D Pose Estimate)</div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px">
        Click <b>Pick on Map</b> rồi click+kéo trên bản đồ để đặt vị trí &amp; hướng
      </div>
      <div class="pf-row3">
        <div><label class="pf-label">X</label><input class="pf-input" id="nm-rx" type="number" value="${f3(p.x)}" step="0.1"></div>
        <div><label class="pf-label">Y</label><input class="pf-input" id="nm-ry" type="number" value="${f3(p.y)}" step="0.1"></div>
        <div><label class="pf-label">θ (°)</label><input class="pf-input" id="nm-rt" type="number" value="${deg(p.yaw)}" step="5"></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary btn-sm" id="nm-btn-reloc-pick">${ICO.cursor} Pick on Map</button>
        <button class="btn btn-secondary btn-sm" id="nm-btn-use-pose">${ICO.pin} Current</button>
        <button class="btn btn-secondary btn-sm" id="nm-btn-reloc" style="background:#059669;color:#fff;border-color:#059669">${ICO.apply} Set Pose</button>
      </div>
    </div>
  `);

  P.on('nm-restart-nav', 'click', async () => {
    const r = await API.post('/atlas/mode', { mode: 2 });
    r.ok ? toast('Restarting navigation…', 'info') : toast(r.data?.message ?? 'Error', 'err');
  });

  P.on('nm-stop-nav', 'click', async () => {
    if (!confirm('Stop navigation? (map_server and nav2 will be shut down)')) return;
    const r = await API.post('/atlas/mode', { mode: 0 });
    r.ok ? toast('Navigation stopped ■', 'info') : toast(r.data?.message ?? 'Error', 'err');
  });

  P.on('nm-btn-go', 'click', async () => {
    const x = +P.get('nm-gx').value, y = +P.get('nm-gy').value;
    const yaw = +P.get('nm-gt').value * Math.PI / 180;
    const r = await API.post('/atlas/nav/goal', { x, y, yaw });
    r.ok ? (toast('Navigation started ▶'), MapEngine.setGoal({x, y, yaw}))
         : toast(r.data?.message ?? 'Error', 'err');
  });

  P.on('nm-btn-cancel', 'click', async () => {
    await API.post('/atlas/nav/cancel', {});
    MapEngine.clearGoal(); toast('Cancelled', 'info');
  });

  P.on('nm-btn-click', 'click', () => {
    const btn = P.get('nm-btn-click');
    if (btn) { btn.innerHTML = `${ICO.cursor} Picking…`; btn.disabled = true; }
    toast('Click bản đồ để đặt goal · Kéo để chọn hướng', 'info');
    MapEngine.setTool('nav', (world, yaw) => {
      P.get('nm-gx').value = f3(world.x);
      P.get('nm-gy').value = f3(world.y);
      P.get('nm-gt').value = (yaw * 180 / Math.PI).toFixed(1);
      if (btn) { btn.innerHTML = `${ICO.cursor} Click Map`; btn.disabled = false; }
      toast(`Goal: (${f2(world.x)}, ${f2(world.y)}) θ=${(yaw*180/Math.PI).toFixed(0)}° — nhấn Navigate`, 'info');
      MapEngine.setTool('nav');
    });
  });

  P.on('nm-btn-reloc-pick', 'click', () => {
    const btn = P.get('nm-btn-reloc-pick');
    if (btn) { btn.innerHTML = `${ICO.cursor} Picking…`; btn.disabled = true; }
    toast('Click bản đồ để đặt vị trí · Kéo để chọn hướng', 'info');
    MapEngine.setTool('relocate', (world, yaw) => {
      P.get('nm-rx').value = f3(world.x);
      P.get('nm-ry').value = f3(world.y);
      P.get('nm-rt').value = (yaw * 180 / Math.PI).toFixed(1);
      if (btn) { btn.innerHTML = `${ICO.cursor} Pick on Map`; btn.disabled = false; }
      toast(`Pose: (${f2(world.x)}, ${f2(world.y)}) θ=${(yaw*180/Math.PI).toFixed(0)}° — nhấn Set Pose`, 'info');
      MapEngine.setTool('nav');
    });
  });

  P.on('nm-btn-reloc', 'click', async () => {
    const x = +P.get('nm-rx').value, y = +P.get('nm-ry').value;
    const yaw = +P.get('nm-rt').value * Math.PI / 180;
    const r = await API.post('/atlas/nav/relocate', { x, y, yaw });
    if (r.ok) {
      toast('Pose set 📍');
      MapEngine.setPose({ x, y, yaw });   // immediate visual feedback
    } else {
      toast(r.data?.message ?? 'Error', 'err');
    }
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
window.renderBuildMode = async function() {
  const [lsRes, mRes] = await Promise.all([
    API.get('/atlas/launch/status'),
    API.get('/atlas/map/list'),
  ]);
  const ls   = lsRes.ok ? lsRes.data : {};
  const maps = mRes.ok  ? (mRes.data.maps ?? []) : [];

  const isSlamRunning = ls.slam;
  const isNavRunning  = ls.navigation || ls.map_server;

  function badge(running) {
    return running
      ? '<span class="badge badge-nav">Running</span>'
      : '<span class="badge badge-idle">Stopped</span>';
  }

  // For incremental mapping: mark which maps have posegraph data
  // We do a quick check in the UI (user sees which maps can be extended)
  const mapOptsNav = maps.map(m =>
    `<option value="${m.name}">${m.alias || m.name.slice(0,16)}</option>`
  ).join('');

  const mapOptsIncr = maps.map(m =>
    `<option value="${m.name}" data-alias="${m.alias || m.name}">${m.alias || m.name.slice(0,16)}</option>`
  ).join('');

  P.render(`
    <div class="panel-title">Build / Mapping Mode</div>

    <!-- ── Status ─────────────────────────────────────── -->
    <div class="p-card">
      <div class="p-card-header" style="display:flex;justify-content:space-between;align-items:center">
        Launch Status
        <button class="btn btn-secondary btn-sm btn-icon" id="bm-refresh" title="Refresh">${ICO.refresh}</button>
      </div>
      <div class="kv-grid">
        <div class="kv-row"><span class="kv-key">SLAM</span>        <span class="kv-val">${badge(ls.slam)}</span></div>
        <div class="kv-row"><span class="kv-key">Map Server</span>  <span class="kv-val">${badge(ls.map_server)}</span></div>
        <div class="kv-row"><span class="kv-key">Navigation</span>  <span class="kv-val">${badge(ls.navigation)}</span></div>
      </div>
    </div>

    <!-- ── Fresh SLAM ──────────────────────────────────── -->
    <div class="p-card">
      <div class="p-card-header">
        <span style="display:flex;align-items:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          Tạo bản đồ mới (Fresh SLAM)
        </span>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:8px">
        Xóa bản đồ cũ và bắt đầu quét lại từ đầu. Robot cần được điều khiển thủ công để quét toàn bộ không gian.
      </div>
      <button class="btn btn-primary btn-full" id="bm-start" ${isSlamRunning?'disabled':''}>
        ${ICO.play} Start Fresh SLAM
      </button>
    </div>

    <!-- ── Incremental Mapping ─────────────────────────── -->
    <div class="p-card" style="border-color:#93c5fd">
      <div class="p-card-header" style="color:#1d4ed8">
        <span style="display:flex;align-items:center;gap:6px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7-7 7 7"/><path d="M5 19h14"/></svg>
          Mở rộng bản đồ có sẵn (Incremental)
        </span>
      </div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:8px">
        Tải bản đồ đã có và tiếp tục quét thêm vùng mới. Yêu cầu file posegraph (<code>.posegraph</code>) do slam_toolbox tạo ra.
        Đảm bảo robot đã được định vị đúng trên bản đồ trước khi bắt đầu.
      </div>
      <label class="pf-label">Chọn bản đồ cần mở rộng</label>
      <select class="pf-input" id="bm-incr-map">
        <option value="">— chọn bản đồ —</option>
        ${mapOptsIncr}
      </select>
      <div id="bm-incr-status" style="font-size:11px;margin:6px 0;min-height:16px"></div>
      <button class="btn btn-full" id="bm-incr" disabled
        style="background:#1d4ed8;color:#fff;border-color:#1d4ed8">
        ${ICO.up} Extend Selected Map
      </button>
    </div>

    <!-- ── Save Map ────────────────────────────────────── -->
    <div class="p-card" ${!isSlamRunning ? 'style="opacity:.55;pointer-events:none"' : ''}>
      <div class="p-card-header">Lưu bản đồ hiện tại</div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:8px">
        ${isSlamRunning
          ? 'SLAM đang chạy — lưu bản đồ khi đã quét xong.'
          : 'Bắt đầu SLAM hoặc Incremental trước rồi mới lưu.'}
      </div>
      <label class="pf-label">Tên / Alias</label>
      <input class="pf-input" id="bm-alias" type="text" placeholder="Warehouse Floor 1">
      <button class="btn btn-primary btn-full" id="bm-save" style="margin-top:6px">
        ${ICO.save} Save Current Map
      </button>
    </div>

    <!-- ── Switch to Nav ───────────────────────────────── -->
    <div class="p-card">
      <div class="p-card-header">Chuyển sang Navigation Mode</div>
      <label class="pf-label">Chọn bản đồ để load</label>
      <select class="pf-input" id="bm-map-sel">
        <option value="">— dùng bản đồ hiện tại —</option>
        ${mapOptsNav}
      </select>
      <button class="btn btn-full" id="bm-tonav"
        style="margin-top:8px;background:#059669;color:#fff;border-color:#059669">
        ${ICO.send} Switch to Navigation Mode
      </button>
    </div>
  `);

  P.on('bm-refresh', 'click', window.renderBuildMode);

  // Fresh SLAM
  P.on('bm-start', 'click', async () => {
    if (!confirm('Bắt đầu SLAM mới sẽ dừng navigation. Tiếp tục?')) return;
    const r = await API.post('/atlas/mode', { mode: 1 });
    r.ok ? (toast('Fresh SLAM started'), setTimeout(window.renderBuildMode, 1500))
         : toast(r.data?.message ?? 'Error', 'err');
  });

  // Incremental: check posegraph when map changes
  P.on('bm-incr-map', 'change', async () => {
    const name = P.get('bm-incr-map').value;
    const statusEl = P.get('bm-incr-status');
    const btn      = P.get('bm-incr');
    if (!name) {
      if (statusEl) statusEl.textContent = '';
      if (btn) btn.disabled = true;
      return;
    }
    if (statusEl) statusEl.innerHTML = '<span style="color:#6b7280">Checking…</span>';
    const r = await API.get(`/atlas/map/has_posegraph/${encodeURIComponent(name)}`);
    if (!r.ok) { if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626">Error checking map</span>'; return; }
    if (r.data.has_posegraph) {
      if (statusEl) statusEl.innerHTML =
        `<span style="color:#059669">&#10003; Posegraph found — map can be extended</span>`;
      if (btn) btn.disabled = false;
    } else {
      if (statusEl) statusEl.innerHTML =
        `<span style="color:#dc2626">&#10007; No posegraph — this map cannot be extended (was it made by slam_toolbox?)</span>`;
      if (btn) btn.disabled = true;
    }
  });

  // Incremental: start
  P.on('bm-incr', 'click', async () => {
    const mapName = P.get('bm-incr-map').value;
    if (!mapName) { toast('Select a map first', 'err'); return; }
    if (!confirm(`Mở rộng bản đồ "${mapName}"? Navigation sẽ bị dừng.`)) return;
    const r = await API.post('/atlas/mode', { mode: 3, map: mapName });
    r.ok ? (toast(`Incremental mapping started — extending "${mapName}"`),
            setTimeout(window.renderBuildMode, 1500))
         : toast(r.data?.message ?? 'Error', 'err');
  });

  // Save
  P.on('bm-save', 'click', async () => {
    const alias = P.get('bm-alias').value.trim() || 'unnamed';
    const btn = P.get('bm-save');
    if (btn) { btn.innerHTML = `${ICO.refresh} Saving…`; btn.disabled = true; }
    const r = await API.post('/atlas/map/save', { alias });
    if (btn) { btn.innerHTML = `${ICO.save} Save Current Map`; btn.disabled = false; }
    if (r.ok) {
      const f = r.data.files ?? {};
      const parts = [];
      if (f.yaml_pgm)  parts.push('.yaml + .pgm');
      if (f.posegraph) parts.push('.posegraph + .data');
      const detail = parts.length ? ` (${parts.join(', ')})` : '';
      const note   = f.posegraph ? '' : ` — posegraph: ${f.posegraph_note ?? 'skipped'}`;
      toast(`"${alias}" saved${detail}${note}`, f.posegraph ? 'ok' : 'info');
      window.renderBuildMode();
    } else {
      toast(r.data?.message ?? 'Save failed', 'err');
    }
  });

  // Switch to nav
  P.on('bm-tonav', 'click', async () => {
    const mapName = P.get('bm-map-sel')?.value || '';
    const body = { mode: 2 };
    if (mapName) body.map = mapName;
    const r = await API.post('/atlas/mode', body);
    r.ok ? (toast('Switching to Navigation…', 'info'), setTimeout(window.renderBuildMode, 2000))
         : toast(r.data?.message ?? 'Error', 'err');
  });
};

/* ══════════════════════════════════════════════════════════════════════════
   3. POSITION (Waypoints)
   ══════════════════════════════════════════════════════════════════════════ */
window.renderPosition = async function() {
  const r = await API.get('/atlas/waypoints');
  PanelState.waypoints = r.ok ? (r.data.waypoints ?? []) : [];
  MapEngine.setWaypoints(PanelState.waypoints);
  MapEngine.clearPreviewWaypoint();

  P.render(`
    <div class="panel-title">Positions / Waypoints
      <div class="pt-right">
        <button class="btn btn-primary btn-sm" id="wp-add-btn">${ICO.plus} Add</button>
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
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px">
        Click bản đồ để chọn vị trí, kéo để chọn hướng
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary btn-sm" id="wp-pick-btn">${ICO.pin} Pick on map</button>
        <button class="btn btn-primary btn-sm"   id="wp-save-btn">${ICO.check} Save</button>
        <button class="btn btn-secondary btn-sm" id="wp-cancel-btn">${ICO.x} Cancel</button>
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
    const btn = P.get('wp-pick-btn');
    // Toggle: if already picking, stop; otherwise start
    if (btn && btn.dataset.picking === '1') {
      btn.innerHTML = `${ICO.pin} Pick on map`;
      btn.dataset.picking = '0';
      MapEngine.setTool('position');
      return;
    }
    if (btn) { btn.innerHTML = `${ICO.cursor} Picking… (click again to stop)`; btn.dataset.picking = '1'; }
    toast('Click bản đồ · Kéo để chọn hướng · Click nút lại để dừng', 'info');

    // Persistent callback — re-registers itself so each click updates the fields
    const pickCb = (world, yaw) => {
      const xEl = P.get('wp-x'), yEl = P.get('wp-y'), tEl = P.get('wp-yaw');
      if (xEl) xEl.value = f3(world.x);
      if (yEl) yEl.value = f3(world.y);
      if (tEl) tEl.value = (yaw * 180 / Math.PI).toFixed(1);
      MapEngine.setPreviewWaypoint({ x: world.x, y: world.y, yaw });
      // Stay in pick mode for the next click
      MapEngine.setTool('position', pickCb);
    };
    MapEngine.setTool('position', pickCb);
  });

  // Update preview when inputs change manually
  ['wp-x','wp-y','wp-yaw'].forEach(id => {
    P.on(id, 'input', () => {
      const x = +(P.get('wp-x')?.value ?? 0);
      const y = +(P.get('wp-y')?.value ?? 0);
      const yaw = +(P.get('wp-yaw')?.value ?? 0) * Math.PI / 180;
      MapEngine.setPreviewWaypoint({ x, y, yaw });
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
    if (r.ok) {
      toast(`"${name}" saved`);
      MapEngine.clearPreviewWaypoint();
      MapEngine.setTool('nav');
      window.renderPosition();
    } else {
      toast(r.data?.message ?? 'Error', 'err');
    }
  });

  P.on('wp-cancel-btn', 'click', () => {
    P.get('wp-add-form').style.display = 'none';
    P.get('wp-add-btn').style.display = '';
    MapEngine.clearPreviewWaypoint();
    MapEngine.setTool('nav');
    const btn = P.get('wp-pick-btn');
    if (btn) { btn.innerHTML = `${ICO.pin} Pick on map`; btn.dataset.picking = '0'; }
  });

  // Go button (non-charger waypoints)
  document.querySelectorAll('[data-wp-go]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { x, y, yaw } = PanelState.waypoints.find(w => w.name === btn.dataset.wpGo) ?? {};
      if (x == null) return;
      const r = await API.post('/atlas/nav/goal', { x, y, yaw: yaw ?? 0 });
      r.ok ? (MapEngine.setGoal({x, y, yaw: yaw ?? 0}), toast(`Navigating to "${btn.dataset.wpGo}"`))
           : toast(r.data?.message ?? 'Error', 'err');
    });
  });

  // Charger: Approach (Stage 1)
  document.querySelectorAll('[data-wp-approach]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.wpApproach;
      const wp = PanelState.waypoints.find(w => w.name === name);
      if (!wp) return;
      const r = await API.post('/atlas/nav/charge_approach', { name });
      r.ok ? (MapEngine.setGoal({x: wp.x, y: wp.y, yaw: wp.yaw ?? 0}),
              toast(`Approaching charger "${name}"`))
           : toast(r.data?.message ?? 'Error', 'err');
    });
  });

  // Charger: Dock (Stage 2)
  document.querySelectorAll('[data-wp-dock]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.wpDock;
      const r = await API.post('/atlas/nav/charge_dock', { name });
      r.ok ? toast(`Docking into "${name}_dock"`)
           : toast(r.data?.message ?? 'Dock waypoint not found — create a waypoint named "' + name + '_dock"', 'err');
    });
  });

  // Charger: Full sequence (approach → auto-dock)
  document.querySelectorAll('[data-wp-charge]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.wpCharge;
      const wp = PanelState.waypoints.find(w => w.name === name);
      if (!wp) return;
      const r = await API.post('/atlas/nav/charge', { name });
      r.ok ? (MapEngine.setGoal({x: wp.x, y: wp.y, yaw: wp.yaw ?? 0}),
              toast(`Full charge: approaching then docking into "${name}"`))
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

const _WP_TYPE_ICON = {
  charger:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  delivery: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="10" r="3"/><path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z"/></svg>`,
  avoid:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
  custom:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
};

// SVG for the dock/plug action button
const _ICO_DOCK = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/><circle cx="5" cy="12" r="2" fill="currentColor"/></svg>`;

function _wpRow(w) {
  const icon = _WP_TYPE_ICON[w.type] ?? _WP_TYPE_ICON.custom;
  // Charger waypoints get special approach / dock / charge-all buttons
  const isCharger = w.type === 'charger';
  const chargerBtns = isCharger ? `
    <button class="btn btn-sm btn-secondary btn-icon" data-wp-approach="${w.name}" title="Approach charger">${ICO.play}</button>
    <button class="btn btn-sm btn-secondary btn-icon" data-wp-dock="${w.name}"     title="Dock into charger">${_ICO_DOCK}</button>
    <button class="btn btn-sm btn-secondary btn-icon" data-wp-charge="${w.name}"   title="Full charge sequence (approach + dock)">${ICO.send}</button>
  ` : `
    <button class="btn btn-sm btn-secondary btn-icon" data-wp-go="${w.name}" title="Navigate to">${ICO.play}</button>
  `;
  return `
    <div class="item-row">
      <div style="display:flex;align-items:flex-start;gap:6px;min-width:0">
        <span style="margin-top:2px;flex-shrink:0">${icon}</span>
        <div style="min-width:0">
          <div class="item-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.name}</div>
          <div class="item-meta">${w.type} · (${f2(w.x)}, ${f2(w.y)}) ${deg(w.yaw)}°</div>
        </div>
      </div>
      <div class="item-acts">
        ${chargerBtns}
        <button class="btn btn-sm btn-danger btn-icon" data-wp-del="${w.name}" title="Delete">${ICO.trash}</button>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   4. NAVI ROUTE
   ══════════════════════════════════════════════════════════════════════════ */

// Persists the selected waypoint sequence across re-renders of the builder
let _routeItems = [];  // [{name, x, y, yaw}, …]

function _rebuildRouteForm() {
  const avail = PanelState.waypoints;
  const selectedNames = new Set(_routeItems.map(w => w.name));

  // Sequence list
  const seqHtml = _routeItems.length
    ? _routeItems.map((w, i) => `
        <div class="rt-seq-item">
          <span class="rt-seq-num">${i + 1}</span>
          <span class="rt-seq-name">${w.name}</span>
          <div class="item-acts">
            <button class="btn btn-sm btn-secondary btn-icon rt-seq-up" data-idx="${i}" ${i===0?'disabled':''} title="Move up">${ICO.up}</button>
            <button class="btn btn-sm btn-secondary btn-icon rt-seq-dn" data-idx="${i}" ${i===_routeItems.length-1?'disabled':''} title="Move down">${ICO.dn}</button>
            <button class="btn btn-sm btn-danger    btn-icon rt-seq-rm" data-idx="${i}" title="Remove">${ICO.x}</button>
          </div>
        </div>`).join('')
    : '<div style="color:#6b7280;font-size:11px;padding:6px 0">Chưa có điểm nào — click + bên dưới để thêm</div>';

  // Available waypoints
  const availHtml = avail.length
    ? avail.map(w => `
        <div class="rt-avail-item${selectedNames.has(w.name) ? ' rt-avail-added' : ''}">
          <div>
            <span class="rt-avail-name">${w.name}</span>
            <span class="rt-avail-meta">(${f2(w.x)}, ${f2(w.y)}) ${deg(w.yaw)}°</span>
          </div>
          <button class="btn btn-sm btn-primary btn-icon rt-add-wp" data-name="${w.name}" title="Add to route">${ICO.plus}</button>
        </div>`).join('')
    : '<div style="color:#6b7280;font-size:11px">Chưa có position nào. Tạo positions trước.</div>';

  const seq = document.getElementById('rt-sequence');
  const av  = document.getElementById('rt-avail-list');
  if (seq) seq.innerHTML = seqHtml;
  if (av)  av.innerHTML  = availHtml;

  // Bind sequence controls
  document.querySelectorAll('.rt-seq-up').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.idx;
    if (i > 0) { [_routeItems[i-1], _routeItems[i]] = [_routeItems[i], _routeItems[i-1]]; _rebuildRouteForm(); }
  }));
  document.querySelectorAll('.rt-seq-dn').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.idx;
    if (i < _routeItems.length-1) { [_routeItems[i], _routeItems[i+1]] = [_routeItems[i+1], _routeItems[i]]; _rebuildRouteForm(); }
  }));
  document.querySelectorAll('.rt-seq-rm').forEach(b => b.addEventListener('click', () => {
    _routeItems.splice(+b.dataset.idx, 1); _rebuildRouteForm();
  }));

  // Bind add buttons
  document.querySelectorAll('.rt-add-wp').forEach(b => b.addEventListener('click', () => {
    const wp = PanelState.waypoints.find(w => w.name === b.dataset.name);
    if (!wp) return;
    _routeItems.push({ name: wp.name, x: wp.x, y: wp.y, yaw: wp.yaw ?? 0 });
    _rebuildRouteForm();
  }));

  // Update map route preview
  MapEngine.setRoutes([{ name: 'preview', waypoints: _routeItems }]);
}

window.renderNaviRoute = async function() {
  const [rList, wpRes] = await Promise.all([
    API.get('/atlas/route/list'),
    API.get('/atlas/waypoints'),
  ]);
  const names = rList.ok ? (rList.data.routes ?? []) : [];
  if (wpRes.ok) PanelState.waypoints = wpRes.data.waypoints ?? [];

  P.render(`
    <div class="panel-title">Navi Routes
      <div class="pt-right">
        <button class="btn btn-primary btn-sm" id="rt-new-btn">${ICO.plus} New</button>
      </div>
    </div>

    <div id="rt-new-form" class="p-card" style="display:none">
      <div class="p-card-header">Create Route</div>
      <label class="pf-label">Route name</label>
      <input class="pf-input" id="rt-name" placeholder="patrol_loop">
      <label style="display:flex;align-items:center;gap:6px;margin:6px 0;font-size:12px;color:#d1d5db">
        <input type="checkbox" id="rt-loop"> Loop continuously
      </label>

      <div class="p-card-header" style="margin-top:8px">Route sequence</div>
      <div id="rt-sequence" class="rt-sequence-box"></div>

      <div class="p-card-header" style="margin-top:8px">Available positions</div>
      <div id="rt-avail-list" class="rt-avail-box"></div>

      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn-primary btn-sm"   id="rt-save-btn">${ICO.check} Save Route</button>
        <button class="btn btn-secondary btn-sm" id="rt-cancel-btn">${ICO.x} Cancel</button>
      </div>
    </div>

    <div class="item-list" id="rt-list">
      ${names.map(n => _routeRow(n)).join('') || '<div style="color:#9ca3af;font-size:12px;padding:8px">No routes</div>'}
    </div>
  `);

  P.on('rt-new-btn', 'click', () => {
    _routeItems = [];
    P.get('rt-new-form').style.display = '';
    P.get('rt-new-btn').style.display = 'none';
    _rebuildRouteForm();
  });

  P.on('rt-save-btn', 'click', async () => {
    const name = P.get('rt-name').value.trim();
    if (!name) { toast('Name required', 'err'); return; }
    if (!_routeItems.length) { toast('Add at least one waypoint', 'err'); return; }
    const r2 = await API.post('/atlas/route', {
      name, loop: P.get('rt-loop').checked, waypoints: _routeItems,
    });
    if (r2.ok) {
      toast(`Route "${name}" saved`);
      _routeItems = [];
      window.renderNaviRoute();
    } else {
      toast(r2.data?.message ?? 'Error', 'err');
    }
  });

  P.on('rt-cancel-btn', 'click', () => {
    _routeItems = [];
    P.get('rt-new-form').style.display = 'none';
    P.get('rt-new-btn').style.display = '';
    MapEngine.setRoutes([]);
  });

  document.querySelectorAll('[data-rt-start]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r2 = await API.post('/atlas/route/start', { name: btn.dataset.rtStart });
      r2.ok ? toast(`Patrol started: ${btn.dataset.rtStart}`)
             : toast(r2.data?.message ?? 'Error', 'err');
    });
  });

  document.querySelectorAll('[data-rt-stop]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await API.post('/atlas/nav/cancel', {});
      MapEngine.clearGoal();
      toast('Route stopped', 'info');
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
      <div>
        <div class="item-name">${name}</div>
      </div>
      <div class="item-acts">
        <button class="btn btn-sm btn-primary   btn-icon" data-rt-start="${name}" title="Start patrol">${ICO.play}</button>
        <button class="btn btn-sm btn-secondary btn-icon" data-rt-stop              title="Stop">${ICO.stop}</button>
        <button class="btn btn-sm btn-danger    btn-icon" data-rt-del="${name}"   title="Delete">${ICO.trash}</button>
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
        <button class="btn btn-primary btn-sm" id="vw-draw-btn">${ICO.pencil} Draw</button>
      </div>
    </div>
    <div class="p-card" style="background:#fef2f2;border-color:#fca5a5">
      <div style="font-size:11px;color:#991b1b">
        Click <b>Draw</b> rồi click trên bản đồ để đặt điểm tường.<br>
        Double-click để kết thúc. Right-click để xoá điểm cuối.
      </div>
    </div>
    <div class="item-list" id="vw-list">
      ${PanelState.walls.map((w,i) => _wallRow(w,i)).join('') || '<div style="color:#9ca3af;font-size:12px;padding:8px">No virtual walls</div>'}
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn btn-danger btn-sm btn-full" id="vw-clear-all">${ICO.trash} Clear All Walls</button>
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
        <button class="btn btn-sm btn-danger btn-icon" data-vw-del="${w.id}" title="Delete">${ICO.trash}</button>
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
        <button class="btn btn-primary btn-sm" id="sa-draw-btn">${ICO.pencil} Draw</button>
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
        Click trên bản đồ để vẽ polygon. Click gần điểm đầu để đóng vùng.
      </div>
      <div class="btn-row">
        <button class="btn btn-danger btn-sm" id="sa-cancel-draw">${ICO.x} Cancel Draw</button>
      </div>
    </div>
    <div class="p-card" style="background:#fef9c3;border-color:#fde68a">
      <div style="font-size:11px;color:#92400e">
        Click <b>Draw</b>, đặt tên/loại, rồi vẽ polygon trên bản đồ.<br>
        Click gần đỉnh đầu để đóng. Right-click để hoàn tác.
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
        <div class="item-name" style="display:flex;align-items:center;gap:5px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${tc}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 3 20 9 17 19 7 19 4 9"/></svg><span style="color:${tc}">${a.name || a.id}</span></div>
        <div class="item-meta">${a.type} · ${a.speed} m/s · ${a.polygon.length} pts</div>
      </div>
      <div class="item-acts">
        <button class="btn btn-sm btn-danger btn-icon" data-sa-del="${a.id}" title="Delete">${ICO.trash}</button>
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
        <button class="btn btn-secondary btn-sm btn-icon" id="ml-refresh" title="Refresh list">${ICO.refresh}</button>
        <button class="btn btn-primary btn-sm"   id="ml-reload-map">${ICO.map} Reload Map</button>
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
      <button class="btn btn-primary btn-sm btn-full" id="ml-upload-btn" style="margin-top:6px">${ICO.upload} Upload</button>
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
      const name = btn.dataset.mlApply;
      const curMode = PanelState.status?.mode ?? 2;
      if (curMode === 2) {
        // In nav mode: apply map triggers map_server restart via backend
        const r = await API.post('/atlas/map/apply', { name });
        r.ok ? (toast('Map switched — reloading map server…', 'info'), MapEngine.loadMap(), window.renderMapList())
             : toast(r.data?.message ?? 'Error', 'err');
      } else {
        // In build/mapping mode: switch to nav with this map
        const r = await API.post('/atlas/mode', { mode: 2, map: name });
        r.ok ? (toast('Switching to navigation with selected map…', 'info'), MapEngine.loadMap(), window.renderMapList())
             : toast(r.data?.message ?? 'Error', 'err');
      }
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
  const thumbUrl = `http://${Cfg.restHost}/atlas/map/thumbnail/${encodeURIComponent(m.name)}`;
  return `
    <div class="item-row map-item-row" ${isCurrent ? 'style="border-color:#93c5fd;background:#eff6ff"' : ''}>
      <img class="map-thumb" src="${thumbUrl}"
           alt="" onerror="this.style.display='none'"
           title="${m.alias || m.name}">
      <div style="flex:1;min-width:0">
        <div class="item-name" style="display:flex;align-items:center;gap:5px">
          ${isCurrent ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.alias || '(unnamed)'}</span>
        </div>
        <div class="item-meta" style="font-family:monospace">${m.name?.slice(0,18)}</div>
      </div>
      <div class="item-acts">
        <button class="btn btn-sm btn-primary   btn-icon" data-ml-apply="${m.name}" title="Load map">${ICO.apply}</button>
        <button class="btn btn-sm btn-secondary btn-icon" data-ml-dl="${m.name}"    title="Export">${ICO.download}</button>
        <button class="btn btn-sm btn-danger    btn-icon" data-ml-del="${m.name}"   title="Delete">${ICO.trash}</button>
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
      <button class="btn btn-secondary btn-sm btn-icon" onclick="renderRobotStatus()" title="Refresh">${ICO.refresh}</button>
    </div>

    <div class="p-card">
      <div class="p-card-header">Battery & Power</div>
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
      <div class="p-card-header">IMU — Acceleration (m/s²)</div>
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
      <div class="p-card-header">Pose & Velocity</div>
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
      <button class="btn btn-secondary btn-sm btn-icon" onclick="renderLogs()" title="Clear logs">${ICO.trash}</button>
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
  { g:'System',     m:'POST', p:'/atlas/mode', b:'{"mode":1}' },
  { g:'System',     m:'POST', p:'/atlas/mode', b:'{"mode":2,"map":"<map_id>"}' },
  { g:'System',     m:'GET',  p:'/atlas/launch/status' },
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
      <button class="btn btn-primary btn-sm" id="ar-send">${ICO.send} Send</button>
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
  const s = PanelState.settings;

  // Structured nav params with labels, units, hints
  const NAV_PARAMS = [
    { key: 'max_speed',         label: 'Max speed',          unit: 'm/s',  step: 0.05, min: 0.05, max: 2.0,
      hint: 'velocity_smoother + controller_server vx_max' },
    { key: 'min_speed',         label: 'Min speed',          unit: 'm/s',  step: 0.05, min: 0.0,  max: 0.5,
      hint: 'velocity_smoother min_velocity' },
    { key: 'inflation_radius',  label: 'Inflation radius',   unit: 'm',    step: 0.05, min: 0.05, max: 1.0,
      hint: 'local & global costmap inflation layer' },
    { key: 'robot_radius',      label: 'Robot radius',       unit: 'm',    step: 0.05, min: 0.1,  max: 1.0,
      hint: 'local & global costmap footprint' },
    { key: 'xy_goal_tolerance', label: 'XY goal tolerance',  unit: 'm',    step: 0.05, min: 0.05, max: 1.0,
      hint: 'controller_server general_goal_checker' },
    { key: 'yaw_goal_tolerance',label: 'Yaw goal tolerance', unit: 'rad',  step: 0.05, min: 0.05, max: 1.57,
      hint: 'controller_server general_goal_checker' },
  ];

  const paramRows = NAV_PARAMS.map(p => `
    <div class="setting-row">
      <div>
        <div class="lbl">${p.label}</div>
        <div class="desc">${p.hint}</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <input class="pf-input" id="ns-${p.key}" type="number"
          value="${s[p.key] ?? ''}" step="${p.step}" min="${p.min}" max="${p.max}"
          style="width:80px;text-align:right">
        <span style="font-size:11px;color:#6b7280;width:28px">${p.unit}</span>
      </div>
    </div>`).join('');

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
        <button class="btn btn-primary btn-sm" id="cfg-save-conn">${ICO.apply} Apply</button>
      </div>
    </div>

    <div class="settings-section">
      <h4>Navigation Parameters</h4>
      <div style="font-size:11px;color:#6b7280;margin-bottom:8px;padding:6px;background:#f9fafb;border-radius:4px;border:1px solid #e5e7eb">
        Các thông số này được gửi trực tiếp đến nav2 nodes đang chạy qua ROS2 set_parameters service.
        Nav2 phải đang chạy để có hiệu lực.
      </div>
      ${paramRows}
      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn-primary btn-sm" id="cfg-save-nav">${ICO.save} Save &amp; Apply to Nav2</button>
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
    NAV_PARAMS.forEach(({ key }) => {
      const el = P.get(`ns-${key}`);
      if (el && el.value !== '') updates[key] = parseFloat(el.value);
    });
    const btn = P.get('cfg-save-nav');
    if (btn) { btn.innerHTML = `${ICO.refresh} Applying…`; btn.disabled = true; }
    const r2 = await API.post('/atlas/settings', updates);
    if (btn) { btn.innerHTML = `${ICO.save} Save & Apply to Nav2`; btn.disabled = false; }
    if (r2.ok) {
      toast('Settings saved & sent to nav2');
      PanelState.settings = { ...PanelState.settings, ...updates };
    } else {
      toast('Failed to save', 'err');
    }
  });
};

/* ── SVG icon helpers ────────────────────────────────────────────────────────── */
const ICO = {
  pin:      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z"/></svg>`,
  cursor:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 9-7 1-4 7z"/></svg>`,
  check:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x:        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  play:     `<svg width="12" height="12" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg>`,
  trash:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  plus:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  up:       `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>`,
  dn:       `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  stop:     `<svg width="12" height="12" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="currentColor"/></svg>`,
  pencil:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  refresh:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  upload:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
  download: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`,
  save:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
  map:      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>`,
  wall:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="2" fill="currentColor"/><circle cx="20" cy="4" r="2" fill="currentColor"/></svg>`,
  area:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 3 20 9 17 19 7 19 4 9"/></svg>`,
  send:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  apply:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
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
