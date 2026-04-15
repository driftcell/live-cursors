import { CursorRoom } from './cursor-room';
import { signJWT, verifyJWT } from './auth';
import { ensureStatsTable, getStats } from './stats';
import type { Env } from './types';

export { CursorRoom };
export type { Env };

function log(level: 'INFO' | 'WARN' | 'ERROR', event: string, data?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, event, ts: new Date().toISOString(), ...data }));
}

let statsTableReady = false;

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

    if (url.pathname === '/api/config') {
      return respond(new Response(JSON.stringify({ clientId: env.GITHUB_CLIENT_ID || '' }), {
        headers: {
          'Content-Type': 'application/json',
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
      const redirect = url.searchParams.get('redirect') || '';
      const state = redirect ? btoa(JSON.stringify({ redirect })) : '';
      const gh = `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user${state ? '&state=' + encodeURIComponent(state) : ''}`;
      return respond(Response.redirect(gh, 302));
    }

    if (url.pathname === '/auth/callback') {
      return respond(await handleOAuthCallback(url, env));
    }

    // Stats API
    if (url.pathname === '/api/stats') {
      const site = url.searchParams.get('site') || '/';
      try {
        if (!statsTableReady) {
          await ensureStatsTable(env.DB);
          statsTableReady = true;
        }
        const persisted = await getStats(env.DB, site);

        // Get live current_online from the Durable Object
        const doId = env.CURSOR_ROOM.idFromName(site);
        const doStub = env.CURSOR_ROOM.get(doId);
        let currentOnline = 0;
        try {
          const doRes = await doStub.fetch(new Request(`${url.origin}/do/stats`));
          const doData = (await doRes.json()) as { current_online: number };
          currentOnline = doData.current_online ?? 0;
        } catch { /* DO may not be active yet */ }

        return respond(new Response(JSON.stringify({
          site,
          total_visits: persisted?.total_visits ?? 0,
          current_online: currentOnline,
          peak_online: persisted?.peak_online ?? 0,
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
          },
        }));
      } catch (err) {
        log('ERROR', 'stats_api_error', { error: String(err) });
        return respond(new Response(JSON.stringify({ error: 'Stats unavailable' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        }));
      }
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

    if (!env.JWT_SECRET) {
      log('ERROR', 'auth_callback_no_jwt_secret');
      return new Response('JWT signing not configured', { status: 503 });
    }

    const jwt = await signJWT(
      { sub: String(u.id), username: u.login, avatar: u.avatar_url, url: u.html_url },
      env.JWT_SECRET,
    );

    // If the login was initiated from an embedded page, redirect back there with the token
    let destination = `${url.origin}/?token=${jwt}`;
    const stateParam = url.searchParams.get('state') || '';
    if (stateParam) {
      try {
        const stateData = JSON.parse(atob(stateParam));
        if (stateData.redirect && /^https?:\/\//.test(stateData.redirect)) {
          const sep = stateData.redirect.includes('?') ? '&' : '?';
          destination = `${stateData.redirect}${sep}lc_token=${jwt}`;
        }
      } catch { /* ignore malformed state */ }
    }

    return new Response(null, {
      status: 302,
      headers: { Location: destination },
    });
  } catch (err) {
    log('ERROR', 'auth_callback_error', { error: String(err) });
    return new Response(`OAuth failed: ${err}`, { status: 500 });
  }
}
