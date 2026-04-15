/**
 * LiveCursorsEngine — shared core for embed.js and embed-wc.js
 *
 * Encapsulates all cursor rendering, WebSocket communication, presence,
 * snap highlighting, cursor chat, and auth token management.
 *
 * Usage:
 *   var engine = new LiveCursorsEngine({ server, room, ... });
 *   engine.start();   // inject DOM, bind events, connect WebSocket
 *   engine.destroy();  // clean up everything
 */

/* ── CSS (injected once per document) ─────────────────────────────────── */
var _lcStyleInjected = false;
var LC_STYLES = `
  .lc-cursor{position:fixed;pointer-events:none;z-index:999999;transition:left 80ms linear,top 80ms linear;opacity:0;will-change:left,top}
  .lc-cursor.active{opacity:1;transition:left 80ms linear,top 80ms linear,opacity .3s}
  .lc-cursor.leaving{opacity:0;transition:opacity .3s}
  .lc-cursor.touch .lc-arrow{display:none}
  .lc-cursor.touch .lc-touch-dot{display:flex}
  .lc-arrow{display:block}
  .lc-touch-dot{display:none;width:28px;height:28px;border-radius:50%;opacity:.55;border:2px solid #fff;box-shadow:0 0 8px rgba(0,0,0,.15);margin-left:-14px;margin-top:-14px;align-items:center;justify-content:center}
  .lc-info{display:flex;align-items:center;gap:4px;margin-left:10px;margin-top:-2px}
  .lc-cursor.touch .lc-info{margin-left:-4px;margin-top:14px}
  .lc-avatar{width:20px;height:20px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.12)}
  .lc-dot{width:20px;height:20px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;color:#fff;font:bold 10px/1 system-ui}
  .lc-label{padding:1px 6px;border-radius:4px;font:500 11px/1.4 system-ui;color:#fff;white-space:nowrap;opacity:0;transform:translateX(-3px);transition:opacity .15s,transform .15s}
  .lc-cursor:hover .lc-label{opacity:1;transform:translateX(0)}
  .lc-edge{position:fixed;z-index:999998;display:flex;align-items:center;gap:4px;padding:3px 8px 3px 4px;border-radius:12px;font:500 11px/1 system-ui;color:#fff;white-space:nowrap;cursor:pointer;opacity:.8;transition:opacity .2s,transform .15s;pointer-events:auto}
  .lc-edge:hover{opacity:1;transform:scale(1.06)}
  .lc-edge .lc-e-av{width:18px;height:18px;border-radius:50%;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font:bold 9px/1 system-ui;color:#fff}
  .lc-edge .lc-e-av img{width:100%;height:100%;object-fit:cover}
  .lc-presence{position:fixed;top:12px;right:12px;z-index:999998;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:4px 12px 4px 8px;border-radius:24px;box-shadow:0 1px 6px rgba(0,0,0,.08);border:1px solid rgba(0,0,0,.06)}
  .lc-presence.lc-presence--mounted{position:static;background:none;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none;border:none;padding:0}
  .lc-presence-avatars{display:flex;align-items:center}
  .lc-p-avatar{width:32px;height:32px;border-radius:50%;border:2px solid #fff;margin-left:-8px;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font:600 13px/1 system-ui;color:#fff;cursor:pointer;text-decoration:none;transition:margin-left .3s ease,transform .2s;position:relative;box-shadow:0 1px 4px rgba(0,0,0,.1)}
  .lc-p-avatar:first-child{margin-left:0}
  .lc-presence-avatars:hover .lc-p-avatar{margin-left:4px}
  .lc-presence-avatars:hover .lc-p-avatar:first-child{margin-left:0}
  .lc-p-avatar:hover{transform:scale(1.12);z-index:10!important}
  .lc-p-avatar img{width:100%;height:100%;object-fit:cover}
  .lc-p-overflow{width:32px;height:32px;border-radius:50%;border:2px solid #fff;margin-left:-8px;background:#6b7280;color:#fff;display:flex;align-items:center;justify-content:center;font:700 11px/1 system-ui;box-shadow:0 1px 4px rgba(0,0,0,.1)}
  .lc-nav-divider{width:1px;height:20px;background:rgba(0,0,0,.1);flex-shrink:0}
  .lc-btn-login{display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border-radius:8px;background:#24292f;color:#fff;text-decoration:none;font:500 13px/1 system-ui;transition:background .2s;border:none;cursor:pointer;white-space:nowrap}
  .lc-btn-login:hover{background:#1b1f23}
  .lc-btn-login svg{width:18px;height:18px;fill:currentColor;flex-shrink:0}
  .lc-avatar-logout{width:30px;height:30px;border-radius:50%;padding:0;background:none;border:1.5px solid rgba(0,0,0,.06);overflow:hidden;cursor:pointer;position:relative;flex-shrink:0;transition:border-color .2s,transform .2s}
  .lc-avatar-logout:hover{border-color:#ef4444;transform:scale(1.08)}
  .lc-avatar-logout img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
  .lc-avatar-logout::after{content:'\\2715';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(220,38,38,.75);color:#fff;font:700 13px/1 system-ui;opacity:0;transition:opacity .18s;border-radius:50%}
  .lc-avatar-logout:hover::after{opacity:1}
  .lc-snap-line{position:absolute;bottom:0;left:0;right:0;height:2px;border-radius:1px;pointer-events:none;z-index:999999;opacity:.4;transition:opacity .3s}
  .lc-snap-badge{position:absolute;bottom:-14px;left:4px;pointer-events:none;z-index:999999;animation:lc-snap-in .25s ease}
  .lc-snap-avatar{width:16px;height:16px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.1)}
  .lc-snap-dot{width:16px;height:16px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.1);display:flex;align-items:center;justify-content:center;color:#fff;font:bold 8px/1 system-ui}
  @keyframes lc-snap-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
  .lc-chat-bubble{position:absolute;left:22px;top:-8px;max-width:200px;padding:4px 10px;border-radius:10px;font:500 12px/1.5 system-ui;color:#fff;white-space:pre-wrap;word-break:break-word;pointer-events:none;opacity:1;transition:opacity .5s;animation:lc-chat-in .2s ease}
  .lc-chat-bubble.fade{opacity:0}
  .lc-cursor.touch .lc-chat-bubble{left:-4px;top:-32px}
  @keyframes lc-chat-in{from{opacity:0;transform:translateY(4px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
  .lc-chat-input-wrap{position:fixed;z-index:1000000;pointer-events:auto}
  .lc-chat-input{border:none;outline:none;padding:4px 10px;border-radius:10px;font:500 13px/1.5 system-ui;color:#fff;min-width:60px;max-width:220px;box-shadow:0 2px 12px rgba(0,0,0,.15);caret-color:#fff}
  .lc-chat-input::placeholder{color:rgba(255,255,255,.6)}
  .lc-chat-hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:999997;padding:6px 14px;border-radius:8px;background:rgba(0,0,0,.7);color:#fff;font:500 12px/1 system-ui;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
  .lc-chat-hint.visible{opacity:1}
`;

