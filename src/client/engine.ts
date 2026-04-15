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
import { OverlaySvg } from './overlay';
import { InkLayer } from './ink';
import { SelectionLayer } from './selection';
import { ReactionsLayer, REACTION_KEYS } from './reactions';
import { FollowMode } from './follow';

const IDLE_MS = 30_000;         // remote cursor dims after this much silence
const ACTIVE_MS = 1_500;         // presence halo stays while user moved recently
const OVERLAY_TICK_MS = 1_000;   // periodic sweep for idle/active transitions

export class LiveCursorsEngine {
  private cfg: Required<EngineConfig>;

  // sub-systems
  private cursors!: CursorLayer;
  private chat!: ChatLayer;
  private presence!: PresenceBar;
  private snap = new SnapHighlight();
  private conn!: Connection;
  private overlay!: OverlaySvg;
  private ink!: InkLayer;
  private selection!: SelectionLayer;
  private reactions!: ReactionsLayer;
  private follow!: FollowMode;

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

  // periodic idle/active sweep
  private sweepTimer: number | null = null;

  // ink drag state
  private inkActive = false;

  // auth
  private tokenKey: string;
  private token: string | null;
  private selfUser;

  // bound listeners
  private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private boundMouseDown = (e: MouseEvent) => this.onMouseDown(e);
  private boundMouseUp = (e: MouseEvent) => this.onMouseUp(e);
  private boundTouchMove = (e: TouchEvent) => this.onTouchMove(e);
  private boundScroll = () => this.onScroll();
  private boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
  private boundVisibility = () => this.onVisibility();
  private boundSelection = () => this.selection.onLocalChange();
  private boundUnload = () => this.conn?.stop();
  private boundResize = () => this.scheduleRelayout();

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
      showSelection: cfg.showSelection !== false,
      showInk: cfg.showInk !== false,
      showFollow: cfg.showFollow !== false,
      showReactions: cfg.showReactions !== false,
      idleFade: cfg.idleFade !== false,
      activeHalo: cfg.activeHalo !== false,
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
    this.overlay = new OverlaySvg(document.body);
    this.reactions = new ReactionsLayer(document.body, () => this.container());
    this.ink = new InkLayer(
      this.overlay,
      () => this.selfColor,
      () => this.container(),
      (pts, final) => this.conn.send({ type: 'ink', pts, final }),
      () => { /* local strokes aren't tracked on a user record */ },
    );
    this.selection = new SelectionLayer(
      this.overlay,
      () => this.container(),
      (rects) => this.conn.send({ type: 'selection', rects }),
    );
    this.follow = new FollowMode(this.users, () => this.container(), () => {
      this.presence.render(this.users, this.oauthReady, this.activeIds(), this.follow.getTargetId());
    });
    this.presence = new PresenceBar(this.cfg, this.selfUser, this.tokenKey, document.body, (id) => this.follow.toggle(id));
    this.presence.render(this.users, this.oauthReady, this.activeIds(), this.follow.getTargetId());

    this.bindEvents();
    this.fetchConfig();

    this.conn = new Connection(
      this.cfg.server, this.cfg.room, this.token,
      (m) => this.handleMessage(m),
      () => this.handleDisconnect(),
    );
    this.conn.start();

    this.sweepTimer = window.setInterval(() => this.sweepIdle(), OVERLAY_TICK_MS);

