'use strict';

/**
 * joystick.js — Virtual joystick overlay for manual robot driving.
 *
 * Vertical axis  → vx  (up = forward, down = backward)
 * Horizontal axis → wz (left = turn left, right = turn right)
 *
 * Sends POST /atlas/chassis/move at CMD_HZ while the knob is held.
 * Sends a stop command immediately on release.
 */
(function () {
  const MAX_VX  = 0.7;   // m/s  — max forward/backward speed
  const MAX_WZ  = 1.5;   // rad/s — max rotation speed
  const CMD_HZ  = 10;    // commands per second while active

  let _active   = false;
  let _vx = 0,  _wz = 0;
  let _dx = 0,  _dy = 0;   // current knob offset in pixels
  let _maxOffset = 40;      // computed once from DOM
  let _cmdTimer  = null;
  let _raf       = null;

  let _wrap, _base, _knob;

  // ── helpers ──────────────────────────────────────────────────────────────

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function _recompute() {
    _maxOffset = Math.max(10, _base.offsetWidth / 2 - _knob.offsetWidth / 2 - 4);
  }

  function _toVelocities(dx, dy) {
    const n = _maxOffset || 1;
    _vx = clamp(-dy / n * MAX_VX, -MAX_VX, MAX_VX);
    _wz = clamp(-dx / n * MAX_WZ, -MAX_WZ, MAX_WZ);
  }

  function _renderKnob() {
    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(() => {
      _knob.style.transform = `translate(calc(-50% + ${_dx}px), calc(-50% + ${_dy}px))`;
    });
  }

  function _snapBack() {
    _dx = 0; _dy = 0; _vx = 0; _wz = 0;
    _knob.style.transition = 'transform 0.18s cubic-bezier(.25,.8,.25,1)';
    _knob.style.transform  = 'translate(-50%, -50%)';
    setTimeout(() => (_knob.style.transition = ''), 200);
  }

  function _startLoop() {
    if (_cmdTimer) return;
    _cmdTimer = setInterval(() => {
      if (_active) {
        API.post('/atlas/chassis/move', {
          vx: +_vx.toFixed(3),
          vy: 0,
          wz: +_wz.toFixed(3),
        });
      }
    }, Math.round(1000 / CMD_HZ));
  }

  function _stopLoop() {
    if (_cmdTimer) { clearInterval(_cmdTimer); _cmdTimer = null; }
  }

  // ── pointer tracking ─────────────────────────────────────────────────────

  function _clientXY(e) {
    return e.touches
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX,            y: e.clientY            };
  }

  function _track(e) {
    if (!_active) return;
    e.preventDefault();
    const { x, y } = _clientXY(e);
    const r  = _base.getBoundingClientRect();
    const cx = r.left + r.width  / 2;
    const cy = r.top  + r.height / 2;
    let dx = x - cx, dy = y - cy;

    // Clamp knob travel to circle
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > _maxOffset) {
      const s = _maxOffset / dist;
      dx *= s; dy *= s;
    }

    _dx = dx; _dy = dy;
    _toVelocities(dx, dy);
    _renderKnob();
  }

  function _start(e) {
    e.preventDefault();
    _recompute();
    _active = true;
    _wrap.classList.add('js-active');
    _knob.style.transition = '';
    _startLoop();
    _track(e);
  }

  function _end() {
    if (!_active) return;
    _active = false;
    _wrap.classList.remove('js-active');
    _stopLoop();
    _snapBack();
    API.post('/atlas/chassis/move', { vx: 0, vy: 0, wz: 0 });
  }

  // ── init ─────────────────────────────────────────────────────────────────

  function init() {
    _wrap  = document.getElementById('joystick-wrap');
    _base  = document.getElementById('joystick-base');
    _knob  = document.getElementById('joystick-knob');
    if (!_wrap || !_base || !_knob) return;

    _recompute();

    // Mouse
    _base.addEventListener('mousedown',   _start);
    document.addEventListener('mousemove', _track);
    document.addEventListener('mouseup',   _end);

    // Touch
    _base.addEventListener('touchstart',   _start,  { passive: false });
    document.addEventListener('touchmove', _track,  { passive: false });
    document.addEventListener('touchend',  _end);
    document.addEventListener('touchcancel', _end);

    // Recompute sizes on resize
    window.addEventListener('resize', _recompute);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