function injectStyles() {
  if (_lcStyleInjected) return;
  _lcStyleInjected = true;
  var s = document.createElement('style');
  s.id = '__lc_styles__';
  s.textContent = LC_STYLES;
  document.head.appendChild(s);
}

/* ── shared helpers ───────────────────────────────────────────────────── */
var PONG_MSG = JSON.stringify({ type: 'pong' });
var SNAP_PATH_RE = /^[0-9]+(\.[0-9]+)*$/;
var SELF_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
var GITHUB_SVG = '<svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

function sanitizeSnapId(v) {
  if (typeof v !== 'string' || v.length === 0 || v.length > 256) return null;
  return SNAP_PATH_RE.test(v) ? v : null;
}

function isSafeImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try { var u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; } catch (e) { return false; }
}

var LC_OWN_CLS = ['lc-cursor', 'lc-edge', 'lc-presence', 'lc-snap-line', 'lc-snap-badge', 'lc-chat-input-wrap', 'lc-chat-hint'];
function isInjected(el) {
  if (!el || !el.nodeType) return false;
  var cl = el.classList;
  return cl && LC_OWN_CLS.some(function (c) { return cl.contains(c); });
}
function isOwnOverlay(el) { while (el) { if (isInjected(el)) return true; el = el.parentElement; } return false; }

function findSnappable(el) {
  if (!el || el === document.body || el === document.documentElement) return null;
  if (isOwnOverlay(el)) return null;
  var r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return null;
  var vw = window.innerWidth, vh = window.innerHeight;
  if (r.width * r.height > vw * vh * 0.25) return null;
  return el;
}

function filteredIndex(el) {
  var p = el.parentElement; if (!p) return -1;
  var idx = 0;
  for (var i = 0; i < p.children.length; i++) { if (p.children[i] === el) return idx; if (!isInjected(p.children[i])) idx++; }
  return -1;
}

function getElementPath(el) {
  var path = [];
  while (el && el !== document.body && el !== document.documentElement) {
    var idx = filteredIndex(el); if (idx < 0) break;
    path.unshift(idx); el = el.parentElement;
  }
  return path.length ? path.join('.') : null;
}

function childAt(parent, targetIdx) {
  var idx = 0;
  for (var i = 0; i < parent.children.length; i++) { var c = parent.children[i]; if (isInjected(c)) continue; if (idx === targetIdx) return c; idx++; }
  return null;
}

function resolveElementPath(pathStr) {
  if (!pathStr) return null;
  var parts = pathStr.split('.');
  var el = document.body;
  for (var i = 0; i < parts.length; i++) { var idx = parseInt(parts[i], 10); if (isNaN(idx)) return null; el = childAt(el, idx); if (!el) return null; }
  return el;
}

