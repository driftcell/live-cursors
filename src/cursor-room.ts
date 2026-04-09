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
  x: number;
  y: number;
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
];
const ANIMALS = ['Fox', 'Owl', 'Cat', 'Bear', 'Wolf', 'Deer', 'Hawk', 'Lynx', 'Seal', 'Wren'];
const ADJS = ['Swift', 'Quiet', 'Bold', 'Warm', 'Calm', 'Keen', 'Wise', 'Free', 'Soft', 'Wild'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class CursorRoom extends DurableObject<Env> {
  sessions: Map<WebSocket, UserInfo>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sessions = new Map();
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
      user = { ...parsed, x: -1, y: -1 };
    } else {
      user = {
        id: crypto.randomUUID(),
        username: `${pick(ADJS)} ${pick(ANIMALS)}`,
        avatar: '',
        url: '',
        color: pick(COLORS),
        x: -1,
        y: -1,
      };
    }

    // Snapshot current users before adding the new one
    const currentUsers = this.getCurrentUsers();

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();
    this.sessions.set(server, user);

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
      if (data.type === 'cursor') {
        const user = this.sessions.get(ws);
        if (!user) return;
        user.x = data.x;
        user.y = data.y;
        this.broadcast(JSON.stringify({ type: 'cursor', id: user.id, x: data.x, y: data.y }), ws);
      }
    } catch {
      // ignore malformed messages
    }
  }

  private handleClose(ws: WebSocket) {
    const user = this.sessions.get(ws);
    if (user) {
      this.sessions.delete(ws);
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
      x: u.x,
      y: u.y,
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
