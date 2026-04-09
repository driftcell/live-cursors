export function getEmbedJS(origin: string): string {
  return `(function(){
  var script=document.currentScript;
  var ORIGIN=${JSON.stringify(origin)};

  /* ── configuration (read synchronously while currentScript is valid) ── */
  function attr(n){return script&&script.getAttribute(n)||"";}
  var room=attr("data-room")||location.pathname;
  var presenceSelector=attr("data-presence");
  var containerSelector=attr("data-container");
  var showCursors=attr("data-show-cursors")!=="false";
  var showPresence=attr("data-show-presence")!=="false";
  var countAnonymous=attr("data-count-anonymous")!=="false";
  var throttleMs=parseInt(attr("data-throttle")||"50",10)||50;

  function init(){

  /* ── styles ── */
  var style=document.createElement("style");
  style.textContent=\`
    .lc-cursor{position:fixed;pointer-events:none;z-index:999999;transition:left 80ms linear,top 80ms linear;opacity:0;will-change:left,top}
    .lc-cursor.active{opacity:1}
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
  \`;
  document.head.appendChild(style);

  /* ── containers ── */
  var cursorsDiv=document.createElement("div");cursorsDiv.id="lc-cursors";document.body.appendChild(cursorsDiv);
  var edgeDiv=document.createElement("div");edgeDiv.id="lc-edges";document.body.appendChild(edgeDiv);

  var presenceDiv=null;
  if(showPresence){
    presenceDiv=document.createElement("div");presenceDiv.className="lc-presence";presenceDiv.id="lc-presence";
    presenceDiv.innerHTML='<div class="lc-presence-avatars" id="lc-pa"></div>';
    if(presenceSelector){
      var mountEl=document.querySelector(presenceSelector);
      if(mountEl){presenceDiv.classList.add("lc-presence--mounted");mountEl.appendChild(presenceDiv);}
      else{document.body.appendChild(presenceDiv);}
    } else {
      document.body.appendChild(presenceDiv);
    }
  }

  var ws,selfId,users=new Map(),lastSend=0,lastXR=-1,lastYO=-1,reconnectDelay=1000;
  var touchFadeTimers={};

  /* ── coordinate helpers ── */
  function getContainer(){
    if(containerSelector)return document.querySelector(containerSelector);
    return document.documentElement;
  }

  function getCursorPos(clientX,clientY){
    var c=getContainer();if(!c)return null;
    var r=c.getBoundingClientRect();
    var sx=window.scrollX||window.pageXOffset||0;
    var sy=window.scrollY||window.pageYOffset||0;
    return{
      xRatio:(clientX+sx-r.left-sx)/r.width,
      yOffset:(clientY+sy)-(r.top+sy),
      containerHeight:c.scrollHeight
    };
  }

  function resolvePos(pos){
    var c=getContainer();if(!c)return{x:0,y:0,vis:false};
    var r=c.getBoundingClientRect();
    var sy=window.scrollY||window.pageYOffset||0;
    var cdt=r.top+sy;
    var lx=r.left+pos.xRatio*r.width;
    var ly=(cdt+pos.yOffset)-sy;
    return{x:lx,y:ly,vis:ly>=-30&&ly<=window.innerHeight+30};
  }

  function cursorSVG(c){return '<svg class="lc-arrow" width="16" height="20" viewBox="0 0 16 20" fill="none"><path d="M0.5 0.5L0.5 17L5 12.5H13Z" fill="'+c+'" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>';}

  function connect(){
    var proto=location.protocol==="https:"?"wss:":"ws:";
    ws=new WebSocket(proto+"//"+ORIGIN.replace(new RegExp("^https?://"),"")+"/ws?room="+encodeURIComponent(room));
    ws.onopen=function(){reconnectDelay=1000};
    ws.onmessage=function(e){try{handle(JSON.parse(e.data))}catch(x){}};
    ws.onclose=function(){ws=null;setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(reconnectDelay*1.5,30000)};
  }

  function isAnon(u){return !u.avatar;}

  function handle(m){
    if(m.type==="ping"&&ws&&ws.readyState===1){ws.send(JSON.stringify({type:"pong"}));return;}
    if(m.type==="init"){selfId=m.self;m.users.forEach(function(u){if(u.id!==selfId)addUser(u)});updatePresence();}
    else if(m.type==="join"){addUser(m.user);updatePresence();}
    else if(m.type==="cursor"){moveCursor(m);}
    else if(m.type==="leave"){removeUser(m.id);updatePresence();}
  }

  function addUser(u){
    if(users.has(u.id))return;
    var c=u.color||"#6366f1";
    var el=null;
    if(showCursors){
      el=document.createElement("div");el.className="lc-cursor";
      el.innerHTML=cursorSVG(c)+'<div class="lc-touch-dot" style="background:'+c+'"></div><div class="lc-info">'+(u.avatar?'<img class="lc-avatar" src="'+u.avatar+'">':'<div class="lc-dot" style="background:'+c+'">'+u.username[0]+'</div>')+'<span class="lc-label" style="background:'+c+'">'+u.username+'</span></div>';
      cursorsDiv.appendChild(el);
    }
    users.set(u.id,{username:u.username,avatar:u.avatar,url:u.url,color:c,el:el,edgeEl:null,xRatio:u.xRatio||-1,yOffset:u.yOffset||-1,inputType:u.inputType||"mouse",containerHeight:u.containerHeight||0});
  }

  function moveCursor(m){
    var u=users.get(m.id);if(!u)return;
    u.xRatio=m.xRatio;u.yOffset=m.yOffset;u.inputType=m.inputType||"mouse";u.containerHeight=m.containerHeight||0;

    if(!showCursors)return;

    // Touch class toggle
    if(m.inputType==="touch")u.el.classList.add("touch");
    else u.el.classList.remove("touch");

    // Clear any pending touch fade
    if(touchFadeTimers[m.id]){clearTimeout(touchFadeTimers[m.id]);delete touchFadeTimers[m.id];}

    var p=resolvePos(m);
    if(p.vis){
      u.el.style.left=p.x+"px";u.el.style.top=p.y+"px";
      u.el.classList.add("active");
      removeEdge(m.id);
    } else {
      u.el.classList.remove("active");
      showEdge(m.id,u,p);
    }

    // Touch cursors fade after inactivity
    if(m.inputType==="touch"){
      touchFadeTimers[m.id]=setTimeout(function(){u.el.classList.remove("active");},3000);
    }
  }

  function showEdge(id,u,p){
    if(!showCursors)return;
    var isTop=p.y<0;
    if(!u.edgeEl){
      u.edgeEl=document.createElement("div");
      u.edgeEl.className="lc-edge";
      var av=u.avatar?'<div class="lc-e-av"><img src="'+u.avatar+'"></div>':'<div class="lc-e-av" style="background:'+u.color+'">'+u.username[0]+'</div>';
      u.edgeEl.innerHTML=av+" "+u.username;
      u.edgeEl.style.background=u.color;
      u.edgeEl.onclick=function(){
        var sy=window.scrollY||window.pageYOffset||0;
        window.scrollTo({top:sy+(p.y-window.innerHeight/2),behavior:"smooth"});
      };
      edgeDiv.appendChild(u.edgeEl);
    }
    var cx=Math.max(8,Math.min(p.x,window.innerWidth-120));
    u.edgeEl.style.left=cx+"px";
    if(isTop){u.edgeEl.style.top="8px";u.edgeEl.style.bottom="";}
    else{u.edgeEl.style.bottom="8px";u.edgeEl.style.top="";}
  }

  function removeEdge(id){
    var u=users.get(id);if(!u||!u.edgeEl)return;
    u.edgeEl.remove();u.edgeEl=null;
  }

  function removeUser(id){
    var u=users.get(id);if(!u)return;
    if(u.el){u.el.classList.add("leaving");setTimeout(function(){u.el.remove()},300);}
    if(u.edgeEl)u.edgeEl.remove();
    if(touchFadeTimers[id]){clearTimeout(touchFadeTimers[id]);delete touchFadeTimers[id];}
    users.delete(id);
  }

  function updatePresence(){
    if(!showPresence||!presenceDiv)return;
    var pa=document.getElementById("lc-pa");if(!pa)return;pa.innerHTML="";
    var arr=Array.from(users.values());
    var filtered=countAnonymous?arr:arr.filter(function(u){return !!u.avatar;});
    var vis=filtered.slice(0,5),over=filtered.length-vis.length;
    vis.forEach(function(u,i){
      if(u.avatar){var a=document.createElement("a");a.className="lc-p-avatar";a.href=u.url;a.target="_blank";a.title=u.username;a.style.zIndex=String(100-i);var im=document.createElement("img");im.src=u.avatar;a.appendChild(im);pa.appendChild(a);}
      else{var d=document.createElement("div");d.className="lc-p-avatar";d.style.backgroundColor=u.color;d.style.zIndex=String(100-i);d.title=u.username;d.textContent=u.username[0];pa.appendChild(d);}
    });
    if(over>0){var b=document.createElement("div");b.className="lc-p-overflow";b.textContent="+"+over;pa.appendChild(b);}
  }

  /* ── update edges on scroll ── */
  var scrollTick=false;
  window.addEventListener("scroll",function(){
    if(scrollTick)return;scrollTick=true;
    requestAnimationFrame(function(){
      scrollTick=false;
      if(!showCursors)return;
      users.forEach(function(u,id){
        if(u.xRatio<0)return;
        var p=resolvePos(u);
        if(p.vis){
          if(u.el){u.el.style.left=p.x+"px";u.el.style.top=p.y+"px";u.el.classList.add("active");}
          removeEdge(id);
        } else {
          if(u.el)u.el.classList.remove("active");
          showEdge(id,u,p);
        }
      });
    });
  },{passive:true});

  /* ── mouse / touch tracking ── */
  document.addEventListener("mousemove",function(e){
    sendPos(e.clientX,e.clientY,"mouse");
  });
  document.addEventListener("touchmove",function(e){
    var t=e.touches[0];if(!t)return;
    sendPos(t.clientX,t.clientY,"touch");
  },{passive:true});

  function sendPos(cx,cy,inputType){
    var now=Date.now();if(now-lastSend<throttleMs)return;
    var pos=getCursorPos(cx,cy);if(!pos)return;
    if(Math.abs(pos.xRatio-lastXR)<.001&&Math.abs(pos.yOffset-lastYO)<1)return;
    lastXR=pos.xRatio;lastYO=pos.yOffset;lastSend=now;
    if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:"cursor",xRatio:pos.xRatio,yOffset:pos.yOffset,inputType:inputType,containerHeight:pos.containerHeight}));
  }

  function closeWs(){if(ws){ws.close();ws=null;}}
  window.addEventListener("beforeunload",closeWs);
  window.addEventListener("pagehide",closeWs);
  connect();
  } // end init

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init);
  } else {
    init();
  }
})();`;
}
