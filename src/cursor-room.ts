import { DurableObject } from 'cloudflare:workers';
import { ensureStatsTable, recordVisits, getStats, pushTelemetry } from './stats';
import { ensurePathsTable, flushPaths, purgeStalePaths, X_BUCKETS, Y_BUCKET_PX, type BufferedSample } from './paths';
import type { Env } from './types';

interface UserInfo {
  id: string;
  username: string;
  avatar: string;
  url: string;
  color: string;
  xRatio: number;
  yOffset: number;
  inputType: string;
  containerHeight: number;
  snapTarget: string | null;
  lastPong: number;
  // rate-limiting bookkeeping
  msgCount: number;
  windowStart: number;
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
];
const ANIMALS = ['Fox', 'Owl', 'Cat', 'Bear', 'Wolf', 'Deer', 'Hawk', 'Lynx', 'Seal', 'Wren'];
const ADJS = ['Swift', 'Quiet', 'Bold', 'Warm', 'Calm', 'Keen', 'Wise', 'Free', 'Soft', 'Wild'];

const PING_INTERVAL = 20_000;  // send ping every 20s
const DEAD_THRESHOLD = 45_000; // close if no pong for 45s
const BROADCAST_INTERVAL = 50; // flush batched cursor updates every 50ms (~20fps)

const PING_MSG = JSON.stringify({ type: 'ping' });
const STATS_FLUSH_MS = 5_000; // batch D1 writes every 5 seconds

// ── rate limiting ─────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW = 1_000; // 1-second sliding window
const RATE_LIMIT_MAX = 30;       // max messages per window (50ms client ≈ 20/s, leave headroom)

// ── connection & message limits ───────────────────────────────────────────
const MAX_CONNECTIONS_PER_ROOM = 200;
const MAX_MESSAGE_SIZE = 1024;   // bytes – cursor payloads are ~150 B, leave headroom for deep snap paths
const MAX_CHAT_LENGTH = 128;     // max characters per chat message
const CHAT_HISTORY_SIZE = 20;    // ring buffer capacity for recent chat messages

// ── palimpsest sampling ───────────────────────────────────────────────────
const PATH_SAMPLE_MS = 60_000;     // one sample per active user every 60s
const PATH_FLUSH_MS = 5 * 60_000;  // flush aggregated buckets every 5 min
const PATH_MAX_BUFFERED = 2000;    // hard cap on the in-memory buffer

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── snap target validation ──────────────────────────────────────────────────
const SNAP_PATH_RE = /^[0-9]+(\.[0-9]+)*$/;
function sanitizeSnapTarget(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 256) return null;
  return SNAP_PATH_RE.test(raw) ? raw : null;
}

function doLog(level: 'INFO' | 'WARN', event: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, event, ts: new Date().toISOString(), ...data }));
}

interface ChatEntry {
  id: string;        // sender user id
  username: string;
  avatar: string;
  color: string;
  text: string;
  ts: number;        // Date.now() timestamp
}

interface CursorUpdate {
  id: string;
  username: string;
  avatar: string;
  url: string;
  color: string;
  xRatio: number;
  yOffset: number;
  inputType: string;
  containerHeight: number;
  snapTarget: string | null;
}

