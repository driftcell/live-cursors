import type { SelfUser, ResolvedPos } from './types';

export const COLORS = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9'];
export const GITHUB_SVG = '<svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

const SNAP_PATH_RE = /^[0-9]+(\.[0-9]+)*$/;

export function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) { hash = ((hash << 5) - hash) + id.charCodeAt(i); hash |= 0; }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function sanitizeSnapId(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > 256) return null;
  return SNAP_PATH_RE.test(v) ? v : null;
}

export function isSafeImageUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

/* ── auth token ─────────────────────────────────────────────────────────── */

export interface AuthState { tokenKey: string; token: string | null; user: SelfUser | null }

export function readToken(server: string): AuthState {
  const tokenKey = 'lc_token_' + server.replace(/^https?:\/\//, '');
  let token: string | null = null;
  let user: SelfUser | null = null;
  try {
    const up = new URLSearchParams(location.search);
    const fromUrl = up.get('lc_token') || up.get('token');
    if (fromUrl) {
      token = fromUrl;
      localStorage.setItem(tokenKey, token);
      up.delete('lc_token'); up.delete('token');
      const qs = up.toString();
      history.replaceState({}, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    } else {
      token = localStorage.getItem(tokenKey);
    }
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload && payload.exp > Date.now() / 1000) {
        user = { username: payload.username, avatar: payload.avatar, url: payload.url };
      } else {
        token = null;
        localStorage.removeItem(tokenKey);
      }
    }
  } catch { token = null; }
  return { tokenKey, token, user };
}

/* ── cursor SVG ─────────────────────────────────────────────────────────── */

export function cursorSVG(color: string): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'lc-arrow');
  svg.setAttribute('width', '16'); svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 16 20'); svg.setAttribute('fill', 'none');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M0.5 0.5L0.5 17L5 12.5H13Z');
  path.setAttribute('fill', color); path.setAttribute('stroke', '#fff');
  path.setAttribute('stroke-width', '1.2'); path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/* ── coordinate system ──────────────────────────────────────────────────── */

export function getContainer(selector: string): Element {
  return (selector && document.querySelector(selector)) || document.documentElement;
}

export interface ContainerPos { xRatio: number; yOffset: number; containerHeight: number }

export function clientToContainer(container: Element, cx: number, cy: number): ContainerPos {
  const r = container.getBoundingClientRect();
  return {
    xRatio: (cx - r.left) / r.width,
    yOffset: cy - r.top,
    containerHeight: container.scrollHeight,
  };
}

export function containerToViewport(container: Element, xRatio: number, yOffset: number): ResolvedPos {
  const r = container.getBoundingClientRect();
  const x = r.left + xRatio * r.width;
  const y = r.top + yOffset;
  return { x, y, visible: y >= -30 && y <= window.innerHeight + 30 };
}

/* ── DOM-path snap helpers ──────────────────────────────────────────────── */

const OWN_CLASSES = ['lc-cursor','lc-edge','lc-presence','lc-snap-line','lc-snap-badge','lc-chat-input-wrap','lc-chat-hint','lc-history-panel','lc-cursors','lc-edges'];

function isInjected(el: Element | null): boolean {
  if (!el || !el.classList) return false;
  for (const c of OWN_CLASSES) if (el.classList.contains(c)) return true;
  return false;
}

function isOwnOverlay(el: Element | null): boolean {
  while (el) { if (isInjected(el)) return true; el = el.parentElement; }
  return false;
}

export function findSnappable(el: Element | null): Element | null {
  if (!el || el === document.body || el === document.documentElement) return null;
  if (isOwnOverlay(el)) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return null;
  const vw = window.innerWidth, vh = window.innerHeight;
  if (r.width * r.height > vw * vh * 0.25) return null;
  return el;
}

function filteredIndex(el: Element): number {
  const p = el.parentElement; if (!p) return -1;
  let idx = 0;
  for (let i = 0; i < p.children.length; i++) {
    if (p.children[i] === el) return idx;
    if (!isInjected(p.children[i])) idx++;
  }
  return -1;
}

export function getElementPath(el: Element): string | null {
  const path: number[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const idx = filteredIndex(cur); if (idx < 0) break;
    path.unshift(idx); cur = cur.parentElement;
  }
  return path.length ? path.join('.') : null;
}

function childAt(parent: Element, targetIdx: number): Element | null {
  let idx = 0;
  for (let i = 0; i < parent.children.length; i++) {
    const c = parent.children[i];
    if (isInjected(c)) continue;
    if (idx === targetIdx) return c;
    idx++;
  }
  return null;
}

export function resolveElementPath(pathStr: string): Element | null {
  const parts = pathStr.split('.');
  let el: Element | null = document.body;
  for (const part of parts) {
    const idx = parseInt(part, 10);
    if (isNaN(idx) || !el) return null;
    el = childAt(el, idx);
    if (!el) return null;
  }
  return el;
}

/* ── tiny event emitter ─────────────────────────────────────────────────── */

export function emit(name: string, detail: unknown): void {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* noop */ }
}
