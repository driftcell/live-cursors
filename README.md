See who's here — real-time collaborative cursors for any website.

[![Live Demo](https://img.shields.io/badge/demo-live--cursors.driftcell.dev-6366f1?style=flat-square)](https://live-cursors.driftcell.dev/) [![Cloudflare Workers](https://img.shields.io/badge/powered%20by-Cloudflare%20Workers-f38020?style=flat-square&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)

Move your cursor around — everyone sees each other in real-time. Scroll-aware, touch-friendly, works on any screen size. Built on **Cloudflare Workers** and **Durable Objects**, running entirely on the free tier.

## Features

- ⚡ **Real-time Sync** — Cursor positions broadcast instantly via Durable Objects with WebSocket connections.
- 🎯 **Scroll & Screen Aware** — Document-absolute coordinates ensure cursors point at the same content regardless of viewport size or scroll position. X-axis uses container-relative percentages for responsive layouts; Y-axis uses absolute pixel offsets so cursors always land on the right paragraph.
- 📱 **Touch Friendly** — Touch devices get a distinct soft-circle cursor that fades naturally when the finger lifts.
- 🔭 **Edge Indicators** — When a remote cursor is outside your viewport, a clickable badge appears at the screen edge showing who's above or below. Click to scroll to them.
- 💬 **Cursor Chat** — Press `/` to type a message that appears as a bubble on your cursor, visible to everyone in real-time. Bubbles auto-fade after 4 seconds.
- 🔐 **GitHub OAuth** — Optional sign-in shows your avatar on cursors and the presence bar.
- 🌐 **Zero Cost** — Built entirely on Cloudflare's free tier. No servers to maintain.
- 📦 **Embed SDK** — One line of code adds live cursors to any page with rich configuration.
- 🎨 **Text Selection Broadcast** — Select text and others see your highlighted ranges in real-time, with color-coded overlays per user.
- ✏️ **Alt+Drag Doodle** — Hold Alt and drag to draw ephemeral ink strokes visible to everyone. Strokes fade out after 1.5 seconds.
- 👁️ **Follow Mode** — Click a presence avatar to auto-scroll and keep that user's cursor centered. Press Escape or manually scroll to exit.
- 🎯 **Emoji Reactions** — Press keys 1–6 to throw floating emoji (❤️ 👀 🎉 🔥 👍 🫠) at your cursor position, visible to all. 300ms cooldown.
- 👻 **Privacy Fade** — After 30 seconds of inactivity, remote cursors dim to 35% opacity automatically.
- ✨ **Active Halo** — Users who moved within the last 1.5 seconds get a glowing pulse ring on their presence avatar.
- 🔀 **Multi-Tab Dedup** — The server tracks sessions per user ID with reference counting; only the first and last tab trigger join/leave broadcasts.

## Demo

👉 [**live-cursors.driftcell.dev**](http://live-cursors.driftcell.dev)

## Embed in Your Site

Add a single script tag to any page:

```html
<script src="https://live-cursors.driftcell.dev/embed.js" data-presence="#your-element"></script>
```

### Configuration

All options are set via `data-*` attributes on the script tag:

| Attribute | Default | Description |
| --- | --- | --- |
| `src` | *(required)* | The embed script URL |
| `data-room` | Current page path | Room identifier — users in the same room see each other |
| `data-presence` | *(floating corner)* | CSS selector to mount the presence bar into your own element |
| `data-container` | `document.documentElement` | CSS selector for the content container used as the coordinate anchor. Use this when your page has a centered `max-width` layout (e.g. `data-container=".content-wrapper"`) so cursors align to content, not viewport edges. |
| `data-show-cursors` | `"true"` | Set to `"false"` to hide remote cursors (presence bar still works) |
| `data-show-presence` | `"true"` | Set to `"false"` to hide the presence bar |
| `data-show-login` | `"true"` | Set to `"false"` to hide the GitHub sign-in button |
| `data-show-chat` | `"true"` | Set to `"false"` to disable cursor chat (press `/` to send messages as bubbles on your cursor) |
| `data-show-snap` | `"false"` | Set to `"true"` to enable element-snap mode — cursors highlight the hovered DOM element instead of showing a free-form pointer |
| `data-show-selection` | `"true"` | Set to `"false"` to disable broadcasting text selections |
| `data-show-ink` | `"true"` | Set to `"false"` to disable Alt+drag doodle strokes |
| `data-show-follow` | `"true"` | Set to `"false"` to disable follow mode (click avatar to follow) |
| `data-show-reactions` | `"true"` | Set to `"false"` to disable emoji reactions (keys 1–6) |
| `data-idle-fade` | `"true"` | Set to `"false"` to disable automatic cursor dimming after 30s idle |
| `data-active-halo` | `"true"` | Set to `"false"` to disable the pulsing halo on active users' presence avatars |
| `data-count-anonymous` | `"true"` | Set to `"false"` to exclude anonymous (non-OAuth) users from the online count and presence avatars |
| `data-telemetry` | `"true"` | Set to `"false"` to disable fetching and displaying site analytics (total visits, online count, peak online) |
| `data-throttle` | `"50"` | Cursor send throttle in milliseconds. Lower = smoother but more bandwidth |

### Example: Centered blog layout

```html
<script
  src="https://live-cursors.driftcell.dev/embed.js"
  data-container="article"
  data-presence="#header-presence"
  data-throttle="40"
></script>
```

## Web Component

Prefer a declarative HTML element? Use the `<live-cursors>` Web Component instead of (or alongside) the classic script tag:

```html
<script src="https://live-cursors.driftcell.dev/embed-wc.js"></script>

<live-cursors
  server="https://live-cursors.driftcell.dev"
  container="article"
  presence="#header-slot"
  throttle="40"
></live-cursors>
```

Both approaches can **coexist** on different pages — they share the same backend and are fully independent client instances.

### Web Component Attributes

| Attribute | Default | Description |
| --- | --- | --- |
| `server` | Current page origin | Server URL for the live-cursors backend |
| `room` | Current page path | Room identifier — users in the same room see each other |
| `container` | `document.documentElement` | CSS selector for the coordinate anchor container |
| `presence` | *(floating corner)* | CSS selector to mount the presence bar |
| `show-cursors` | *(present = true)* | Remove attribute or set `"false"` to hide cursors |
| `show-presence` | *(present = true)* | Remove attribute or set `"false"` to hide presence bar |
| `show-login` | *(present = true)* | Remove attribute or set `"false"` to hide GitHub sign-in |
| `show-chat` | *(present = true)* | Remove attribute or set `"false"` to disable cursor chat |
| `show-snap` | `"false"` | Set to `"true"` to enable element-snap mode |
| `show-selection` | *(present = true)* | Remove attribute or set `"false"` to disable text selection broadcast |
| `show-ink` | *(present = true)* | Remove attribute or set `"false"` to disable doodle strokes |
| `show-follow` | *(present = true)* | Remove attribute or set `"false"` to disable follow mode |
| `show-reactions` | *(present = true)* | Remove attribute or set `"false"` to disable emoji reactions |
| `idle-fade` | *(present = true)* | Remove attribute or set `"false"` to disable idle cursor dimming |
| `active-halo` | *(present = true)* | Remove attribute or set `"false"` to disable active user halo |
| `count-anonymous` | *(present = true)* | Remove attribute or set `"false"` to exclude anonymous users |
| `telemetry` | `"false"` | Set to `"true"` to enable site analytics |
| `throttle` | `"50"` | Cursor send throttle in milliseconds |

### Framework examples

**React:**
```jsx
function App() {
  return (
    <>
      <live-cursors server="https://live-cursors.driftcell.dev" container="main" />
      <main>Your content here</main>
    </>
  );
}
```

**Vue:**
```vue
<template>
  <live-cursors server="https://live-cursors.driftcell.dev" container="main" />
  <main>Your content here</main>
</template>
```

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

### Coordinate System

Coordinates are anchored to a **content container** (not the viewport) to work correctly across different screen sizes and scroll positions:

| Axis | Encoding | Why |
| --- | --- | --- |
| **X** | Container-relative percentage `[0, 1]` | Handles responsive/different widths — 50% of the content area is semantically the same spot |
| **Y** | Absolute pixel offset from container top | Content height is (nearly) identical across clients, so pixel offsets map to the same paragraph/element |

The receiver converts document-absolute positions back to local viewport coordinates, accounting for their own scroll position. Cursors outside the visible viewport are shown as **edge indicators** — clickable badges at the top/bottom of the screen.


## License


MIT

---

Made with ♥ on [Cloudflare Workers](https://developers.cloudflare.com/workers/)
