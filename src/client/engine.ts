import type { EngineConfig, RemoteUser, WSMessage, IncomingCursor, IncomingUser } from './types';
import {
  clientToContainer, containerToViewport, getContainer,
  emit, hashColor, readToken, sanitizeSnapId, findSnappable, getElementPath,
} from './util';
import { injectStyles } from './styles';
import { Connection } from './ws';
import { CursorLayer, applyIncoming, makeRemoteUser, resolve } from './cursors';
import { ChatLayer } from './chat';
import { PresenceBar } from './presence';
import { SnapHighlight } from './snap';

export class LiveCursorsEngine {
  private cfg: Required<EngineConfig>;

  // sub-systems
  private cursors!: CursorLayer;
  private chat!: ChatLayer;
  private presence!: PresenceBar;
  private snap = new SnapHighlight();
  private conn!: Connection;

  // state
  private users = new Map<string, RemoteUser>();
  private selfId: string | null = null;
  private selfColor = '#6366f1';
  private oauthReady = false;
  private tabHidden = false;
  private active = false;

  // throttled send state
  private lastSend = 0;
  private lastXR = -1;
  private lastYO = -1;
  private lastSnap: string | null = null;
  private selfMouseX = 0;
  private selfMouseY = 0;

  // scroll relayout
  private scrollScheduled = false;

  // auth
  private tokenKey: string;
  private token: string | null;
  private selfUser;

  // bound listeners
  private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private boundTouchMove = (e: TouchEvent) => this.onTouchMove(e);
  private boundScroll = () => this.onScroll();
  private boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private boundVisibility = () => this.onVisibility();
  private boundUnload = () => this.conn?.stop();

  constructor(cfg: EngineConfig) {
    this.cfg = {
      server: cfg.server || location.origin,
      room: cfg.room || (location.hostname + location.pathname),
      containerSelector: cfg.containerSelector || '',
      presenceSelector: cfg.presenceSelector || '',
      showCursors: cfg.showCursors !== false,
      showPresence: cfg.showPresence !== false,
      showLogin: cfg.showLogin !== false,
      showChat: cfg.showChat !== false,
      showSnap: cfg.showSnap === true,
      countAnonymous: cfg.countAnonymous !== false,
      telemetryEnabled: cfg.telemetryEnabled === true,
      throttleMs: cfg.throttleMs || 50,
    };
    const auth = readToken(this.cfg.server);
    this.tokenKey = auth.tokenKey;
    this.token = auth.token;
    this.selfUser = auth.user;
  }

  /* ── lifecycle ────────────────────────────────────────────────────────── */

  start(): void {
    if (this.active) return;
    this.active = true;
    injectStyles();

    this.cursors = new CursorLayer(document.body);
    this.chat = new ChatLayer(this.cfg.showChat, document.body);
    this.presence = new PresenceBar(this.cfg, this.selfUser, this.tokenKey, document.body);
    this.presence.render(this.users, this.oauthReady);

    this.bindEvents();
    this.fetchConfig();

    this.conn = new Connection(
      this.cfg.server, this.cfg.room, this.token,
      (m) => this.handleMessage(m),
      () => this.handleDisconnect(),
    );
    this.conn.start();

    if (this.cfg.telemetryEnabled) {
      setTimeout(() => this.fetchStats(), 2000);
    }
  }

  destroy(): void {
    this.active = false;
    this.unbindEvents();
    this.conn?.stop();
    for (const u of this.users.values()) {
      this.snap.detach(u);
      this.chat.cleanup(u);
      this.cursors.removeUser(u, false);
    }
    this.users.clear();
    this.cursors?.destroy();
    this.chat?.destroy();
    this.presence?.destroy();
  }

  /* ── events ───────────────────────────────────────────────────────────── */

  private bindEvents(): void {
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('touchmove', this.boundTouchMove, { passive: true });
    window.addEventListener('scroll', this.boundScroll, { passive: true });
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('visibilitychange', this.boundVisibility);
    window.addEventListener('beforeunload', this.boundUnload);
    window.addEventListener('pagehide', this.boundUnload);
  }

