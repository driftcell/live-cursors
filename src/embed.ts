export function getEmbedJS(origin: string): string {
  return `(function(){
  var script=document.currentScript;
  var ORIGIN=${JSON.stringify(origin)};
  var room=script&&script.getAttribute("data-room")||location.pathname;
  var presenceSelector=script&&script.getAttribute("data-presence");

  /* ── styles ── */
  var style=document.createElement("style");
  style.textContent=\`
    .lc-cursor{position:fixed;pointer-events:none;z-index:999999;transition:left 100ms linear,top 100ms linear;opacity:0}
    .lc-cursor.active{opacity:1}
    .lc-cursor.leaving{opacity:0;transition:opacity .3s}
    .lc-arrow{display:block}
    .lc-info{display:flex;align-items:center;gap:4px;margin-left:10px;margin-top:-2px}
    .lc-avatar{width:20px;height:20px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.12)}
    .lc-dot{width:20px;height:20px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;color:#fff;font:bold 10px/1 system-ui}
    .lc-label{padding:1px 6px;border-radius:4px;font:500 11px/1.4 system-ui;color:#fff;white-space:nowrap;opacity:0;transform:translateX(-3px);transition:opacity .15s,transform .15s}
    .lc-cursor:hover .lc-label{opacity:1;transform:translateX(0)}
    .lc-presence{position:fixed;top:12px;right:12px;z-index:999998;display:flex;align-items:center;background:rgba(255,255,255,.85);backdrop-filter:blur(8px);padding:4px 10px 4px 6px;border-radius:20px;box-shadow:0 1px 6px rgba(0,0,0,.08);border:1px solid rgba(0,0,0,.06)}
    .lc-presence.lc-presence--mounted{position:static;background:none;backdrop-filter:none;box-shadow:none;border:none;padding:0}
    .lc-presence-avatars{display:flex;align-items:center}
    .lc-presence .lc-p-avatar{width:28px;height:28px;border-radius:50%;border:2px solid #fff;margin-left:-6px;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font:600 11px/1 system-ui;color:#fff;cursor:pointer;text-decoration:none;transition:margin-left .3s ease,transform .2s}
    .lc-presence .lc-p-avatar:first-child{margin-left:0}
    .lc-presence:hover .lc-p-avatar{margin-left:3px}
    .lc-presence:hover .lc-p-avatar:first-child{margin-left:0}
    .lc-presence .lc-p-avatar:hover{transform:scale(1.1);z-index:10}
    .lc-presence .lc-p-avatar img{width:100%;height:100%;object-fit:cover}
    .lc-p-overflow{width:28px;height:28px;border-radius:50%;border:2px solid #fff;margin-left:-6px;background:#6b7280;color:#fff;display:flex;align-items:center;justify-content:center;font:700 10px/1 system-ui}
    .lc-p-count{font:500 12px/1 system-ui;color:#6b7280;margin-left:6px}
  \`;
  document.head.appendChild(style);

  /* ── containers ── */
  var cursorsDiv=document.createElement("div");cursorsDiv.id="lc-cursors";document.body.appendChild(cursorsDiv);
  var presenceDiv=document.createElement("div");presenceDiv.className="lc-presence";presenceDiv.id="lc-presence";
  presenceDiv.innerHTML='<div class="lc-presence-avatars" id="lc-pa"></div><span class="lc-p-count" id="lc-pc">0</span>';

  /* mount presence bar: custom selector > body (fixed) */
  if(presenceSelector){
    var mountEl=document.querySelector(presenceSelector);
    if(mountEl){presenceDiv.classList.add("lc-presence--mounted");mountEl.appendChild(presenceDiv);}
    else{document.body.appendChild(presenceDiv);}
  } else {
    document.body.appendChild(presenceDiv);
  }

  var ws,selfId,users=new Map(),lastSend=0,lastX=-1,lastY=-1,reconnectDelay=1000;

  function cursorSVG(c){return '<svg class="lc-arrow" width="16" height="20" viewBox="0 0 16 20" fill="none"><path d="M0.5 0.5L0.5 17L5 12.5H13Z" fill="'+c+'" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>';}

  function connect(){
    var proto=location.protocol==="https:"?"wss:":"ws:";
    ws=new WebSocket(proto+"//"+ORIGIN.replace(/^https?:\\\\/\\\\//,"")+"/ws?room="+encodeURIComponent(room));
    ws.onopen=function(){reconnectDelay=1000};
    ws.onmessage=function(e){try{handle(JSON.parse(e.data))}catch(x){}};
    ws.onclose=function(){ws=null;setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(reconnectDelay*1.5,30000)};
  }

  function handle(m){
    if(m.type==="init"){selfId=m.self;m.users.forEach(function(u){if(u.id!==selfId)addUser(u)});updatePresence();}
    else if(m.type==="join"){addUser(m.user);updatePresence();}
    else if(m.type==="cursor"){moveCursor(m.id,m.x,m.y);}
    else if(m.type==="leave"){removeUser(m.id);updatePresence();}
  }

  function addUser(u){if(users.has(u.id))return;var el=document.createElement("div");el.className="lc-cursor";
    var c=u.color||"#6366f1";
    el.innerHTML=cursorSVG(c)+'<div class="lc-info">'+(u.avatar?'<img class="lc-avatar" src="'+u.avatar+'">':'<div class="lc-dot" style="background:'+c+'">'+u.username[0]+'</div>')+'<span class="lc-label" style="background:'+c+'">'+u.username+'</span></div>';
    cursorsDiv.appendChild(el);users.set(u.id,{username:u.username,avatar:u.avatar,url:u.url,color:c,el:el});
  }

  function moveCursor(id,x,y){var u=users.get(id);if(!u)return;u.el.style.left=x*100+"%";u.el.style.top=y*100+"%";u.el.classList.add("active");}

  function removeUser(id){var u=users.get(id);if(!u)return;u.el.classList.add("leaving");setTimeout(function(){u.el.remove();users.delete(id)},300);}

  function updatePresence(){
    var pa=document.getElementById("lc-pa"),pc=document.getElementById("lc-pc");if(!pa)return;pa.innerHTML="";
    var arr=Array.from(users.values()),vis=arr.slice(0,5),over=arr.length-vis.length;
    vis.forEach(function(u,i){
      if(u.avatar){var a=document.createElement("a");a.className="lc-p-avatar";a.href=u.url;a.target="_blank";a.title=u.username;a.style.zIndex=String(100-i);var im=document.createElement("img");im.src=u.avatar;a.appendChild(im);pa.appendChild(a);}
      else{var d=document.createElement("div");d.className="lc-p-avatar";d.style.backgroundColor=u.color;d.style.zIndex=String(100-i);d.title=u.username;d.textContent=u.username[0];pa.appendChild(d);}
    });
    if(over>0){var b=document.createElement("div");b.className="lc-p-overflow";b.textContent="+"+over;pa.appendChild(b);}
    pc.textContent=arr.length+" online";
  }

  document.addEventListener("mousemove",function(e){
    var now=Date.now();if(now-lastSend<100)return;
    var x=e.clientX/window.innerWidth,y=e.clientY/window.innerHeight;
    if(Math.abs(x-lastX)<.001&&Math.abs(y-lastY)<.001)return;
    lastX=x;lastY=y;lastSend=now;
    if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:"cursor",x:x,y:y}));
  });
  document.addEventListener("touchmove",function(e){
    var t=e.touches[0];if(!t)return;var now=Date.now();if(now-lastSend<100)return;
    var x=t.clientX/window.innerWidth,y=t.clientY/window.innerHeight;
    lastX=x;lastY=y;lastSend=now;
    if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:"cursor",x:x,y:y}));
  });
  window.addEventListener("beforeunload",function(){if(ws)ws.close()});
  connect();
})();`;
}
