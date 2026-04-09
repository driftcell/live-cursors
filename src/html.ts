export function getMainHTML(clientId: string): string {
  const hasOAuth = !!clientId;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live Cursors</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✦</text></svg>">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#fafafa;--text:#1a1a2e;--muted:#6b7280;--accent:#6366f1;--accent2:#a855f7;
  --surface:#fff;--border:rgba(0,0,0,.06);--header-h:56px;
}
html{scroll-behavior:smooth}
body{
  font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden;
  background-image:radial-gradient(circle,#d1d5db 1px,transparent 1px);background-size:24px 24px;
}

/* ── header ── */
header{
  position:fixed;top:0;left:0;right:0;height:var(--header-h);z-index:100;
  background:rgba(255,255,255,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 24px;
}
.logo{font-weight:800;font-size:16px;display:flex;align-items:center;gap:6px;color:var(--accent);user-select:none}
.logo span{font-size:18px}
header nav{margin-left:auto;display:flex;align-items:center;gap:16px}

/* ── presence bar ── */
.presence{display:flex;align-items:center;gap:8px}
.presence-avatars{display:flex;align-items:center}
.presence-avatar{
  width:32px;height:32px;border-radius:50%;border:2px solid #fff;margin-left:-8px;
  flex-shrink:0;overflow:hidden;transition:margin-left .3s ease,transform .2s;
  position:relative;cursor:pointer;text-decoration:none;
  display:flex;align-items:center;justify-content:center;
  font:600 13px/1 system-ui;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.1);
}
.presence-avatar:first-child{margin-left:0}
.presence-avatars:hover .presence-avatar{margin-left:4px}
.presence-avatars:hover .presence-avatar:first-child{margin-left:0}
.presence-avatar:hover{transform:scale(1.12);z-index:10!important}
.presence-avatar img{width:100%;height:100%;object-fit:cover}
.presence-overflow{
  width:32px;height:32px;border-radius:50%;border:2px solid #fff;margin-left:-8px;
  background:var(--muted);color:#fff;display:flex;align-items:center;justify-content:center;
  font:700 11px/1 system-ui;box-shadow:0 1px 4px rgba(0,0,0,.1);
}
.presence-count{font:500 13px/1 system-ui;color:var(--muted);white-space:nowrap}
/* mounted 到自定义容器时，presence 仅保留内部排版，外观由宿主控制 */
.presence.presence--mounted{background:none;box-shadow:none;border:none;padding:0}

/* ── auth ── */
.btn-login{
  display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border-radius:8px;
  background:#24292f;color:#fff;text-decoration:none;font:500 13px/1 system-ui;
  transition:background .2s;border:none;cursor:pointer;
}
.btn-login:hover{background:#1b1f23}
.btn-login svg{width:18px;height:18px;fill:currentColor}
.user-info{display:flex;align-items:center;gap:10px}
.username-link{font:500 13px/1 system-ui;color:var(--text);text-decoration:none}
.username-link:hover{text-decoration:underline}
.avatar-logout{
  width:30px;height:30px;border-radius:50%;padding:0;background:none;border:1.5px solid var(--border);
  overflow:hidden;cursor:pointer;position:relative;flex-shrink:0;transition:border-color .2s,transform .2s;
}
.avatar-logout:hover{border-color:#ef4444;transform:scale(1.08)}
.avatar-logout img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.avatar-logout::after{
  content:'✕';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(220,38,38,.75);color:#fff;font:700 13px/1 system-ui;
  opacity:0;transition:opacity .18s;border-radius:50%;
}
.avatar-logout:hover::after{opacity:1}

/* ── hero ── */
.hero{
  position:relative;text-align:center;padding:160px 24px 80px;max-width:680px;margin:0 auto;
}
.hero::before{
  content:'';position:absolute;width:500px;height:500px;top:50%;left:50%;
  transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;
  background:radial-gradient(circle,rgba(99,102,241,.07),transparent 70%);
}
.hero h1{
  font-size:clamp(2.5rem,6vw,4rem);font-weight:800;line-height:1.1;margin-bottom:20px;
  background:linear-gradient(135deg,var(--accent),var(--accent2));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.hero p{font-size:clamp(1rem,2.2vw,1.2rem);color:var(--muted);max-width:480px;margin:0 auto 32px;line-height:1.6}
.hero-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.hero-actions a{
  display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:10px;
  font:600 14px/1 system-ui;text-decoration:none;transition:all .2s;
}
.btn-primary{background:var(--accent);color:#fff;box-shadow:0 2px 12px rgba(99,102,241,.3)}
.btn-primary:hover{background:#4f46e5;transform:translateY(-1px);box-shadow:0 4px 16px rgba(99,102,241,.35)}
.btn-secondary{background:var(--surface);color:var(--text);border:1px solid var(--border)}
.btn-secondary:hover{border-color:#c4c4c4;transform:translateY(-1px)}

/* ── features ── */
.features{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
  gap:20px;max-width:840px;margin:0 auto 80px;padding:0 24px;
}
.feature-card{
  background:var(--surface);border:1px solid var(--border);border-radius:14px;
  padding:28px 24px;transition:transform .2s,box-shadow .2s;
}
.feature-card:hover{transform:translateY(-2px);box-shadow:0 4px 20px rgba(0,0,0,.06)}
.feature-card .icon{font-size:28px;margin-bottom:12px}
.feature-card h3{font-size:15px;font-weight:700;margin-bottom:8px}
.feature-card p{font-size:13px;color:var(--muted);line-height:1.55}

/* ── embed section ── */
.embed-section{
  max-width:640px;margin:0 auto 80px;padding:0 24px;text-align:center;
}
.embed-section h2{font-size:1.5rem;font-weight:700;margin-bottom:8px}
.embed-section p{color:var(--muted);margin-bottom:20px;font-size:14px}
.code-block{
  background:#1e1e2e;color:#cdd6f4;border-radius:12px;padding:20px 24px;
  font:14px/1.6 'SF Mono',ui-monospace,Menlo,monospace;text-align:left;
  overflow-x:auto;position:relative;
}
.code-block .tag{color:#89b4fa}.code-block .attr{color:#f9e2af}.code-block .str{color:#a6e3a1}
.copy-btn{
  position:absolute;top:10px;right:10px;background:rgba(255,255,255,.1);border:none;
  color:#cdd6f4;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;
  transition:background .2s;
}
.copy-btn:hover{background:rgba(255,255,255,.2)}

/* ── footer ── */
footer{
  text-align:center;padding:32px 24px;color:var(--muted);font-size:13px;
  border-top:1px solid var(--border);
}
footer a{color:var(--accent);text-decoration:none}
footer a:hover{text-decoration:underline}

/* ── remote cursors ── */
.remote-cursor{
  position:fixed;pointer-events:none;z-index:9999;
  transition:left 100ms linear,top 100ms linear;opacity:0;
  will-change:left,top;
}
.remote-cursor.active{opacity:1;transition:left 100ms linear,top 100ms linear,opacity .3s}
.remote-cursor.leaving{opacity:0;transition:opacity .3s}
.cursor-arrow{display:block}
.cursor-info{display:flex;align-items:center;gap:4px;margin-left:10px;margin-top:-2px}
.cursor-avatar{width:20px;height:20px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.12)}
.cursor-dot{
  width:20px;height:20px;border-radius:50%;border:1.5px solid #fff;
  box-shadow:0 1px 4px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;
  color:#fff;font:bold 10px/1 system-ui;
}
.cursor-label{
  padding:1px 6px;border-radius:4px;font:500 11px/1.4 system-ui;color:#fff;white-space:nowrap;
  opacity:0;transform:translateX(-3px);transition:opacity .15s,transform .15s;
}
.remote-cursor:hover .cursor-label{opacity:1;transform:translateX(0)}

/* ── status indicator ── */
.ws-status{
  position:fixed;bottom:16px;left:16px;z-index:100;
  display:flex;align-items:center;gap:6px;
  background:var(--surface);border:1px solid var(--border);border-radius:8px;
  padding:6px 12px;font:500 12px/1 system-ui;color:var(--muted);
  box-shadow:0 1px 4px rgba(0,0,0,.05);transition:opacity .3s;
}
.ws-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.ws-dot.connected{background:#10b981}
.ws-dot.connecting{background:#f59e0b;animation:pulse 1s infinite}
.ws-dot.disconnected{background:#ef4444}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
</style>
</head>
<body>

<header>
  <div class="logo"><span>✦</span> Live Cursors</div>
  <nav>
    <div id="presenceSlot"></div>
    <div id="authSection"></div>
  </nav>
</header>

<main>
  <section class="hero">
    <h1>See who's here ✦</h1>
    <p>Move your cursor around — everyone sees each other in real-time. Powered by Cloudflare Workers&nbsp;&amp;&nbsp;Durable&nbsp;Objects.</p>
    <div class="hero-actions">
      <a href="https://github.com/driftcell/live-cursors" target="_blank" class="btn-primary">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        GitHub
      </a>
      <a href="#embed" class="btn-secondary">📦 Embed SDK</a>
    </div>
  </section>

  <section class="features">
    <div class="feature-card"><div class="icon">⚡</div><h3>Real-time Sync</h3><p>Cursor positions broadcast instantly via Durable Objects with WebSocket connections.</p></div>
    <div class="feature-card"><div class="icon">🎨</div><h3>Smooth Animation</h3><p>CSS-powered transitions at ~10fps for fluid motion without frame-by-frame jumps.</p></div>
    <div class="feature-card"><div class="icon">🌐</div><h3>Zero Cost</h3><p>Built entirely on Cloudflare's free tier — Workers, Durable Objects, no servers to maintain.</p></div>
  </section>

  <section class="embed-section" id="embed">
    <h2>📦 Add to Your Site</h2>
    <p>One line of code gives any page live cursors. Use <code style="background:#f0f0f8;padding:1px 5px;border-radius:4px;font-size:13px">data-presence</code> to mount the presence bar into your own element — or omit it to float in the corner.</p>
    <div class="code-block" id="codeBlock">
      <button class="copy-btn" onclick="copyEmbed()">Copy</button>
      <span class="tag">&lt;script</span> <span class="attr">src</span>=<span class="str">"<span id="embedUrl"></span>"</span> <span class="attr">data-presence</span>=<span class="str">"#your-element"</span><span class="tag">&gt;&lt;/script&gt;</span>
    </div>
  </section>
</main>

<footer>Made with ♥ on <a href="https://developers.cloudflare.com/workers/" target="_blank">Cloudflare Workers</a></footer>

<div id="cursors"></div>

<div class="ws-status" id="wsStatus">
  <span class="ws-dot connecting" id="wsDot"></span>
  <span id="wsText">Connecting…</span>
</div>

<script>
(function(){
  "use strict";

  var GITHUB_CLIENT_ID = ${JSON.stringify(clientId)};
  var MAX_VISIBLE = 5;
  var THROTTLE = 100; // ms (~10 fps)

  // ── state ──
  var ws = null;
  var selfId = null;
  var token = localStorage.getItem("lc_token");
  var users = new Map();
  var lastSend = 0, lastX = -1, lastY = -1;
  var reconnectDelay = 1000;
  var reconnectTimer = null;

  // ── presence bar DOM ──
  // Build the presence widget once, then mount it to:
  //   1. A user-supplied element matching [id="lc-presence-mount"] (custom mount)
  //   2. The default #presenceSlot in the header (fallback)
  var presenceEl = document.createElement("div");
  presenceEl.className = "presence";
  presenceEl.id = "presence";
  presenceEl.innerHTML = '<div class="presence-avatars" id="presenceAvatars"></div><span class="presence-count" id="presenceCount"></span>';

  function mountPresence() {
    var custom = document.getElementById("lc-presence-mount");
    if (custom) {
      presenceEl.classList.add("presence--mounted");
      custom.appendChild(presenceEl);
    } else {
      document.getElementById("presenceSlot").appendChild(presenceEl);
    }
  }

  // ── init ──
  (function init() {
    try {
      var params = new URLSearchParams(location.search);
      if (params.get("token")) {
        token = params.get("token");
        localStorage.setItem("lc_token", token);
        history.replaceState({}, "", "/");
      }
      var embedEl = document.getElementById("embedUrl");
      if (embedEl) embedEl.textContent = location.origin + "/embed.js";
      mountPresence();
      updateAuthUI();
      connect();
    } catch (e) {
      console.error("[live-cursors] init failed:", e);
    }
  })();

  // ── auth UI ──
  function updateAuthUI() {
    var el = document.getElementById("authSection");
    if (token) {
      var p = parseJWT(token);
      if (p && p.exp > Date.now() / 1000) {
        var avatarHTML = p.avatar
          ? '<img src="' + esc(p.avatar) + '" alt="' + esc(p.username) + '">'
          : '<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:var(--accent);color:#fff;font:700 13px/1 system-ui">' + esc((p.username || '?')[0]) + '</span>';
        el.innerHTML =
          '<button class="avatar-logout" onclick="window.__lcLogout()" title="Sign out (@' + esc(p.username) + ')">' +
          avatarHTML +
          '</button>';
        return;
      }
      // expired
      localStorage.removeItem("lc_token");
      token = null;
    }
    if (GITHUB_CLIENT_ID) {
      el.innerHTML =
        '<a class="btn-login" href="/auth/login">' +
        '<svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>' +
        'Sign in with GitHub</a>';
    } else {
      el.innerHTML = '<span style="color:var(--muted);font-size:12px">OAuth not configured</span>';
    }
  }

  window.__lcLogout = function() {
    localStorage.removeItem("lc_token");
    token = null;
    if (ws) ws.close();
    location.reload();
  };

  function parseJWT(t) {
    try { return JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))); }
    catch(e) { return null; }
  }

  function esc(s) {
    var d = document.createElement("div"); d.textContent = s; return d.innerHTML;
  }

  // ── cursor SVG helper ──
  function cursorSVG(color) {
    return '<svg class="cursor-arrow" width="16" height="20" viewBox="0 0 16 20" fill="none">' +
      '<path d="M0.5 0.5L0.5 17L5 12.5H13Z" fill="' + color + '" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  }

  // ── WebSocket ──
  function connect() {
    setStatus("connecting");
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var room = encodeURIComponent(location.pathname);
    var url = proto + "//" + location.host + "/ws?room=" + room;
    if (token) url += "&token=" + encodeURIComponent(token);

    ws = new WebSocket(url);
    ws.onopen = function() { reconnectDelay = 1000; setStatus("connected"); };
    ws.onmessage = function(e) { try { handle(JSON.parse(e.data)); } catch(x){} };
    ws.onclose = function() {
      ws = null; setStatus("disconnected");
      // Clear all remote cursors on disconnect
      users.forEach(function(u) { if(u.el) u.el.remove(); });
      users.clear(); updatePresenceBar();
      scheduleReconnect();
    };
    ws.onerror = function() {};
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function() {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
      connect();
    }, reconnectDelay);
  }

  function setStatus(s) {
    var dot = document.getElementById("wsDot");
    var txt = document.getElementById("wsText");
    dot.className = "ws-dot " + s;
    txt.textContent = s === "connected" ? "Connected" : s === "connecting" ? "Connecting…" : "Reconnecting…";
    // auto-hide when connected
    document.getElementById("wsStatus").style.opacity = s === "connected" ? "0" : "1";
  }

  // ── message handler ──
  function handle(msg) {
    switch (msg.type) {
      case "ping":
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "pong" }));
        break;
      case "init":
        selfId = msg.self;
        msg.users.forEach(function(u) { if (u.id !== selfId) addUser(u); });
        updatePresenceBar();
        break;
      case "join":
        addUser(msg.user);
        updatePresenceBar();
        break;
      case "cursor":
        moveCursor(msg.id, msg.x, msg.y);
        break;
      case "leave":
        removeUser(msg.id);
        updatePresenceBar();
        break;
    }
  }

  // ── cursor management ──
  function addUser(u) {
    if (users.has(u.id)) return;
    var el = document.createElement("div");
    el.className = "remote-cursor";
    var c = u.color || "#6366f1";
    el.innerHTML = cursorSVG(c) +
      '<div class="cursor-info">' +
      (u.avatar
        ? '<img class="cursor-avatar" src="' + esc(u.avatar) + '" alt="' + esc(u.username) + '">'
        : '<div class="cursor-dot" style="background:' + c + '">' + esc(u.username[0]) + '</div>') +
      '<span class="cursor-label" style="background:' + c + '">' + esc(u.username) + '</span>' +
      '</div>';
    document.getElementById("cursors").appendChild(el);
    users.set(u.id, { username: u.username, avatar: u.avatar, url: u.url, color: c, el: el });
  }

  function moveCursor(id, x, y) {
    var u = users.get(id);
    if (!u) return;
    u.el.style.left = (x * 100) + "%";
    u.el.style.top = (y * 100) + "%";
    if (!u.el.classList.contains("active")) u.el.classList.add("active");
  }

  function removeUser(id) {
    var u = users.get(id);
    if (!u) return;
    u.el.classList.remove("active");
    u.el.classList.add("leaving");
    setTimeout(function() { u.el.remove(); users.delete(id); }, 300);
  }

  // ── presence bar ──
  function updatePresenceBar() {
    var bar = document.getElementById("presenceAvatars");
    var count = document.getElementById("presenceCount");
    bar.innerHTML = "";

    var arr = Array.from(users.values());
    var vis = arr.slice(0, MAX_VISIBLE);
    var over = arr.length - vis.length;

    vis.forEach(function(u, i) {
      if (u.avatar) {
        var a = document.createElement("a");
        a.className = "presence-avatar";
        a.href = u.url; a.target = "_blank"; a.title = u.username;
        a.style.zIndex = String(100 - i);
        var img = document.createElement("img");
        img.src = u.avatar; img.alt = u.username;
        a.appendChild(img); bar.appendChild(a);
      } else {
        var d = document.createElement("div");
        d.className = "presence-avatar";
        d.style.backgroundColor = u.color;
        d.style.zIndex = String(100 - i);
        d.title = u.username;
        d.textContent = u.username[0];
        bar.appendChild(d);
      }
    });

    if (over > 0) {
      var b = document.createElement("div");
      b.className = "presence-overflow";
      b.textContent = "+" + over;
      bar.appendChild(b);
    }

    count.textContent = arr.length ? arr.length + " online" : "";
  }

  // ── mouse / touch tracking ──
  document.addEventListener("mousemove", function(e) {
    throttledSend(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
  });
  document.addEventListener("touchmove", function(e) {
    var t = e.touches[0]; if (!t) return;
    throttledSend(t.clientX / window.innerWidth, t.clientY / window.innerHeight);
  });

  function throttledSend(x, y) {
    var now = Date.now();
    if (now - lastSend < THROTTLE) return;
    if (Math.abs(x - lastX) < 0.001 && Math.abs(y - lastY) < 0.001) return;
    lastX = x; lastY = y; lastSend = now;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "cursor", x: x, y: y }));
  }

  window.addEventListener("beforeunload", function() { if (ws) ws.close(); });

  // ── copy embed code ──
  window.copyEmbed = function() {
    var code = '<script src="' + location.origin + '/embed.js" data-presence="#your-element"></' + 'script>';
    navigator.clipboard.writeText(code).then(function() {
      var btn = document.querySelector(".copy-btn");
      btn.textContent = "Copied!";
      setTimeout(function() { btn.textContent = "Copy"; }, 2000);
    });
  };

})();
</script>
</body>
</html>`;
}