function cursorSVG(c) {
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'lc-arrow'); svg.setAttribute('width', '16'); svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 16 20'); svg.setAttribute('fill', 'none');
  var path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M0.5 0.5L0.5 17L5 12.5H13Z');
  path.setAttribute('fill', c); path.setAttribute('stroke', '#fff');
  path.setAttribute('stroke-width', '1.2'); path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

function hashColor(id) {
  var hash = 0;
  for (var i = 0; i < id.length; i++) { hash = ((hash << 5) - hash) + id.charCodeAt(i); hash |= 0; }
  return SELF_COLORS[Math.abs(hash) % SELF_COLORS.length];
}

/* ── token helper ─────────────────────────────────────────────────────── */
function readToken(server) {
  var tokenKey = 'lc_token_' + server.replace(/^https?:\/\//, '');
  var lcToken = null;
  var selfUser = null;
  try {
    var up = new URLSearchParams(location.search);
    var fromUrl = up.get('lc_token') || up.get('token');
    if (fromUrl) {
      lcToken = fromUrl;
      localStorage.setItem(tokenKey, lcToken);
      up.delete('lc_token'); up.delete('token');
      var qs = up.toString();
      history.replaceState({}, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    } else {
      lcToken = localStorage.getItem(tokenKey) || null;
    }
    if (lcToken) {
      var p = JSON.parse(atob(lcToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (p && p.exp > Date.now() / 1000) {
        selfUser = { username: p.username, avatar: p.avatar, url: p.url };
      } else {
        lcToken = null; localStorage.removeItem(tokenKey);
      }
    }
  } catch (e) { lcToken = null; }
  return { tokenKey: tokenKey, lcToken: lcToken, selfUser: selfUser };
}


/* ══════════════════════════════════════════════════════════════════════════
   LiveCursorsEngine
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {Object} cfg
 * @param {string} cfg.server       - Origin URL (e.g. "https://live-cursors.driftcell.dev")
 * @param {string} cfg.room         - Room identifier
 * @param {string} [cfg.containerSelector]
 * @param {string} [cfg.presenceSelector]
 * @param {boolean} [cfg.showCursors=true]
 * @param {boolean} [cfg.showPresence=true]
 * @param {boolean} [cfg.showLogin=true]
 * @param {boolean} [cfg.showChat=true]
 * @param {boolean} [cfg.showSnap=false]
 * @param {boolean} [cfg.countAnonymous=true]
 * @param {boolean} [cfg.telemetryEnabled=false]
 * @param {number}  [cfg.throttleMs=50]
 */
export function LiveCursorsEngine(cfg) {
  // ── config (frozen at construction) ───────────────────────────────────
  this.server = cfg.server || location.origin;
  this.room = cfg.room || (location.hostname + location.pathname);
  this.containerSelector = cfg.containerSelector || '';
  this.presenceSelector = cfg.presenceSelector || '';
  this.showCursors = cfg.showCursors !== false;
  this.showPresence = cfg.showPresence !== false;
  this.showLogin = cfg.showLogin !== false;
  this.showChat = cfg.showChat !== false;
  this.showSnap = cfg.showSnap === true;
  this.countAnonymous = cfg.countAnonymous !== false;
  this.telemetryEnabled = cfg.telemetryEnabled === true;
  this.throttleMs = cfg.throttleMs || 50;

  // ── internal state ────────────────────────────────────────────────────
  this._ws = null;
  this._selfId = null;
  this._selfColor = '#6366f1';
  this._oauthReady = false;
  this._users = new Map();
  this._touchFadeTimers = {};
  this._lastSend = 0;
  this._lastXR = -1;
  this._lastYO = -1;
  this._lastSnap = null;
  this._reconnectDelay = 1000;
  this._scrollTick = false;
  this._chatInputEl = null;
  this._selfMouseX = 0;
  this._selfMouseY = 0;
  this._tabHidden = false;
  this._hintShown = false;
  this._hintTimer = null;
  this._active = false;

  // DOM refs
  this._cursorsDiv = null;
  this._edgeDiv = null;
  this._presenceDiv = null;
  this._chatHint = null;

  // Auth
  var auth = readToken(this.server);
  this._tokenKey = auth.tokenKey;
  this._lcToken = auth.lcToken;
  this._selfUser = auth.selfUser;

  // Bound handlers for add/removeEventListener
  this._onMouseMove = this._handleMouseMove.bind(this);
  this._onTouchMove = this._handleTouchMove.bind(this);
  this._onScroll = this._handleScroll.bind(this);
  this._onKeyDown = this._handleKeyDown.bind(this);
  this._onVisChange = this._handleVisibilityChange.bind(this);
  this._onBeforeUnload = this._closeWs.bind(this);
}

/* ── lifecycle ────────────────────────────────────────────────────────── */

LiveCursorsEngine.prototype.start = function () {
  if (this._active) return;
  this._active = true;
  injectStyles();
  this._createDOM();
  this._updatePresence();
  this._bindEvents();
  this._fetchConfig();
  this._connect();
  if (this.telemetryEnabled) {
    var self = this;
    setTimeout(function () { self._fetchStats(); }, 2000);
  }
};

LiveCursorsEngine.prototype.destroy = function () {
  this._active = false;
  this._unbindEvents();
  this._closeWs();
  // Clean up DOM
  if (this._cursorsDiv && this._cursorsDiv.parentNode) this._cursorsDiv.remove();
  if (this._edgeDiv && this._edgeDiv.parentNode) this._edgeDiv.remove();
  if (this._presenceDiv && this._presenceDiv.parentNode) this._presenceDiv.remove();
  if (this._chatHint && this._chatHint.parentNode) this._chatHint.remove();
  if (this._chatInputEl) { this._chatInputEl.remove(); this._chatInputEl = null; }
  // Clear timers
  if (this._hintTimer) { clearTimeout(this._hintTimer); this._hintTimer = null; }
  Object.keys(this._touchFadeTimers).forEach(function (k) { clearTimeout(this._touchFadeTimers[k]); }.bind(this));
  this._users.forEach(function (u) {
    if (u._chatTimer) clearTimeout(u._chatTimer);
  });
  this._users.clear();
};

/* ── DOM creation ─────────────────────────────────────────────────────── */

LiveCursorsEngine.prototype._createDOM = function () {
  this._cursorsDiv = document.createElement('div');
  this._cursorsDiv.className = 'lc-cursors';
  document.body.appendChild(this._cursorsDiv);

  this._edgeDiv = document.createElement('div');
  this._edgeDiv.className = 'lc-edges';
  document.body.appendChild(this._edgeDiv);

  if (this.showPresence) {
    this._presenceDiv = document.createElement('div');
    this._presenceDiv.className = 'lc-presence';
    this._presenceDiv.innerHTML =
      '<div class="lc-presence-avatars" data-lc-pa></div>' +
      '<div class="lc-nav-divider" data-lc-nd style="display:none"></div>' +
      '<div data-lc-auth></div>';
    if (this.presenceSelector) {
      var mount = document.querySelector(this.presenceSelector);
      if (mount) { this._presenceDiv.classList.add('lc-presence--mounted'); mount.appendChild(this._presenceDiv); }
      else document.body.appendChild(this._presenceDiv);
    } else {
      document.body.appendChild(this._presenceDiv);
    }
  }

  if (this.showChat) {
    this._chatHint = document.createElement('div');
    this._chatHint.className = 'lc-chat-hint';
    this._chatHint.textContent = 'Press / to chat';
    document.body.appendChild(this._chatHint);
  }
};

/* ── event binding ────────────────────────────────────────────────────── */

LiveCursorsEngine.prototype._bindEvents = function () {
  document.addEventListener('mousemove', this._onMouseMove);
  document.addEventListener('touchmove', this._onTouchMove, { passive: true });
  window.addEventListener('scroll', this._onScroll, { passive: true });
  document.addEventListener('keydown', this._onKeyDown);
  document.addEventListener('visibilitychange', this._onVisChange);
  window.addEventListener('beforeunload', this._onBeforeUnload);
  window.addEventListener('pagehide', this._onBeforeUnload);
};

LiveCursorsEngine.prototype._unbindEvents = function () {
  document.removeEventListener('mousemove', this._onMouseMove);
  document.removeEventListener('touchmove', this._onTouchMove);
  window.removeEventListener('scroll', this._onScroll);
  document.removeEventListener('keydown', this._onKeyDown);
  document.removeEventListener('visibilitychange', this._onVisChange);
  window.removeEventListener('beforeunload', this._onBeforeUnload);
  window.removeEventListener('pagehide', this._onBeforeUnload);
};

LiveCursorsEngine.prototype._handleMouseMove = function (e) {
  this._selfMouseX = e.clientX;
  this._selfMouseY = e.clientY;
  this._sendPos(e.clientX, e.clientY, 'mouse');
};

LiveCursorsEngine.prototype._handleTouchMove = function (e) {
  var t = e.touches[0]; if (!t) return;
  this._sendPos(t.clientX, t.clientY, 'touch');
};

LiveCursorsEngine.prototype._handleScroll = function () {
  var self = this;
  if (this._scrollTick) return; this._scrollTick = true;
  requestAnimationFrame(function () {
    self._scrollTick = false;
    if (!self.showCursors) return;
    self._users.forEach(function (u, id) {
      if (u.xRatio < 0 || u._snapTarget) return;
      var p = self._resolvePos(u);
      if (p.vis) {
        if (u.el) { u.el.style.left = p.x + 'px'; u.el.style.top = p.y + 'px'; u.el.classList.add('active'); }
        self._removeEdge(id);
      } else {
        if (u.el) u.el.classList.remove('active');
        self._showEdge(id, u, p);
      }
    });
  });
};

LiveCursorsEngine.prototype._handleKeyDown = function (e) {
  if (this._chatInputEl) return;
  var tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    this._openChatInput();
  }
};

LiveCursorsEngine.prototype._handleVisibilityChange = function () { this._tabHidden = document.hidden; };

/* ── coordinate helpers ───────────────────────────────────────────────── */

LiveCursorsEngine.prototype._getContainer = function () {
  if (this.containerSelector) return document.querySelector(this.containerSelector);
  return document.documentElement;
};

LiveCursorsEngine.prototype._getCursorPos = function (cx, cy) {
  var c = this._getContainer(); if (!c) return null;
  var r = c.getBoundingClientRect();
  return { xRatio: (cx - r.left) / r.width, yOffset: cy - r.top, containerHeight: c.scrollHeight };
};

LiveCursorsEngine.prototype._resolvePos = function (pos) {
  var c = this._getContainer(); if (!c) return { x: 0, y: 0, vis: false };
  var r = c.getBoundingClientRect();
  var sy = window.scrollY || window.pageYOffset || 0;
  var cdt = r.top + sy;
  var lx = r.left + pos.xRatio * r.width;
  var ly = (cdt + pos.yOffset) - sy;
  return { x: lx, y: ly, vis: ly >= -30 && ly <= window.innerHeight + 30 };
};

/* ── send cursor position ─────────────────────────────────────────────── */

LiveCursorsEngine.prototype._sendPos = function (cx, cy, inputType) {
  if (this._tabHidden) return;
  var now = Date.now(); if (now - this._lastSend < this.throttleMs) return;
  var pos = this._getCursorPos(cx, cy); if (!pos) return;
  var snapTarget = null;
  if (this.showSnap) {
    try {
      var hovered = document.elementFromPoint(cx, cy);
      var snappable = findSnappable(hovered);
      if (snappable) snapTarget = getElementPath(snappable);
    } catch (e) { }
  }
  var changed = Math.abs(pos.xRatio - this._lastXR) >= .001 || Math.abs(pos.yOffset - this._lastYO) >= 1 || snapTarget !== this._lastSnap;
  if (!changed) return;
  this._lastXR = pos.xRatio; this._lastYO = pos.yOffset; this._lastSnap = snapTarget; this._lastSend = now;
  if (this._ws && this._ws.readyState === 1) {
    this._ws.send(JSON.stringify({ type: 'cursor', xRatio: pos.xRatio, yOffset: pos.yOffset, inputType: inputType, containerHeight: pos.containerHeight, snapTarget: snapTarget }));
  }
};

/* ── WebSocket ────────────────────────────────────────────────────────── */

LiveCursorsEngine.prototype._emitStatus = function (s) {
  try { window.dispatchEvent(new CustomEvent('lc:status', { detail: { status: s } })); } catch (e) { }
};

LiveCursorsEngine.prototype._connect = function () {
  if (!this._active) return;
  var self = this;
  this._emitStatus('connecting');
  var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var wsUrl = proto + '//' + this.server.replace(/^https?:\/\//, '') + '/ws?room=' + encodeURIComponent(this.room);
  if (this._lcToken) wsUrl += '&token=' + encodeURIComponent(this._lcToken);
  var ws = new WebSocket(wsUrl);
  this._ws = ws;
  ws.onopen = function () { self._reconnectDelay = 1000; self._emitStatus('connected'); };
  ws.onmessage = function (e) { try { self._handle(JSON.parse(e.data)); } catch (x) { } };
  ws.onclose = function (e) {
    self._ws = null;
    if (e.code === 4503) { self._emitStatus('room_full'); self._reconnectDelay = 30000; }
    else { self._emitStatus('disconnected'); }
    self._users.forEach(function (u) {
      self._unhighlightSnap(u);
      if (u.el) u.el.remove();
      if (u.edgeEl) u.edgeEl.remove();
    });
    self._users.clear(); self._updatePresence();
    Object.keys(self._touchFadeTimers).forEach(function (k) { clearTimeout(self._touchFadeTimers[k]); });
    if (self._active) setTimeout(function () { self._connect(); }, self._reconnectDelay);
    self._reconnectDelay = Math.min(self._reconnectDelay * 1.5, 30000);
  };
};

LiveCursorsEngine.prototype._closeWs = function () { if (this._ws) { this._ws.close(); this._ws = null; } };

/* ── message handling ─────────────────────────────────────────────────── */

LiveCursorsEngine.prototype._handle = function (m) {
  var self = this;
  if (m.type === 'ping' && this._ws && this._ws.readyState === 1) { this._ws.send(PONG_MSG); return; }
  if (m.type === 'stats') { try { window.dispatchEvent(new CustomEvent('lc:stats', { detail: m })); } catch (e) { } return; }
  if (m.type === 'init') {
    this._selfId = m.self;
    m.users.forEach(function (u) { if (u.id !== self._selfId) self._addUser(u); });
    if (this._selfId) this._selfColor = hashColor(this._selfId);
    this._updatePresence();
  }
  else if (m.type === 'join') { this._addUser(m.user); this._updatePresence(); }
  else if (m.type === 'cursor') { this._moveCursor(m); }
  else if (m.type === 'cursor_batch') { if (m.cursors) m.cursors.forEach(function (c) { if (c.id !== self._selfId) { if (!self._users.has(c.id) && c.username) self._addUser(c); self._moveCursor(c); } }); }
  else if (m.type === 'chat') { this._showChatBubble(m.id, m.text); }
  else if (m.type === 'leave') { this._removeUser(m.id); this._updatePresence(); }
  else if (m.type === 'error') { try { window.dispatchEvent(new CustomEvent('lc:error', { detail: m })); } catch (ex) { } }
};

/* ── user management ──────────────────────────────────────────────────── */

LiveCursorsEngine.prototype._addUser = function (u) {
  if (this._users.has(u.id)) return;
  var c = u.color || '#6366f1';
  var el = null;
  if (this.showCursors) {
    el = document.createElement('div'); el.className = 'lc-cursor';
    el.appendChild(cursorSVG(c));
    var td = document.createElement('div'); td.className = 'lc-touch-dot'; td.style.background = c; el.appendChild(td);
    var info = document.createElement('div'); info.className = 'lc-info';
    if (u.avatar) {
      var av = document.createElement('img'); av.className = 'lc-avatar'; av.src = u.avatar; info.appendChild(av);
    } else {
      var dot = document.createElement('div'); dot.className = 'lc-dot'; dot.style.background = c; dot.textContent = u.username[0]; info.appendChild(dot);
    }
    var label = document.createElement('span'); label.className = 'lc-label'; label.style.background = c; label.textContent = u.username; info.appendChild(label);
    el.appendChild(info);
    this._cursorsDiv.appendChild(el);
  }
  this._users.set(u.id, {
    username: u.username, avatar: u.avatar, url: u.url, color: c, el: el, edgeEl: null,
    xRatio: u.xRatio || -1, yOffset: u.yOffset || -1, inputType: u.inputType || 'mouse',
    containerHeight: u.containerHeight || 0, _snapEl: null, _snapBadge: null, _snapTarget: null,
    _chatBubble: null, _chatTimer: null,
  });
  // Flash chat hint on first user join
  if (!this._hintShown && this._users.size >= 1) {
    this._hintShown = true;
    var self = this;
    setTimeout(function () { self._flashChatHint(); }, 800);
  }
};

LiveCursorsEngine.prototype._removeUser = function (id) {
  var u = this._users.get(id); if (!u) return;
  if (u.el) { u.el.classList.add('leaving'); setTimeout(function () { u.el.remove(); }, 300); }
  if (u.edgeEl) u.edgeEl.remove();
  this._unhighlightSnap(u);
  if (u._chatTimer) clearTimeout(u._chatTimer);
  if (this._touchFadeTimers[id]) { clearTimeout(this._touchFadeTimers[id]); delete this._touchFadeTimers[id]; }
  this._users.delete(id);
};

/* ── cursor rendering ─────────────────────────────────────────────────── */

LiveCursorsEngine.prototype._moveCursor = function (m) {
  var u = this._users.get(m.id); if (!u) return;
  u.xRatio = m.xRatio; u.yOffset = m.yOffset; u.inputType = m.inputType || 'mouse'; u.containerHeight = m.containerHeight || 0;
  var snapId = this.showSnap ? sanitizeSnapId(m.snapTarget) : null;
  if (!this.showCursors) return;
  if (snapId) {
    u.el.classList.remove('active'); this._removeEdge(m.id);
    if (this._touchFadeTimers[m.id]) { clearTimeout(this._touchFadeTimers[m.id]); delete this._touchFadeTimers[m.id]; }
    this._highlightSnap(u, snapId); return;
  }
  this._unhighlightSnap(u);
  if (m.inputType === 'touch') u.el.classList.add('touch'); else u.el.classList.remove('touch');
  if (this._touchFadeTimers[m.id]) { clearTimeout(this._touchFadeTimers[m.id]); delete this._touchFadeTimers[m.id]; }
  var p = this._resolvePos(m);
  if (p.vis) {
    u.el.style.left = p.x + 'px'; u.el.style.top = p.y + 'px'; u.el.classList.add('active'); this._removeEdge(m.id);
  } else {
    u.el.classList.remove('active'); this._showEdge(m.id, u, p);
  }
  if (m.inputType === 'touch') {
    var self = this;
    this._touchFadeTimers[m.id] = setTimeout(function () { u.el.classList.remove('active'); }, 3000);
  }
};

/* ── edge indicators ──────────────────────────────────────────────────── */

LiveCursorsEngine.prototype._showEdge = function (id, u, p) {
  if (!this.showCursors) return;
  var isTop = p.y < 0;
  var self = this;
  if (!u.edgeEl) {
    u.edgeEl = document.createElement('div'); u.edgeEl.className = 'lc-edge';
    var avDiv = document.createElement('div'); avDiv.className = 'lc-e-av';
    if (u.avatar) { var avImg = document.createElement('img'); avImg.src = u.avatar; avDiv.appendChild(avImg); }
    else { avDiv.style.background = u.color; avDiv.textContent = u.username[0]; }
    u.edgeEl.appendChild(avDiv);
    u.edgeEl.appendChild(document.createTextNode(' ' + u.username));
    u.edgeEl.style.background = u.color;
    u.edgeEl.onclick = function () {
      var cur = self._resolvePos(u);
      var sy = window.scrollY || window.pageYOffset || 0;
      window.scrollTo({ top: sy + (cur.y - window.innerHeight / 2), behavior: 'smooth' });
    };
    this._edgeDiv.appendChild(u.edgeEl);
  }
  var cx = Math.max(8, Math.min(p.x, window.innerWidth - 120));
  u.edgeEl.style.left = cx + 'px';
  if (isTop) { u.edgeEl.style.top = '8px'; u.edgeEl.style.bottom = ''; }
  else { u.edgeEl.style.bottom = '8px'; u.edgeEl.style.top = ''; }
};

LiveCursorsEngine.prototype._removeEdge = function (id) {
  var u = this._users.get(id); if (!u || !u.edgeEl) return;
  u.edgeEl.remove(); u.edgeEl = null;
};

/* ── snap highlight ───────────────────────────────────────────────────── */

LiveCursorsEngine.prototype._highlightSnap = function (u, snapId) {
  var target = resolveElementPath(snapId);
  if (!target) { this._unhighlightSnap(u); return; }
  if (u._snapTarget === target && u._snapEl) return;
  this._unhighlightSnap(u);
  var cs = getComputedStyle(target).position; if (cs === 'static') target.style.position = 'relative';
  var line = document.createElement('div'); line.className = 'lc-snap-line'; line.style.background = u.color;
  target.appendChild(line);
  var badge = document.createElement('div'); badge.className = 'lc-snap-badge';
  if (isSafeImageUrl(u.avatar)) {
    var av = document.createElement('img'); av.className = 'lc-snap-avatar'; av.src = u.avatar; av.alt = ''; badge.appendChild(av);
  } else {
    var dot = document.createElement('div'); dot.className = 'lc-snap-dot'; dot.style.background = u.color; dot.textContent = u.username.charAt(0); badge.appendChild(dot);
  }
  target.appendChild(badge);
  u._snapEl = line; u._snapBadge = badge; u._snapTarget = target;
};

LiveCursorsEngine.prototype._unhighlightSnap = function (u) {
  if (u._snapEl) { u._snapEl.remove(); u._snapEl = null; }
  if (u._snapBadge) { u._snapBadge.remove(); u._snapBadge = null; }
  u._snapTarget = null;
};

/* ── presence bar ─────────────────────────────────────────────────────── */

LiveCursorsEngine.prototype._updatePresence = function () {
  if (!this.showPresence || !this._presenceDiv) return;
  var pa = this._presenceDiv.querySelector('[data-lc-pa]'); if (!pa) return;
  var nd = this._presenceDiv.querySelector('[data-lc-nd]');
  var authEl = this._presenceDiv.querySelector('[data-lc-auth]');
  pa.innerHTML = '';
  var arr = Array.from(this._users.values());
  var filtered = this.countAnonymous ? arr : arr.filter(function (u) { return !!u.avatar; });
  var vis = filtered.slice(0, 5), over = filtered.length - vis.length;
  vis.forEach(function (u, i) {
    if (u.avatar) {
      var a = document.createElement('a'); a.className = 'lc-p-avatar'; a.href = u.url; a.target = '_blank'; a.title = u.username; a.style.zIndex = String(100 - i);
      var im = document.createElement('img'); im.src = u.avatar; im.alt = u.username; a.appendChild(im); pa.appendChild(a);
    } else {
      var d = document.createElement('div'); d.className = 'lc-p-avatar'; d.style.backgroundColor = u.color; d.style.zIndex = String(100 - i); d.title = u.username; d.textContent = u.username[0]; pa.appendChild(d);
    }
  });
  if (over > 0) { var b = document.createElement('div'); b.className = 'lc-p-overflow'; b.textContent = '+' + over; pa.appendChild(b); }
  if (nd) nd.style.display = arr.length > 0 ? '' : 'none';
  if (!authEl) return;
  authEl.innerHTML = '';
  var self = this;
  if (this._selfUser) {
    var logoutBtn = document.createElement('button');
    logoutBtn.className = 'lc-avatar-logout';
    logoutBtn.title = 'Sign out (@' + this._selfUser.username + ')';
    logoutBtn.onclick = function () { localStorage.removeItem(self._tokenKey); location.reload(); };
    if (this._selfUser.avatar) { var av = document.createElement('img'); av.src = this._selfUser.avatar; av.alt = this._selfUser.username; logoutBtn.appendChild(av); }
    else { logoutBtn.style.cssText = 'background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font:700 13px/1 system-ui'; logoutBtn.textContent = this._selfUser.username[0]; }
    authEl.appendChild(logoutBtn);
  } else if (this.showLogin && this._oauthReady) {
    var loginUrl = this.server + '/auth/login?redirect=' + encodeURIComponent(location.href);
    var loginBtn = document.createElement('a'); loginBtn.className = 'lc-btn-login'; loginBtn.href = loginUrl;
    loginBtn.innerHTML = GITHUB_SVG + "Who\\'s Here";
    authEl.appendChild(loginBtn);
  }
};

/* ── cursor chat ──────────────────────────────────────────────────────── */

LiveCursorsEngine.prototype._showChatBubble = function (userId, text) {
  if (!this.showChat) return;
  var u = this._users.get(userId); if (!u || !u.el || !this.showCursors) return;
  if (u._chatTimer) { clearTimeout(u._chatTimer); u._chatTimer = null; }
  if (u._chatBubble) { u._chatBubble.remove(); u._chatBubble = null; }
  var bubble = document.createElement('div');
  bubble.className = 'lc-chat-bubble'; bubble.style.background = u.color; bubble.textContent = text;
  u.el.appendChild(bubble); u._chatBubble = bubble;
  u._chatTimer = setTimeout(function () {
    bubble.classList.add('fade');
    setTimeout(function () { if (u._chatBubble === bubble) { bubble.remove(); u._chatBubble = null; } }, 500);
    u._chatTimer = null;
  }, 4000);
};

LiveCursorsEngine.prototype._openChatInput = function () {
  if (!this.showChat || this._chatInputEl) return;
  var self = this;
  var wrap = document.createElement('div');
  wrap.className = 'lc-chat-input-wrap';
  wrap.style.left = (this._selfMouseX + 18) + 'px';
  wrap.style.top = (this._selfMouseY - 6) + 'px';
  var input = document.createElement('input');
  input.className = 'lc-chat-input'; input.style.background = this._selfColor;
  input.setAttribute('maxlength', '128'); input.setAttribute('placeholder', 'Say something…'); input.setAttribute('autocomplete', 'off');
  wrap.appendChild(input);
  document.body.appendChild(wrap);
  this._chatInputEl = wrap;
  input.addEventListener('mousemove', function (e) { e.stopPropagation(); });
  input.focus();
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var text = input.value.trim();
      if (text && self._ws && self._ws.readyState === 1) self._ws.send(JSON.stringify({ type: 'chat', text: text }));
      self._closeChatInput(); e.preventDefault();
    } else if (e.key === 'Escape') { self._closeChatInput(); e.preventDefault(); }
    e.stopPropagation();
  });
  input.addEventListener('keyup', function (e) { e.stopPropagation(); });
  input.addEventListener('keypress', function (e) { e.stopPropagation(); });
  input.addEventListener('blur', function () { self._closeChatInput(); });
};

LiveCursorsEngine.prototype._closeChatInput = function () {
  if (!this._chatInputEl) return;
  this._chatInputEl.remove(); this._chatInputEl = null;
};

LiveCursorsEngine.prototype._flashChatHint = function () {
  if (!this._chatHint) return;
  var self = this;
  if (this._hintTimer) { clearTimeout(this._hintTimer); this._hintTimer = null; }
  this._chatHint.classList.add('visible');
  this._hintTimer = setTimeout(function () { self._chatHint.classList.remove('visible'); self._hintTimer = null; }, 3000);
};

/* ── fetch server config ──────────────────────────────────────────────── */

LiveCursorsEngine.prototype._fetchConfig = function () {
  var self = this;
  fetch(this.server + '/api/config').then(function (r) { return r.json(); }).then(function (cfg) {
    if (cfg && cfg.clientId) { self._oauthReady = true; self._updatePresence(); }
  }).catch(function () { });
};

LiveCursorsEngine.prototype._fetchStats = function () {
  var self = this;
  fetch(this.server + '/api/stats?site=' + encodeURIComponent(this.room)).then(function (r) { return r.json(); }).then(function (stats) {
    try { window.dispatchEvent(new CustomEvent('lc:stats', { detail: stats })); } catch (e) { }
  }).catch(function () { });
};
