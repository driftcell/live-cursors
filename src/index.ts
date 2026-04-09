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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(getMainHTML(env.GITHUB_CLIENT_ID || ''), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (url.pathname === '/embed.js') {
      return new Response(getEmbedJS(url.origin), {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    if (url.pathname === '/auth/login') {
      if (!env.GITHUB_CLIENT_ID) {
        return new Response('GitHub OAuth not configured', { status: 503 });
      }
      const redirectUri = `${url.origin}/auth/callback`;
      const gh = `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
      return Response.redirect(gh, 302);
    }

    if (url.pathname === '/auth/callback') {
      return handleOAuthCallback(url, env);
    }

    // WebSocket → Durable Object
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
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
        }
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
      return new Response('OK');
    }

    return new Response('Not Found', { status: 404 });
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
      return new Response(`OAuth error: ${tokenData.error ?? 'unknown'}`, { status: 400 });
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'LiveCursors/1.0' },
    });
    const u = (await userRes.json()) as { id: number; login: string; avatar_url: string; html_url: string };

    const jwt = await signJWT(
      { sub: String(u.id), username: u.login, avatar: u.avatar_url, url: u.html_url },
      env.JWT_SECRET,
    );

    return new Response(null, {
      status: 302,
      headers: { Location: `${url.origin}/?token=${jwt}` },
    });
  } catch (err) {
    return new Response(`OAuth failed: ${err}`, { status: 500 });
  }
}
