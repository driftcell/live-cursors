See who's here — real-time collaborative cursors for any website.

[![Live Demo](https://img.shields.io/badge/demo-live--cursors.driftcell.dev-6366f1?style=flat-square)](https://live-cursors.driftcell.dev/) [![Cloudflare Workers](https://img.shields.io/badge/powered%20by-Cloudflare%20Workers-f38020?style=flat-square&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)

Move your cursor around — everyone sees each other in real-time. Built on **Cloudflare Workers** and **Durable Objects**, running entirely on the free tier.

## Features

- ⚡ **Real-time Sync** — Cursor positions broadcast instantly via Durable Objects with WebSocket connections.
- 🎨 **Smooth Animation** — CSS-powered transitions at ~10fps for fluid motion without frame-by-frame jumps.
- 🔐 **GitHub OAuth** — Optional sign-in shows your avatar on cursors and the presence bar.
- 🌐 **Zero Cost** — Built entirely on Cloudflare's free tier. No servers to maintain.
- 📦 **Embed SDK** — One line of code adds live cursors to any page.

## Demo

👉 [**live-cursors.driftcell.dev**](http://live-cursors.driftcell.dev)

## Embed in Your Site

Add a single script tag to any page:

```html
<script src="https://live-cursors.driftcell.dev/embed.js" data-presence="#your-element"></script>
```

| Attribute | Required | Description |
| --- | --- | --- |
| `src` | ✅ | The embed script URL |
| `data-presence` | ❌ | CSS selector to mount the presence bar into your own element. Omit to use the default floating position. |

## Self-Hosting

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18

- A [Cloudflare](https://dash.cloudflare.com/) account
- (Optional) A [GitHub OAuth App](https://github.com/settings/developers) for sign-in

### Setup

```bash
# Clone the repo
git clone https://github.com/driftcell/live-cursors.git
cd live-cursors

# Install dependencies
npm install

# (Optional) Configure GitHub OAuth
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```


<aside>
💡

If you skip the OAuth secrets, the app still works — users just won't see the GitHub sign-in button.

</aside>

### Development

```bash
npx wrangler dev
```

### Deploy

```bash
npx wrangler deploy
```

## Architecture

```
┌──────────┐   WebSocket   ┌──────────────────┐
│  Browser  │ ◄───────────► │  Cloudflare Edge  │
│ (cursor)  │               │     Worker        │
└──────────┘               └────────┬─────────┘
                                     │
                                     ▼
                           ┌──────────────────┐
                           │  Durable Object   │
                           │  (per-room state)  │
                           └──────────────────┘
```

- **Worker** — Handles HTTP requests, serves the landing page, proxies WebSocket upgrades.
- **Durable Object** — One instance per room. Manages connected clients, broadcasts cursor positions, and tracks presence.
- **Embed SDK** — A lightweight script that connects to the room scoped by the host page's origin + pathname.


## License


MIT

---

Made with ♥ on [Cloudflare Workers](https://developers.cloudflare.com/workers/)
