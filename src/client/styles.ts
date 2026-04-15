/**
 * All cursor/edge/snap badge positioning uses `transform: translate3d(...)`
 * on a GPU-composited layer to avoid layout/paint thrash. Transitions
 * apply only to `transform` and `opacity`, never to `left/top`.
 */
const CSS = `
.lc-cursor{position:fixed;left:0;top:0;pointer-events:none;z-index:999999;opacity:0;transform:translate3d(-9999px,-9999px,0);transition:transform 80ms linear,opacity .3s;will-change:transform,opacity}
.lc-cursor.active{opacity:1}
.lc-cursor.leaving{opacity:0;transition:opacity .3s}
.lc-cursor.no-anim{transition:opacity .3s}
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

.lc-edge{position:fixed;left:0;z-index:999998;display:flex;align-items:center;gap:4px;padding:3px 8px 3px 4px;border-radius:12px;font:500 11px/1 system-ui;color:#fff;white-space:nowrap;cursor:pointer;opacity:.8;pointer-events:auto;transform:translate3d(0,0,0);transition:transform .15s,opacity .2s;will-change:transform}
.lc-edge:hover{opacity:1}
.lc-edge.top{top:8px}
.lc-edge.bottom{bottom:8px}
.lc-edge .lc-e-av{width:18px;height:18px;border-radius:50%;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font:bold 9px/1 system-ui;color:#fff}
.lc-edge .lc-e-av img{width:100%;height:100%;object-fit:cover}

.lc-presence{position:fixed;top:12px;right:12px;z-index:999998;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:4px 12px 4px 8px;border-radius:24px;box-shadow:0 1px 6px rgba(0,0,0,.08);border:1px solid rgba(0,0,0,.06)}
.lc-presence.lc-presence--mounted{position:static;background:none;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none;border:none;padding:0}
.lc-presence-avatars{display:flex;align-items:center}
.lc-p-avatar{width:32px;height:32px;border-radius:50%;border:2px solid #fff;margin-left:-8px;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font:600 13px/1 system-ui;color:#fff;cursor:pointer;text-decoration:none;transition:transform .2s;position:relative;box-shadow:0 1px 4px rgba(0,0,0,.1)}
.lc-p-avatar:first-child{margin-left:0}
.lc-presence-avatars:hover .lc-p-avatar:not(:first-child){transform:translateX(12px)}
.lc-p-avatar:hover{transform:scale(1.12) translateX(0);z-index:10!important}
.lc-presence-avatars:hover .lc-p-avatar:hover{transform:scale(1.12) translateX(12px)}
.lc-presence-avatars:hover .lc-p-avatar:first-child:hover{transform:scale(1.12)}
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

.lc-chat-stack{position:absolute;left:22px;bottom:100%;margin-bottom:4px;display:flex;flex-direction:column;align-items:flex-start;gap:3px;pointer-events:none;max-width:220px}
.lc-cursor.touch .lc-chat-stack{left:-4px;bottom:auto;top:100%;margin-bottom:0;margin-top:4px}
.lc-chat-bubble{padding:5px 10px;border-radius:10px;font:500 12px/1.5 system-ui;color:#fff;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;pointer-events:none;opacity:1;transition:opacity .5s;animation:lc-chat-in .2s ease;max-width:100%}
.lc-chat-bubble.fade{opacity:0}
@keyframes lc-chat-in{from{opacity:0;transform:translateY(4px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
.lc-chat-input-wrap{position:fixed;left:0;top:0;z-index:1000000;pointer-events:auto;transform:translate3d(0,0,0);will-change:transform}
.lc-chat-input{border:none;outline:none;padding:4px 10px;border-radius:10px;font:500 13px/1.5 system-ui;color:#fff;min-width:60px;max-width:220px;box-shadow:0 2px 12px rgba(0,0,0,.15);caret-color:#fff}
.lc-chat-input::placeholder{color:rgba(255,255,255,.6)}
.lc-chat-hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:999997;padding:6px 14px;border-radius:8px;background:rgba(0,0,0,.7);color:#fff;font:500 12px/1 system-ui;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
.lc-chat-hint.visible{opacity:1}

.lc-history-panel{position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:999997;max-width:360px;width:90vw;max-height:240px;overflow-y:auto;background:rgba(30,30,46,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;box-shadow:0 4px 24px rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.08);animation:lc-hist-in .25s ease;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.15) transparent}
.lc-history-panel::-webkit-scrollbar{width:4px}
.lc-history-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:2px}
.lc-history-panel.fade-out{opacity:0;transition:opacity .4s}
@keyframes lc-hist-in{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.lc-hist-msg{display:flex;align-items:flex-start;gap:6px}
.lc-hist-av{width:18px;height:18px;border-radius:50%;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font:bold 9px/1 system-ui;color:#fff}
.lc-hist-av img{width:100%;height:100%;object-fit:cover}
.lc-hist-body{display:flex;flex-direction:column;gap:1px;min-width:0}
.lc-hist-name{font:600 10px/1 system-ui;opacity:.6}
.lc-hist-text{font:400 12px/1.4 system-ui;color:#e0e0e0;word-break:break-word}
.lc-hist-time{font:400 10px/1 system-ui;color:rgba(255,255,255,.3);margin-left:auto;flex-shrink:0;align-self:center}
`;

let injected = false;
export function injectStyles(): void {
  if (injected) return;
  injected = true;
  const s = document.createElement('style');
  s.id = '__lc_styles__';
  s.textContent = CSS;
  document.head.appendChild(s);
}