  private unbindEvents(): void {
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('touchmove', this.boundTouchMove);
    window.removeEventListener('scroll', this.boundScroll);
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('visibilitychange', this.boundVisibility);
    window.removeEventListener('beforeunload', this.boundUnload);
    window.removeEventListener('pagehide', this.boundUnload);
  }

  private onMouseMove(e: MouseEvent): void {
    this.selfMouseX = e.clientX;
    this.selfMouseY = e.clientY;
    this.sendPos(e.clientX, e.clientY, 'mouse');
  }

  private onTouchMove(e: TouchEvent): void {
    const t = e.touches[0]; if (!t) return;
    this.sendPos(t.clientX, t.clientY, 'touch');
  }

  private onScroll(): void {
    if (this.scrollScheduled) return;
    this.scrollScheduled = true;
    requestAnimationFrame(() => {
      this.scrollScheduled = false;
      if (!this.cfg.showCursors) return;
      const container = getContainer(this.cfg.containerSelector);
      for (const u of this.users.values()) {
        if (u.xRatio < 0 || u.snap) continue;
        const p = containerToViewport(container, u.xRatio, u.yOffset);
        this.applyPos(u, p, /*animate*/ false);
      }
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.chat.isInputOpen()) return;
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.chat.openInput(
        this.selfMouseX, this.selfMouseY, this.selfColor,
        (text) => { this.conn.send({ type: 'chat', text }); },
        () => { this.conn.send({ type: 'typing', typing: true }); },
        () => { this.conn.send({ type: 'typing', typing: false }); },
      );
    }
  }

  private onVisibility(): void {
    const wasHidden = this.tabHidden;
    this.tabHidden = document.hidden;
    if (this.tabHidden && !wasHidden) {
      for (const u of this.users.values()) this.chat.pause(u);
    } else if (!this.tabHidden && wasHidden) {
      for (const u of this.users.values()) this.chat.resume(u);
    }
  }

  /* ── send local cursor ────────────────────────────────────────────────── */

  private sendPos(cx: number, cy: number, inputType: 'mouse' | 'touch'): void {
    if (this.tabHidden) return;
    const now = Date.now();
    if (now - this.lastSend < this.cfg.throttleMs) return;

    const container = getContainer(this.cfg.containerSelector);
    const pos = clientToContainer(container, cx, cy);

    let snapTarget: string | null = null;
    if (this.cfg.showSnap) {
      try {
        const hovered = document.elementFromPoint(cx, cy);
        const snappable = findSnappable(hovered);
        if (snappable) snapTarget = getElementPath(snappable);
      } catch { /* noop */ }
    }

    const changed =
      Math.abs(pos.xRatio - this.lastXR) >= 0.001 ||
      Math.abs(pos.yOffset - this.lastYO) >= 1 ||
      snapTarget !== this.lastSnap;
    if (!changed) return;

    this.lastXR = pos.xRatio;
    this.lastYO = pos.yOffset;
    this.lastSnap = snapTarget;
    this.lastSend = now;

    this.conn.send({
      type: 'cursor',
      xRatio: pos.xRatio,
      yOffset: pos.yOffset,
      inputType,
      containerHeight: pos.containerHeight,
      snapTarget,
    });
  }

  /* ── ws ───────────────────────────────────────────────────────────────── */

