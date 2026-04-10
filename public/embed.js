(function(){
  const script=document.currentScript;
  const ORIGIN=new URL(script.src).origin;

  /* ── configuration (read synchronously while currentScript is valid) ── */
  function attr(n){return script&&script.getAttribute(n)||"";}
  const room=attr("data-room")||(location.hostname+location.pathname);
  const presenceSelector=attr("data-presence");
  const containerSelector=attr("data-container");
  const showCursors=attr("data-show-cursors")!=="false";
  const showPresence=attr("data-show-presence")!=="false";
  const showLogin=attr("data-show-login")!=="false";
  const countAnonymous=attr("data-count-anonymous")!=="false";
  const throttleMs=parseInt(attr("data-throttle")||"50",10)||50;

  /* ── auth token (shared with the service via localStorage) ── */
  const tokenKey="lc_token_"+ORIGIN.replace(/^https?:\/\//,"");
  let lcToken=null;
  let selfUser=null;

  (function readToken(){
    try{
      const up=new URLSearchParams(location.search);
      const fromUrl=up.get("lc_token");
      if(fromUrl){
        lcToken=fromUrl;
        localStorage.setItem(tokenKey,lcToken);
        up.delete("lc_token");
        const qs=up.toString();
        history.replaceState({},"",location.pathname+(qs?"?"+qs:"")+location.hash);
      } else {
        lcToken=localStorage.getItem(tokenKey)||null;
      }
      if(lcToken){
        const p=JSON.parse(atob(lcToken.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
        if(p&&p.exp>Date.now()/1000){
          selfUser={username:p.username,avatar:p.avatar,url:p.url};
        } else {
          lcToken=null;localStorage.removeItem(tokenKey);
        }
      }
    }catch(e){lcToken=null;}
  })();

  function init(){

  /* ── styles ── */
  const style=document.createElement("style");
  style.textContent=`
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
    .lc-avatar-logout::after{content:'✕';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(220,38,38,.75);color:#fff;font:700 13px/1 system-ui;opacity:0;transition:opacity .18s;border-radius:50%}
    .lc-avatar-logout:hover::after{opacity:1}
  `;
  document.head.appendChild(style);

  /* ── containers ── */
  const cursorsDiv=document.createElement("div");cursorsDiv.id="lc-cursors";document.body.appendChild(cursorsDiv);
  const edgeDiv=document.createElement("div");edgeDiv.id="lc-edges";document.body.appendChild(edgeDiv);

  let presenceDiv=null;
  if(showPresence){
    presenceDiv=document.createElement("div");presenceDiv.className="lc-presence";presenceDiv.id="lc-presence";
    presenceDiv.innerHTML='<div class="lc-presence-avatars" id="lc-pa"></div><div class="lc-nav-divider" id="lc-nd" style="display:none"></div><div id="lc-auth"></div>';
    if(presenceSelector){
      const mountEl=document.querySelector(presenceSelector);
      if(mountEl){presenceDiv.classList.add("lc-presence--mounted");mountEl.appendChild(presenceDiv);}
      else{document.body.appendChild(presenceDiv);}
    } else {
      document.body.appendChild(presenceDiv);
    }
  }

  let ws,selfId,lastSend=0,lastXR=-1,lastYO=-1,reconnectDelay=1000;
  const users=new Map();
  const touchFadeTimers={};

  /* ── show initial presence state (login button or own avatar) immediately ── */
  updatePresence();

  /* ── coordinate helpers ── */
  function getContainer(){
    if(containerSelector)return document.querySelector(containerSelector);
    return document.documentElement;
  }

  function getCursorPos(clientX,clientY){
    const c=getContainer();if(!c)return null;
    const r=c.getBoundingClientRect();
    return{
      xRatio:(clientX-r.left)/r.width,
      yOffset:clientY-r.top,
      containerHeight:c.scrollHeight
    };
  }

  function resolvePos(pos){
    const c=getContainer();if(!c)return{x:0,y:0,vis:false};
    const r=c.getBoundingClientRect();
    const sy=window.scrollY||window.pageYOffset||0;
    const cdt=r.top+sy;
    const lx=r.left+pos.xRatio*r.width;
    const ly=(cdt+pos.yOffset)-sy;
    return{x:lx,y:ly,vis:ly>=-30&&ly<=window.innerHeight+30};
  }

  function cursorSVG(c){
    const ns="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(ns,"svg");
    svg.setAttribute("class","lc-arrow");svg.setAttribute("width","16");svg.setAttribute("height","20");
    svg.setAttribute("viewBox","0 0 16 20");svg.setAttribute("fill","none");
    const path=document.createElementNS(ns,"path");
    path.setAttribute("d","M0.5 0.5L0.5 17L5 12.5H13Z");
    path.setAttribute("fill",c);path.setAttribute("stroke","#fff");
    path.setAttribute("stroke-width","1.2");path.setAttribute("stroke-linejoin","round");
    svg.appendChild(path);
    return svg;
  }

  function connect(){
    const proto=location.protocol==="https:"?"wss:":"ws:";
    let wsUrl=proto+"//"+ORIGIN.replace(new RegExp("^https?://"),"")+"/ws?room="+encodeURIComponent(room);
    if(lcToken)wsUrl+="&token="+encodeURIComponent(lcToken);
    ws=new WebSocket(wsUrl);
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
    const c=u.color||"#6366f1";
    let el=null;
    if(showCursors){
      el=document.createElement("div");el.className="lc-cursor";
      el.appendChild(cursorSVG(c));
      const td=document.createElement("div");td.className="lc-touch-dot";td.style.background=c;el.appendChild(td);
      const info=document.createElement("div");info.className="lc-info";
      if(u.avatar){
        const av=document.createElement("img");av.className="lc-avatar";av.src=u.avatar;info.appendChild(av);
      }else{
        const dot=document.createElement("div");dot.className="lc-dot";dot.style.background=c;dot.textContent=u.username[0];info.appendChild(dot);
      }
      const label=document.createElement("span");label.className="lc-label";label.style.background=c;label.textContent=u.username;info.appendChild(label);
      el.appendChild(info);
      cursorsDiv.appendChild(el);
    }
    users.set(u.id,{username:u.username,avatar:u.avatar,url:u.url,color:c,el:el,edgeEl:null,xRatio:u.xRatio||-1,yOffset:u.yOffset||-1,inputType:u.inputType||"mouse",containerHeight:u.containerHeight||0});
  }

  function moveCursor(m){
    const u=users.get(m.id);if(!u)return;
    u.xRatio=m.xRatio;u.yOffset=m.yOffset;u.inputType=m.inputType||"mouse";u.containerHeight=m.containerHeight||0;

    if(!showCursors)return;

    // Touch class toggle
    if(m.inputType==="touch")u.el.classList.add("touch");
    else u.el.classList.remove("touch");

    // Clear any pending touch fade
    if(touchFadeTimers[m.id]){clearTimeout(touchFadeTimers[m.id]);delete touchFadeTimers[m.id];}

    const p=resolvePos(m);
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
    const isTop=p.y<0;
    if(!u.edgeEl){
      u.edgeEl=document.createElement("div");
      u.edgeEl.className="lc-edge";
      const avDiv=document.createElement("div");avDiv.className="lc-e-av";
      if(u.avatar){const avImg=document.createElement("img");avImg.src=u.avatar;avDiv.appendChild(avImg);}
      else{avDiv.style.background=u.color;avDiv.textContent=u.username[0];}
      u.edgeEl.appendChild(avDiv);
      u.edgeEl.appendChild(document.createTextNode(" "+u.username));
      u.edgeEl.style.background=u.color;
      u.edgeEl.onclick=function(){
        const cur=resolvePos(u);
        const sy=window.scrollY||window.pageYOffset||0;
        window.scrollTo({top:sy+(cur.y-window.innerHeight/2),behavior:"smooth"});
      };
      edgeDiv.appendChild(u.edgeEl);
    }
    const cx=Math.max(8,Math.min(p.x,window.innerWidth-120));
    u.edgeEl.style.left=cx+"px";
    if(isTop){u.edgeEl.style.top="8px";u.edgeEl.style.bottom="";}
    else{u.edgeEl.style.bottom="8px";u.edgeEl.style.top="";}
  }

  function removeEdge(id){
    const u=users.get(id);if(!u||!u.edgeEl)return;
    u.edgeEl.remove();u.edgeEl=null;
  }

  function removeUser(id){
    const u=users.get(id);if(!u)return;
    if(u.el){u.el.classList.add("leaving");setTimeout(function(){u.el.remove()},300);}
    if(u.edgeEl)u.edgeEl.remove();
    if(touchFadeTimers[id]){clearTimeout(touchFadeTimers[id]);delete touchFadeTimers[id];}
    users.delete(id);
  }

  function updatePresence(){
    if(!showPresence||!presenceDiv)return;
    const pa=document.getElementById("lc-pa");if(!pa)return;
    const nd=document.getElementById("lc-nd");
    const authEl=document.getElementById("lc-auth");
    pa.innerHTML="";
    const arr=Array.from(users.values());
    const filtered=countAnonymous?arr:arr.filter(function(u){return !!u.avatar;});
    const vis=filtered.slice(0,5),over=filtered.length-vis.length;
    vis.forEach(function(u,i){
      if(u.avatar){const a=document.createElement("a");a.className="lc-p-avatar";a.href=u.url;a.target="_blank";a.title=u.username;a.style.zIndex=String(100-i);const im=document.createElement("img");im.src=u.avatar;im.alt=u.username;a.appendChild(im);pa.appendChild(a);}
      else{const d=document.createElement("div");d.className="lc-p-avatar";d.style.backgroundColor=u.color;d.style.zIndex=String(100-i);d.title=u.username;d.textContent=u.username[0];pa.appendChild(d);}
    });
    if(over>0){const b=document.createElement("div");b.className="lc-p-overflow";b.textContent="+"+over;pa.appendChild(b);}
    if(nd)nd.style.display=arr.length>0?"":"none";
    if(!authEl)return;
    authEl.innerHTML="";
    if(selfUser){
      const logoutBtn=document.createElement("button");
      logoutBtn.className="lc-avatar-logout";
      logoutBtn.title="Sign out (@"+selfUser.username+")";
      logoutBtn.onclick=function(){localStorage.removeItem(tokenKey);location.reload();};
      if(selfUser.avatar){const av=document.createElement("img");av.src=selfUser.avatar;av.alt=selfUser.username;logoutBtn.appendChild(av);}
      else{logoutBtn.style.cssText="background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font:700 13px/1 system-ui";logoutBtn.textContent=selfUser.username[0];}
      authEl.appendChild(logoutBtn);
    } else if(showLogin){
      const loginUrl=ORIGIN+"/auth/login?redirect="+encodeURIComponent(location.href);
      const loginBtn=document.createElement("a");loginBtn.className="lc-btn-login";loginBtn.href=loginUrl;
      loginBtn.innerHTML='<svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>Who\'s Here';
      authEl.appendChild(loginBtn);
    }
  }

  /* ── update edges on scroll ── */
  let scrollTick=false;
  window.addEventListener("scroll",function(){
    if(scrollTick)return;scrollTick=true;
    requestAnimationFrame(function(){
      scrollTick=false;
      if(!showCursors)return;
      users.forEach(function(u,id){
        if(u.xRatio<0)return;
        const p=resolvePos(u);
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
    const t=e.touches[0];if(!t)return;
    sendPos(t.clientX,t.clientY,"touch");
  },{passive:true});

  function sendPos(cx,cy,inputType){
    const now=Date.now();if(now-lastSend<throttleMs)return;
    const pos=getCursorPos(cx,cy);if(!pos)return;
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
})();
