import { DurableObject } from 'cloudflare:workers';

export interface Env {
  CURSOR_ROOM: DurableObjectNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
}

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
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
];
const ANIMALS = ['Fox', 'Owl', 'Cat', 'Bear', 'Wolf', 'Deer', 'Hawk', 'Lynx', 'Seal', 'Wren'];
const ADJS = ['Swift', 'Quiet', 'Bold', 'Warm', 'Calm', 'Keen', 'Wise', 'Free', 'Soft', 'Wild'];

const PING_INTERVAL = 20_000;  // send ping every 20s
const DEAD_THRESHOLD = 45_000; // close if no pong for 45s

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

export class CursorRoom extends DurableObject<Env> {
  sessions: Map<WebSocket, UserInfo>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sessions = new Map();
    setInterval(() => this.heartbeat(), PING_INTERVAL);
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
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch { /* dead socket */ }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const userInfoHeader = request.headers.get('X-User-Info');
    let user: UserInfo;

    if (userInfoHeader) {
      const parsed = JSON.parse(userInfoHeader);
      user = { ...parsed, xRatio: -1, yOffset: -1, inputType: 'mouse', containerHeight: 0, snapTarget: null, lastPong: Date.now() };
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
        lastPong: Date.now(),
      };
    }

    // Snapshot current users before adding the new one
    const currentUsers = this.getCurrentUsers();

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();
    this.sessions.set(server, user);

    doLog('INFO', 'do_join', { username: user.username, id: user.id, room: this.ctx.id.toString(), total: this.sessions.size });

    // Tell the new client about existing users
    server.send(JSON.stringify({ type: 'init', self: user.id, users: currentUsers }));

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
    try {
      const data = JSON.parse(raw);
      if (data.type === 'pong') {
        const user = this.sessions.get(ws);
        if (user) user.lastPong = Date.now();
        return;
      }
      if (data.type === 'cursor') {
        const user = this.sessions.get(ws);
        if (!user) return;
        user.xRatio = data.xRatio ?? 0;
        user.yOffset = data.yOffset ?? 0;
        user.inputType = data.inputType || 'mouse';
        user.containerHeight = data.containerHeight || 0;
        user.snapTarget = sanitizeSnapTarget(data.snapTarget);
        this.broadcast(JSON.stringify({
          type: 'cursor', id: user.id,
          xRatio: user.xRatio, yOffset: user.yOffset,
          inputType: user.inputType, containerHeight: user.containerHeight,
          snapTarget: user.snapTarget,
        }), ws);
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