  private handleMessage(m: WSMessage): void {
    switch (m.type) {
      case 'ping': this.conn.pong(); break;
      case 'stats': emit('lc:stats', m); break;
      case 'init': {
        this.selfId = m.self;
        if (this.selfId) this.selfColor = hashColor(this.selfId);
        for (const u of m.users) if (u.id !== this.selfId) this.addUser(u);
        this.presence.render(this.users, this.oauthReady);
        if (m.chatHistory && m.chatHistory.length > 0) this.chat.showHistory(m.chatHistory);
        break;
      }
      case 'join': this.addUser(m.user); this.presence.render(this.users, this.oauthReady); break;
      case 'leave': this.removeUser(m.id); this.presence.render(this.users, this.oauthReady); break;
      case 'cursor': this.moveCursor(m); break;
      case 'cursor_batch':
        for (const c of m.cursors) {
          if (c.id === this.selfId) continue;
          if (!this.users.has(c.id) && c.username) this.addUser(c as IncomingUser);
          this.moveCursor(c);
        }
        break;
      case 'chat': {
        const u = this.users.get(m.id);
        if (u) { this.chat.setTyping(u, false); this.chat.show(u, m.text, this.tabHidden); }
        break;
      }
      case 'typing': {
        const u = this.users.get(m.id);
        if (u) this.chat.setTyping(u, m.typing);
        break;
      }
      case 'error': emit('lc:error', m); break;
    }
  }

  private handleDisconnect(): void {
    for (const u of this.users.values()) {
      this.snap.detach(u);
      this.cursors.removeUser(u, false);
    }
    this.users.clear();
    this.presence.render(this.users, this.oauthReady);
  }

  /* ── users ────────────────────────────────────────────────────────────── */

  private addUser(u: IncomingUser): void {
    if (this.users.has(u.id)) return;
    const el = this.cfg.showCursors ? this.cursors.createUser(u) : null;
    this.users.set(u.id, makeRemoteUser(u, el));
    this.chat.flashIfFirst();
  }

  private removeUser(id: string): void {
    const u = this.users.get(id); if (!u) return;
    this.snap.detach(u);
    this.chat.cleanup(u);
    this.cursors.removeUser(u, true);
    this.users.delete(id);
  }

  private moveCursor(m: IncomingCursor): void {
    const u = this.users.get(m.id); if (!u) return;
    applyIncoming(u, m);
    if (!this.cfg.showCursors || !u.el) return;

    const snapId = this.cfg.showSnap ? sanitizeSnapId(m.snapTarget) : null;
    if (snapId) {
      this.cursors.setActive(u, false);
      this.cursors.hideEdge(u);
      if (u.touchFadeTimer != null) { clearTimeout(u.touchFadeTimer); u.touchFadeTimer = null; }
      this.snap.attach(u, snapId);
      return;
    }
    this.snap.detach(u);
    this.cursors.setTouch(u, u.inputType === 'touch');
    if (u.touchFadeTimer != null) { clearTimeout(u.touchFadeTimer); u.touchFadeTimer = null; }

    const container = getContainer(this.cfg.containerSelector);
    const p = resolve(container, u);
    this.applyPos(u, p, /*animate*/ true);

    if (u.inputType === 'touch') this.cursors.scheduleTouchFade(u);
  }

  private applyPos(u: RemoteUser, p: { x: number; y: number; visible: boolean }, animate: boolean): void {
    if (p.visible) {
      this.cursors.position(u, p, animate);
      this.cursors.setActive(u, true);
      this.cursors.hideEdge(u);
    } else {
      this.cursors.setActive(u, false);
      this.cursors.showEdge(u, p, () => {
        const container = getContainer(this.cfg.containerSelector);
        const cur = containerToViewport(container, u.xRatio, u.yOffset);
        const sy = window.scrollY || 0;
        window.scrollTo({ top: sy + (cur.y - window.innerHeight / 2), behavior: 'smooth' });
      });
    }
  }

  /* ── http config / stats ──────────────────────────────────────────────── */

  private fetchConfig(): void {
    fetch(this.cfg.server + '/api/config')
      .then((r) => r.json() as Promise<{ clientId?: string }>)
      .then((cfg) => {
        if (cfg && cfg.clientId) {
          this.oauthReady = true;
          this.presence.render(this.users, this.oauthReady);
        }
      })
      .catch(() => { /* noop */ });
  }

  private fetchStats(): void {
    fetch(this.cfg.server + '/api/stats?site=' + encodeURIComponent(this.cfg.room))
      .then((r) => r.json())
      .then((stats) => emit('lc:stats', stats))
      .catch(() => { /* noop */ });
  }
}