    if (this.cfg.telemetryEnabled) {
      setTimeout(() => this.fetchStats(), 2000);
    }
  }

  destroy(): void {
    this.active = false;
    this.unbindEvents();
    this.conn?.stop();
    if (this.sweepTimer != null) clearInterval(this.sweepTimer);
    for (const u of this.users.values()) {
      this.snap.detach(u);
      this.chat.cleanup(u);
      this.ink.cleanupUser(u);
      this.selection.cleanupUser(u);
      this.cursors.removeUser(u, false);
    }
    this.users.clear();
    this.cursors?.destroy();
    this.chat?.destroy();
    this.presence?.destroy();
    this.overlay?.destroy();
    this.follow?.stop();
  }

  /* ── events ───────────────────────────────────────────────────────────── */

  private bindEvents(): void {
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mousedown', this.boundMouseDown);
    document.addEventListener('mouseup', this.boundMouseUp);
    document.addEventListener('touchmove', this.boundTouchMove, { passive: true });
    window.addEventListener('scroll', this.boundScroll, { passive: true });
    window.addEventListener('resize', this.boundResize, { passive: true });
    document.addEventListener('keydown', this.boundKeyDown);
    document.addEventListener('visibilitychange', this.boundVisibility);
    document.addEventListener('selectionchange', this.boundSelection);
    window.addEventListener('beforeunload', this.boundUnload);
    window.addEventListener('pagehide', this.boundUnload);
  }

  private unbindEvents(): void {
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mousedown', this.boundMouseDown);
    document.removeEventListener('mouseup', this.boundMouseUp);
    document.removeEventListener('touchmove', this.boundTouchMove);
    window.removeEventListener('scroll', this.boundScroll);
    window.removeEventListener('resize', this.boundResize);
    document.removeEventListener('keydown', this.boundKeyDown);
    document.removeEventListener('visibilitychange', this.boundVisibility);
    document.removeEventListener('selectionchange', this.boundSelection);
    window.removeEventListener('beforeunload', this.boundUnload);
    window.removeEventListener('pagehide', this.boundUnload);
  }

  private container(): Element { return getContainer(this.cfg.containerSelector); }

  private onMouseMove(e: MouseEvent): void {
    this.selfMouseX = e.clientX;
    this.selfMouseY = e.clientY;
    if (this.inkActive) { this.ink.move(e.clientX, e.clientY); return; }
    this.sendPos(e.clientX, e.clientY, 'mouse');
  }

  private onMouseDown(e: MouseEvent): void {
    // Alt+drag → start ink stroke. Skip if disabled or user clicks one of our own overlays.
    if (!this.cfg.showInk || !e.altKey || e.button !== 0) return;
    const target = e.target as Element | null;
    if (target?.closest?.('.lc-presence,.lc-chat-input-wrap,.lc-follow-banner')) return;
    e.preventDefault();
    this.inkActive = true;
    this.ink.begin(e.clientX, e.clientY);
  }

  private onMouseUp(_e: MouseEvent): void {
    if (!this.inkActive) return;
    this.inkActive = false;
    this.ink.end();
  }

  private onTouchMove(e: TouchEvent): void {
    const t = e.touches[0]; if (!t) return;
    this.sendPos(t.clientX, t.clientY, 'touch');
  }

  private onScroll(): void {
    this.follow.onExternalScroll();
    this.scheduleRelayout();
  }

  private scheduleRelayout(): void {
    if (this.scrollScheduled) return;
    this.scrollScheduled = true;
    requestAnimationFrame(() => {
      this.scrollScheduled = false;
      const container = this.container();
      if (this.cfg.showCursors) {
        for (const u of this.users.values()) {
          if (u.xRatio < 0 || u.snap) continue;
          const p = containerToViewport(container, u.xRatio, u.yOffset);
          this.applyPos(u, p, /*animate*/ false);
        }
      }
      this.overlay.relayout(this.users.values(), container);
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.chat.isInputOpen()) return;
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName;
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable === true;

    if (e.key === 'Escape' && this.cfg.showFollow && this.follow.getTargetId()) {
      this.follow.stop();
      e.preventDefault();
      return;
    }

    if (inField) return;

    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '/') {
        e.preventDefault();
        this.chat.openInput(
          this.selfMouseX, this.selfMouseY, this.selfColor,
          (text) => { this.conn.send({ type: 'chat', text }); },
          () => { this.conn.send({ type: 'typing', typing: true }); },
          () => { this.conn.send({ type: 'typing', typing: false }); },
        );
        return;
      }
      if (this.cfg.showReactions) {
        const emoji = REACTION_KEYS[e.key];
        if (emoji) {
          const pos = clientToContainer(this.container(), this.selfMouseX, this.selfMouseY);
          if (this.reactions.spawnLocal(emoji, this.selfMouseX, this.selfMouseY)) {
            this.conn.send({ type: 'reaction', emoji, xRatio: pos.xRatio, yOffset: pos.yOffset });
          }
          e.preventDefault();
        }
      }
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

    const pos = clientToContainer(this.container(), cx, cy);

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
        this.presence.render(this.users, this.oauthReady, this.activeIds(), this.follow.getTargetId());
        if (m.chatHistory && m.chatHistory.length > 0) this.chat.showHistory(m.chatHistory, this.users, this.tabHidden);
        break;
      }
      case 'join': this.addUser(m.user); this.renderPresence(); break;
      case 'leave': this.follow.onUserGone(m.id); this.removeUser(m.id); this.renderPresence(); break;
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
        if (u) { this.chat.setTyping(u, false); this.chat.show(u, m.text, this.tabHidden); u.lastSeenTs = Date.now(); }
        break;
      }
      case 'typing': {
        const u = this.users.get(m.id);
        if (u) { this.chat.setTyping(u, m.typing); u.lastSeenTs = Date.now(); }
        break;
      }
      case 'selection': {
        if (!this.cfg.showSelection) break;
        const u = this.users.get(m.id);
        if (u) { this.selection.applyRemote(u, m.rects); u.lastSeenTs = Date.now(); }
        break;
      }
      case 'ink': {
        if (!this.cfg.showInk) break;
        const u = this.users.get(m.id);
        if (u) { this.ink.applyRemote(u, m.pts, !!m.final); u.lastSeenTs = Date.now(); }
        break;
      }
      case 'reaction': {
        if (!this.cfg.showReactions) break;
        const u = this.users.get(m.id);
        if (u) { this.reactions.showRemote(m.emoji, m.xRatio, m.yOffset); u.lastSeenTs = Date.now(); }
        break;
      }
      case 'error': emit('lc:error', m); break;
    }
  }

  private handleDisconnect(): void {
    for (const u of this.users.values()) {
      this.snap.detach(u);
      this.ink.cleanupUser(u);
      this.selection.cleanupUser(u);
      this.cursors.removeUser(u, false);
    }
    this.users.clear();
    this.follow.stop();
    this.renderPresence();
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
    this.ink.cleanupUser(u);
    this.selection.cleanupUser(u);
    this.cursors.removeUser(u, true);
    this.users.delete(id);
  }

  private moveCursor(m: IncomingCursor): void {
    const u = this.users.get(m.id); if (!u) return;
    applyIncoming(u, m);
    if (this.cfg.showFollow && this.follow.isFollowing(m.id)) this.follow.tick();
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
    this.cursors.setIdle(u, false);
    if (u.touchFadeTimer != null) { clearTimeout(u.touchFadeTimer); u.touchFadeTimer = null; }

    const p = resolve(this.container(), u);
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
        const cur = containerToViewport(this.container(), u.xRatio, u.yOffset);
        const sy = window.scrollY || 0;
        window.scrollTo({ top: sy + (cur.y - window.innerHeight / 2), behavior: 'smooth' });
      });
    }
  }

  /* ── idle/active sweep (cheap timer) ──────────────────────────────────── */

  private sweepIdle(): void {
    const now = Date.now();
    let anyStateChanged = false;
    for (const u of this.users.values()) {
      const idle = this.cfg.idleFade && (now - u.lastSeenTs > IDLE_MS);
      this.cursors.setIdle(u, idle);
      const nowActive = this.cfg.activeHalo && (now - u.lastSeenTs < ACTIVE_MS);
      // presence bar re-renders when active-set changes
      if ((u as unknown as { _wasActive?: boolean })._wasActive !== nowActive) {
        (u as unknown as { _wasActive?: boolean })._wasActive = nowActive;
        anyStateChanged = true;
      }
    }
    if (anyStateChanged) this.renderPresence();
  }

  private activeIds(): Set<string> {
    const now = Date.now();
    const out = new Set<string>();
    for (const u of this.users.values()) {
      if (now - u.lastSeenTs < ACTIVE_MS) out.add(u.id);
    }
    return out;
  }

  private renderPresence(): void {
    this.presence.render(this.users, this.oauthReady, this.activeIds(), this.follow.getTargetId());
  }

  /* ── http config / stats ──────────────────────────────────────────────── */

  private fetchConfig(): void {
    fetch(this.cfg.server + '/api/config')
      .then((r) => r.json() as Promise<{ clientId?: string }>)
      .then((cfg) => {
        if (cfg && cfg.clientId) {
          this.oauthReady = true;
          this.renderPresence();
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