export class CursorRoom extends DurableObject<Env> {
  sessions: Map<WebSocket, UserInfo>;
  private statsReady = false;
  private roomName = '/';
  private pendingUpdates: Map<string, CursorUpdate> = new Map();
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  // ── chat history ring buffer ───────────────────────────────────────────
  private chatHistory: ChatEntry[] = [];
  // ── multi-tab dedup: track session count per logical user id ────────────
  private sessionsPerUser: Map<string, number> = new Map();
  // ── palimpsest sampling buffer ──────────────────────────────────────────
  private pathsReady = false;
  private pathsBuffer: Map<string, BufferedSample> = new Map();
  private pathSampleTimer: ReturnType<typeof setInterval> | null = null;
  private pathFlushTimer: ReturnType<typeof setInterval> | null = null;
  // ── D1 write batching ─────────────────────────────────────────────────
  private visitBuffer = 0;
  private statsFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private statsDirty = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sessions = new Map();
    setInterval(() => this.heartbeat(), PING_INTERVAL);
    this.pathSampleTimer = setInterval(() => this.samplePaths(), PATH_SAMPLE_MS);
    this.pathFlushTimer = setInterval(() => this.flushPathsNow().catch(() => {}), PATH_FLUSH_MS);
  }

  /* ── palimpsest sampling ───────────────────────────────────────────────── */

  private samplePaths() {
    if (this.sessions.size === 0 || this.pathsBuffer.size >= PATH_MAX_BUFFERED) return;
    const now = Date.now();
    // One bucket per distinct user id per tick (dedup multi-tab).
    const seen = new Set<string>();
    for (const u of this.sessions.values()) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      if (u.xRatio < 0 || u.yOffset < 0) continue;
      const xb = Math.max(0, Math.min(X_BUCKETS - 1, Math.floor(u.xRatio * X_BUCKETS)));
      const yb = Math.max(0, Math.floor(u.yOffset / Y_BUCKET_PX));
      const color = u.color || '#6366f1';
      const key = `${xb}:${yb}:${color}`;
      const existing = this.pathsBuffer.get(key);
      if (existing) { existing.hits += 1; existing.lastTs = now; }
      else this.pathsBuffer.set(key, { xb, yb, color, hits: 1, lastTs: now });
    }
  }

  private async flushPathsNow(): Promise<void> {
    if (this.pathsBuffer.size === 0) return;
    try {
      if (!this.pathsReady) {
        await ensurePathsTable(this.env.DB);
        this.pathsReady = true;
      }
      const batch = Array.from(this.pathsBuffer.values());
      this.pathsBuffer.clear();
      await flushPaths(this.env.DB, this.roomName, batch);
      // Cheap per-flush retention pass (rare, site-scoped).
      await purgeStalePaths(this.env.DB, this.roomName);
    } catch (err) {
      doLog('WARN', 'paths_flush_failed', { error: String(err) });
    }
  }

  // ── broadcast batching ────────────────────────────────────────────────────

  private ensureBroadcastLoop() {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setInterval(() => this.flushUpdates(), BROADCAST_INTERVAL);
  }

  private stopBroadcastLoop() {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
  }

  private flushUpdates() {
    if (this.pendingUpdates.size === 0) {
      if (this.sessions.size === 0) this.stopBroadcastLoop();
      return;
    }

    const batch = Array.from(this.pendingUpdates.values());
    this.pendingUpdates.clear();

    const msg = JSON.stringify({ type: 'cursor_batch', cursors: batch });
    // Optimisation: when only one user moved in this tick (the common case),
    // skip sending the batch back to that user entirely (avoid echo).
    // For multi-user batches the client-side selfId filter handles it.
    const singleSenderId = batch.length === 1 ? batch[0].id : null;

    this.sessions.forEach((user, ws) => {
      if (singleSenderId && user.id === singleSenderId) return;
      try { ws.send(msg); } catch { /* dead socket */ }
    });
  }

  private heartbeat() {
    if (this.sessions.size === 0) return;
    const now = Date.now();
    this.sessions.forEach((user, ws) => {
      if (now - user.lastPong > DEAD_THRESHOLD) {
        doLog('WARN', 'do_dead_connection', { username: user.username, id: user.id, silentMs: now - user.lastPong });
        this.handleClose(ws);
        try { ws.close(1001, 'Heartbeat timeout'); } catch { /* already closed */ }
      } else {
        try { ws.send(PING_MSG); } catch { /* dead socket */ }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal stats endpoint (non-WebSocket)
    if (url.pathname.endsWith('/do/stats')) {
      return new Response(JSON.stringify({ current_online: this.sessionsPerUser.size }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    this.roomName = url.searchParams.get('room') || '/';

    // ── connection limit ──────────────────────────────────────────────────
    if (this.sessions.size >= MAX_CONNECTIONS_PER_ROOM) {
      doLog('WARN', 'do_room_full', { room: this.roomName, limit: MAX_CONNECTIONS_PER_ROOM });
      // Accept the WebSocket so the client receives a typed error + close code
      const pair = new WebSocketPair();
      const [client, srv] = Object.values(pair);
      srv.accept();
      srv.send(JSON.stringify({ type: 'error', code: 'room_full' }));
      srv.close(4503, 'Room full');
      return new Response(null, { status: 101, webSocket: client });
    }

    const userInfoHeader = request.headers.get('X-User-Info');
    let user: UserInfo;

    const now = Date.now();
    if (userInfoHeader) {
      const parsed = JSON.parse(userInfoHeader);
      user = { ...parsed, xRatio: -1, yOffset: -1, inputType: 'mouse', containerHeight: 0, snapTarget: null, lastPong: now, msgCount: 0, windowStart: now };
    } else {
      user = {
        id: crypto.randomUUID(),
        username: `${pick(ADJS)} ${pick(ANIMALS)}`,
        avatar: '',
        url: '',
        color: pick(COLORS),
        xRatio: -1,
        yOffset: -1,
        inputType: 'mouse',
        containerHeight: 0,
        snapTarget: null,
        lastPong: now,
        msgCount: 0,
        windowStart: now,
      };
    }

    // Snapshot current users before adding the new one
    const currentUsers = this.getCurrentUsers();

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();
    this.sessions.set(server, user);
    this.ensureBroadcastLoop();

    // ── multi-tab dedup ────────────────────────────────────────────────────
    // Only broadcast a `join` (and count toward persisted visits) the FIRST
    // time a given user id appears. Secondary tabs are silently attached.
    const existingCount = this.sessionsPerUser.get(user.id) ?? 0;
    this.sessionsPerUser.set(user.id, existingCount + 1);
    const isPrimary = existingCount === 0;

    doLog('INFO', 'do_join', { username: user.username, id: user.id, room: this.ctx.id.toString(), total: this.sessions.size, primary: isPrimary });

    // Tell the new client about existing users + recent chat history
    server.send(JSON.stringify({ type: 'init', self: user.id, users: currentUsers, chatHistory: this.chatHistory }));

    if (isPrimary) {
      // Schedule batched D1 write + stats broadcast
      this.scheduleStatsFlush('join');

      // Tell everyone else about the new user
      this.broadcast(
        JSON.stringify({
          type: 'join',
          user: { id: user.id, username: user.username, avatar: user.avatar, url: user.url, color: user.color },
        }),
        server,
      );
    }

    server.addEventListener('message', (event) => {
      this.handleMessage(server, event.data as string);
    });

    server.addEventListener('close', () => {
      this.handleClose(server);
    });

    server.addEventListener('error', () => {
      this.handleClose(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleMessage(ws: WebSocket, raw: string) {
    // ── message size guard ─────────────────────────────────────────────────
    if (raw.length > MAX_MESSAGE_SIZE) return;

    const user = this.sessions.get(ws);
    if (!user) return;

    // ── per-connection rate limiting (fixed-window counter) ────────────────
    const now = Date.now();
    if (now - user.windowStart > RATE_LIMIT_WINDOW) {
      user.msgCount = 0;
      user.windowStart = now;
    }
    user.msgCount++;
    if (user.msgCount > RATE_LIMIT_MAX) {
      if (user.msgCount === RATE_LIMIT_MAX + 1) {
        try { ws.send(JSON.stringify({ type: 'rate_limited' })); } catch { /* */ }
        doLog('WARN', 'do_rate_limited', { id: user.id, username: user.username });
      }
      return; // silently drop excess messages
    }

    try {
      const data = JSON.parse(raw);
      if (data.type === 'pong') {
        user.lastPong = now;
        return;
      }
      if (data.type === 'typing') {
        this.broadcast(
          JSON.stringify({ type: 'typing', id: user.id, typing: !!data.typing }),
          ws,
        );
        return;
      }
      if (data.type === 'selection') {
        const rects = Array.isArray(data.rects) ? data.rects.slice(0, 40) : [];
        // Validate each rect's shape (cheap).
        const clean = rects.filter((r: unknown): r is { xRatio: number; wRatio: number; yOffset: number; height: number } =>
          !!r && typeof r === 'object'
          && typeof (r as { xRatio?: unknown }).xRatio === 'number'
          && typeof (r as { wRatio?: unknown }).wRatio === 'number'
          && typeof (r as { yOffset?: unknown }).yOffset === 'number'
          && typeof (r as { height?: unknown }).height === 'number',
        );
        this.broadcast(JSON.stringify({ type: 'selection', id: user.id, rects: clean }), ws);
        return;
      }
      if (data.type === 'ink') {
        const pts = Array.isArray(data.pts) ? data.pts : [];
        const clean: Array<[number, number]> = [];
        for (const p of pts) {
          if (Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number') {
            clean.push([p[0], p[1]]);
            if (clean.length >= 60) break; // per-message cap, complements client batching
          }
        }
        this.broadcast(
          JSON.stringify({ type: 'ink', id: user.id, pts: clean, final: !!data.final }),
          ws,
        );
        return;
      }
      if (data.type === 'reaction') {
        const emoji = typeof data.emoji === 'string' ? data.emoji.slice(0, 8) : '';
        if (!emoji) return;
        const xr = typeof data.xRatio === 'number' ? data.xRatio : 0;
        const yo = typeof data.yOffset === 'number' ? data.yOffset : 0;
        this.broadcast(
          JSON.stringify({ type: 'reaction', id: user.id, emoji, xRatio: xr, yOffset: yo }),
          ws,
        );
        return;
      }
      if (data.type === 'chat') {
        const text = typeof data.text === 'string' ? data.text.slice(0, MAX_CHAT_LENGTH).trim() : '';
        if (!text) return;
        // Push into ring buffer
        this.chatHistory.push({
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          color: user.color,
          text,
          ts: now,
        });
        if (this.chatHistory.length > CHAT_HISTORY_SIZE) {
          this.chatHistory.shift();
        }
        this.broadcast(
          JSON.stringify({
            type: 'chat',
            id: user.id,
            text,
          }),
          ws,
        );
        return;
      }
      if (data.type === 'cursor') {
        user.xRatio = data.xRatio ?? 0;
        user.yOffset = data.yOffset ?? 0;
        user.inputType = data.inputType || 'mouse';
        user.containerHeight = data.containerHeight || 0;
        user.snapTarget = sanitizeSnapTarget(data.snapTarget);
        // Queue into pending batch instead of immediate broadcast
        // Include identity fields so clients can lazy-init users whose
        // join message was missed (e.g. reconnect race).
        this.pendingUpdates.set(user.id, {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          url: user.url,
          color: user.color,
          xRatio: user.xRatio,
          yOffset: user.yOffset,
          inputType: user.inputType,
          containerHeight: user.containerHeight,
          snapTarget: user.snapTarget,
        });
      }
    } catch {
      // ignore malformed messages
    }
  }

  private handleClose(ws: WebSocket) {
    const user = this.sessions.get(ws);
    if (user) {
      this.sessions.delete(ws);
      const remaining = (this.sessionsPerUser.get(user.id) ?? 1) - 1;
      const lastSession = remaining <= 0;
      if (lastSession) this.sessionsPerUser.delete(user.id);
      else this.sessionsPerUser.set(user.id, remaining);

      doLog('INFO', 'do_leave', { username: user.username, id: user.id, remaining: this.sessions.size, last: lastSession });

      if (lastSession) {
        this.broadcast(JSON.stringify({ type: 'leave', id: user.id }));
        this.scheduleStatsFlush('leave');
      }
    }
    try {
      ws.close(1000, 'Connection closed');
    } catch {
      // already closed
    }
  }

  private getCurrentUsers() {
    // Dedupe by user id so a user with multiple tabs appears once.
    const seen = new Set<string>();
    const out: Array<ReturnType<CursorRoom['snapshotUser']>> = [];
    for (const u of this.sessions.values()) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      out.push(this.snapshotUser(u));
    }
    return out;
  }

  private snapshotUser(u: UserInfo) {
    return {
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      url: u.url,
      color: u.color,
      xRatio: u.xRatio,
      yOffset: u.yOffset,
      inputType: u.inputType,
      containerHeight: u.containerHeight,
      snapTarget: u.snapTarget,
    };
  }

  // ── batched stats writes ───────────────────────────────────────────────
  // Instead of hitting D1 on every join/leave, we buffer visit increments
  // and flush once every STATS_FLUSH_MS. This dramatically reduces D1
  // write pressure under high-concurrency join storms.

  private scheduleStatsFlush(event: 'join' | 'leave') {
    if (event === 'join') this.visitBuffer++;
    this.statsDirty = true;
    if (!this.statsFlushTimer) {
      this.statsFlushTimer = setTimeout(() => {
        this.statsFlushTimer = null;
        this.flushStats().catch(() => {});
      }, STATS_FLUSH_MS);
    }
  }

  private async flushStats() {
    if (!this.statsDirty) return;
    this.statsDirty = false;
    try {
      if (!this.statsReady) {
        await ensureStatsTable(this.env.DB);
        this.statsReady = true;
      }
      if (this.visitBuffer > 0) {
        await recordVisits(this.env.DB, this.roomName, this.visitBuffer, this.sessionsPerUser.size);
        this.visitBuffer = 0;
      }

      // Fetch persisted stats for broadcast + telemetry
      const persisted = await getStats(this.env.DB, this.roomName);
      const statsPayload = {
        site: this.roomName,
        total_visits: persisted?.total_visits ?? 0,
        current_online: this.sessionsPerUser.size,
        peak_online: persisted?.peak_online ?? 0,
        updated_at: new Date().toISOString(),
      };

      // Broadcast stats to all connected clients via WebSocket
      this.broadcast(JSON.stringify({ type: 'stats', ...statsPayload }));

      // Push telemetry to external endpoint if configured
      if (this.env.TELEMETRY_ENDPOINT) {
        await pushTelemetry(this.env.TELEMETRY_ENDPOINT, statsPayload);
      }
    } catch (err) {
      doLog('WARN', 'stats_flush_error', { error: String(err) });
    }
  }

  private broadcast(message: string, exclude?: WebSocket) {
    this.sessions.forEach((_, ws) => {
      if (ws !== exclude) {
        try {
          ws.send(message);
        } catch {
          // dead socket — will be cleaned up on close event
        }
      }
    });
  }
}
