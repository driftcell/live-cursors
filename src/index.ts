import { CursorRoom } from './cursor-room';
import { signJWT, verifyJWT } from './auth';
import { getMainHTML } from './html';
import { getEmbedJS } from './embed';

export { CursorRoom };

export interface Env {
  CURSOR_ROOM: DurableObjectNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
}

function log(level: 'INFO' | 'WARN' | 'ERROR', event: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, event, ts: new Date().toISOString(), ...data }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cf = request.cf as Record<string, unknown> | undefined;
    const start = Date.now();

    const respond = (res: Response) => {
      log('INFO', 'request', {
        method: request.method,
        path: url.pathname,
        status: res.status,
        ms: Date.now() - start,
        country: cf?.country,
        colo: cf?.colo,
      });
      return res;
    };

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return respond(new Response(getMainHTML(env.GITHUB_CLIENT_ID || ''), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }));
    }

    if (url.pathname === '/embed.js') {
      return respond(new Response(getEmbedJS(url.origin), {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        },
      }));
    }

    if (url.pathname === '/auth/login') {
      if (!env.GITHUB_CLIENT_ID) {
        log('WARN', 'auth_login_no_client_id');
        return respond(new Response('GitHub OAuth not configured', { status: 503 }));
      }
      log('INFO', 'auth_login_redirect');
      const redirectUri = `${url.origin}/auth/callback`;
      const gh = `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
      return respond(Response.redirect(gh, 302));
    }

    if (url.pathname === '/auth/callback') {
      return respond(await handleOAuthCallback(url, env));
    }

    // WebSocket → Durable Object
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return respond(new Response('Expected WebSocket', { status: 426 }));
      }

      const room = url.searchParams.get('room') || '/';
      const token = url.searchParams.get('token');

      // Resolve authenticated user (if any)
      let userInfo: object | null = null;
      if (token && env.JWT_SECRET) {
        const payload = await verifyJWT(token, env.JWT_SECRET);
        if (payload) {
          userInfo = {
            id: payload.sub,
            username: payload.username,
            avatar: payload.avatar,
            url: payload.url,
            color: '',
          };
          log('INFO', 'ws_authed', { room, username: payload.username });
        } else {
          log('WARN', 'ws_invalid_token', { room });
        }
      } else {
        log('INFO', 'ws_anonymous', { room });
      }

      const id = env.CURSOR_ROOM.idFromName(room);
      const stub = env.CURSOR_ROOM.get(id);

      // Forward with user info header so DO doesn't need the JWT secret
      const headers = new Headers(request.headers);
      if (userInfo) {
        headers.set('X-User-Info', JSON.stringify(userInfo));
      }
      return stub.fetch(new Request(request.url, { method: request.method, headers }));
    }

    if (url.pathname === '/health') {
      return respond(new Response('OK'));
    }

    return respond(new Response('Not Found', { status: 404 }));
  },
};

// ── OAuth callback ──────────────────────────────────────────────────────────

async function handleOAuthCallback(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get('code');
  if (!code) return new Response('Missing code', { status: 400 });

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      log('WARN', 'auth_callback_no_token', { error: tokenData.error });
      return new Response(`OAuth error: ${tokenData.error ?? 'unknown'}`, { status: 400 });
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'LiveCursors/1.0' },
    });
    const u = (await userRes.json()) as { id: number; login: string; avatar_url: string; html_url: string };

    log('INFO', 'auth_callback_success', { username: u.login });

    const jwt = await signJWT(
      { sub: String(u.id), username: u.login, avatar: u.avatar_url, url: u.html_url },
      env.JWT_SECRET,
    );

    return new Response(null, {
      status: 302,
      headers: { Location: `${url.origin}/?token=${jwt}` },
    });
  } catch (err) {
    log('ERROR', 'auth_callback_error', { error: String(err) });
    return new Response(`OAuth failed: ${err}`, { status: 500 });
  }
}
