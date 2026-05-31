/**
 * api.js — REST client + WebSocket manager
 */
'use strict';

window.Cfg = {
  restHost: 'localhost:8080',
  wsHost:   'localhost:9090',
};

/* ── REST ──────────────────────────────────────────────────────────────────── */
window.API = {
  async req(method, path, body) {
    const opts = { method, headers: {'Content-Type':'application/json'} };
    if (body !== undefined) opts.body = JSON.stringify(body);
    try {
      const r = await fetch(`http://${Cfg.restHost}${path}`, opts);
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data: j };
    } catch(e) {
      return { ok: false, status: 0, data: { error: e.message } };
    }
  },
  get(path)        { return this.req('GET',    path);       },
  post(path, body) { return this.req('POST',   path, body); },
  del(path)        { return this.req('DELETE', path);       },
};

/* ── WebSocket ────────────────────────────────────────────────────────────── */
window.WS = (() => {
  let _ws    = null;
  let _retry = null;
  const _handlers = {};   // type → fn[]

  function on(type, fn) {
    (_handlers[type] ??= []).push(fn);
  }

  function _fire(type, data) {
    (_handlers[type] ?? []).forEach(fn => { try { fn(data); } catch(_){} });
    (_handlers['*']  ?? []).forEach(fn => { try { fn(type, data); } catch(_){} });
  }

  function connect() {
    if (_ws) { try { _ws.close(); } catch(_){} }
    _ws = new WebSocket(`ws://${Cfg.wsHost}`);
    _ws.onopen    = () => { _fire('$open');  clearTimeout(_retry); };
    _ws.onclose   = () => { _fire('$close'); _retry = setTimeout(connect, 3000); };
    _ws.onerror   = () => _fire('$error');
    _ws.onmessage = ({ data }) => {
      try { const m = JSON.parse(data); _fire(m.type ?? 'unknown', m); }
      catch (_) {}
    };
  }

  return { on, connect, get readyState() { return _ws?.readyState ?? 3; } };
})();
