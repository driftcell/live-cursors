import { DurableObject } from 'cloudflare:workers';
import { ensureStatsTable, recordVisits, getStats, pushTelemetry } from './stats';
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
  // ── D1 write batching ─────────────────────────────────────────────────
  private visitBuffer = 0;
  private statsFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private statsDirty = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sessions = new Map();
    setInterval(() => this.heartbeat(), PING_INTERVAL);
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
      return new Response(JSON.stringify({ current_online: this.sessions.size }), {
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

    doLog('INFO', 'do_join', { username: user.username, id: user.id, room: this.ctx.id.toString(), total: this.sessions.size });

    // Tell the new client about existing users + recent chat history
    server.send(JSON.stringify({ type: 'init', self: user.id, users: currentUsers, chatHistory: this.chatHistory }));

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
      doLog('INFO', 'do_leave', { username: user.username, id: user.id, remaining: this.sessions.size });
      this.broadcast(JSON.stringify({ type: 'leave', id: user.id }));
      // Schedule batched D1 write + stats broadcast
      this.scheduleStatsFlush('leave');
    }
    try {
      ws.close(1000, 'Connection closed');
    } catch {
      // already closed
    }
  }

  private getCurrentUsers() {
    return Array.from(this.sessions.values()).map((u) => ({
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
    }));
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
        await recordVisits(this.env.DB, this.roomName, this.visitBuffer, this.sessions.size);
        this.visitBuffer = 0;
      }

      // Fetch persisted stats for broadcast + telemetry
      const persisted = await getStats(this.env.DB, this.roomName);
      const statsPayload = {
        site: this.roomName,
        total_visits: persisted?.total_visits ?? 0,
        current_online: this.sessions.size,
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
