import type { RemoteUser, IncomingUser, IncomingCursor, ResolvedPos } from './types';
import { containerToViewport, cursorSVG } from './util';

const TOUCH_FADE_MS = 3000;

export class CursorLayer {
  private root: HTMLElement;
  private edgeRoot: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'lc-cursors';
    parent.appendChild(this.root);

    this.edgeRoot = document.createElement('div');
    this.edgeRoot.className = 'lc-edges';
    parent.appendChild(this.edgeRoot);
  }

  destroy(): void {
    this.root.remove();
    this.edgeRoot.remove();
  }

  createUser(u: IncomingUser): HTMLElement {
    const color = u.color || '#6366f1';
    const el = document.createElement('div');
    el.className = 'lc-cursor';
    el.appendChild(cursorSVG(color));

    const td = document.createElement('div');
    td.className = 'lc-touch-dot';
    td.style.background = color;
    el.appendChild(td);

    const info = document.createElement('div');
    info.className = 'lc-info';
    if (u.avatar) {
      const av = document.createElement('img');
      av.className = 'lc-avatar';
      av.src = u.avatar;
      info.appendChild(av);
    } else {
      const dot = document.createElement('div');
      dot.className = 'lc-dot';
      dot.style.background = color;
      dot.textContent = u.username[0];
      info.appendChild(dot);
    }
    const label = document.createElement('span');
    label.className = 'lc-label';
    label.style.background = color;
    label.textContent = u.username;
    info.appendChild(label);
    el.appendChild(info);

    this.root.appendChild(el);
    return el;
  }

  removeUser(u: RemoteUser, animate: boolean): void {
    if (u.el) {
      if (animate) {
        const el = u.el;
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 300);
      } else {
        u.el.remove();
      }
    }
    if (u.edgeEl) u.edgeEl.remove();
    if (u.touchFadeTimer != null) clearTimeout(u.touchFadeTimer);
  }

  /** Move the cursor element. `animate=false` skips transition (use during scroll). */
  position(u: RemoteUser, p: ResolvedPos, animate: boolean): void {
    if (!u.el) return;
    if (!animate) u.el.classList.add('no-anim');
    u.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    if (!animate) {
      // Force reflow then remove no-anim so future updates animate.
      void u.el.offsetWidth;
      u.el.classList.remove('no-anim');
    }
  }

  setActive(u: RemoteUser, active: boolean): void {
    if (!u.el) return;
    if (active) u.el.classList.add('active');
    else u.el.classList.remove('active');
  }

  setTouch(u: RemoteUser, isTouch: boolean): void {
    if (!u.el) return;
    if (isTouch) u.el.classList.add('touch'); else u.el.classList.remove('touch');
  }

  scheduleTouchFade(u: RemoteUser): void {
    if (u.touchFadeTimer != null) clearTimeout(u.touchFadeTimer);
    u.touchFadeTimer = window.setTimeout(() => this.setActive(u, false), TOUCH_FADE_MS);
  }

  /** Show or move an edge indicator for off-viewport cursors. */
  showEdge(u: RemoteUser, p: ResolvedPos, onClick: () => void): void {
    if (!u.edgeEl) {
      const el = document.createElement('div');
      el.className = 'lc-edge';
      const av = document.createElement('div');
      av.className = 'lc-e-av';
      if (u.avatar) {
        const img = document.createElement('img');
        img.src = u.avatar;
        av.appendChild(img);
      } else {
        av.style.background = u.color;
        av.textContent = u.username[0];
      }
      el.appendChild(av);
      el.appendChild(document.createTextNode(' ' + u.username));
      el.style.background = u.color;
      el.onclick = onClick;
      this.edgeRoot.appendChild(el);
      u.edgeEl = el;
    }
    const isTop = p.y < 0;
    const cx = Math.max(8, Math.min(p.x, window.innerWidth - 120));
    u.edgeEl.classList.toggle('top', isTop);
    u.edgeEl.classList.toggle('bottom', !isTop);
    u.edgeEl.style.transform = `translate3d(${cx}px, 0, 0)`;
  }

  hideEdge(u: RemoteUser): void {
    if (u.edgeEl) { u.edgeEl.remove(); u.edgeEl = null; }
  }
}

export function makeRemoteUser(u: IncomingUser, el: HTMLElement | null): RemoteUser {
  return {
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    url: u.url,
    color: u.color || '#6366f1',
    xRatio: u.xRatio ?? -1,
    yOffset: u.yOffset ?? -1,
    inputType: (u.inputType === 'touch' ? 'touch' : 'mouse'),
    containerHeight: u.containerHeight ?? 0,
    el,
    edgeEl: null,
    snap: null,
    chatStack: null,
    chatBubbles: [],
    touchFadeTimer: null,
    typingEl: null,
  };
}

export function applyIncoming(u: RemoteUser, m: IncomingCursor): void {
  u.xRatio = m.xRatio;
  u.yOffset = m.yOffset;
  u.inputType = m.inputType === 'touch' ? 'touch' : 'mouse';
  u.containerHeight = m.containerHeight ?? 0;
}

export function resolve(container: Element, u: RemoteUser): ResolvedPos {
  return containerToViewport(container, u.xRatio, u.yOffset);
}
