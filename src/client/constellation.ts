/**
 * Constellation view — hold `.` to zoom out into a night-sky map of every
 * cursor in the room. Each user is a glowing star; the polyline tail behind
 * them is their movement trail over the last 60 seconds. Release to return.
 *
 * The view is purely local — other users see no change in your cursor.
 *
 * We sample positions on a 4 Hz tick (independent of WS rate) into a per-user
 * ring of points, capped at MAX_POINTS_PER_USER. Old points fall off when they
 * exceed TRAIL_DURATION_MS so trails fade evenly regardless of who's moving.
 */
import type { RemoteUser } from './types';

const TRAIL_DURATION_MS = 60_000;
const SAMPLE_INTERVAL_MS = 250;        // 4 Hz
const MAX_POINTS_PER_USER = 240;       // 60s × 4Hz

interface TrailPoint { x: number; y: number; ts: number }
interface Trail {
  username: string;
  color: string;
  points: TrailPoint[];
  containerHeight: number;
}

interface SelfSnapshot { xRatio: number; yOffset: number; containerHeight: number; color: string; username: string }

export class Constellation {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private active = false;
  private rafId: number | null = null;
  private sampleTimer: number | null = null;
  private trails = new Map<string, Trail>();
  private dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  constructor(
    parent: HTMLElement,
    private users: Map<string, RemoteUser>,
    private getSelf: () => SelfSnapshot | null,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lc-constellation';
    parent.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
    this.resize();
    this.sampleTimer = window.setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);
  }

  destroy(): void {
    this.exit();
    if (this.sampleTimer != null) clearInterval(this.sampleTimer);
    this.canvas.remove();
  }

  resize(): void {
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    if (this.active) this.paint();
  }

  isActive(): boolean { return this.active; }

  enter(): void {
    if (this.active) return;
    this.active = true;
    this.canvas.classList.add('lc-active');
    // Force one immediate paint so the first frame isn't blank during the fade-in.
    this.paint();
    this.tick();
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.canvas.classList.remove('lc-active');
    if (this.rafId != null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  /* ── sampling (always running so the trail is "warm" by enter time) ──── */

  private sample(): void {
    const now = Date.now();
    const self = this.getSelf();
    if (self && self.xRatio >= 0) {
      this.append('self', self.xRatio, self.yOffset, self.containerHeight, self.color, 'You', now);
    }
    for (const u of this.users.values()) {
      if (u.xRatio < 0) continue;
      this.append(u.id, u.xRatio, u.yOffset, u.containerHeight, u.color, u.username, now);
    }
    // Drop expired points, drop trails for users who left.
    const cutoff = now - TRAIL_DURATION_MS;
    for (const [id, t] of this.trails) {
      while (t.points.length && t.points[0].ts < cutoff) t.points.shift();
      if (id !== 'self' && !this.users.has(id) && t.points.length === 0) this.trails.delete(id);
    }
  }

  private append(id: string, xRatio: number, yOffset: number, containerHeight: number, color: string, username: string, ts: number): void {
    let t = this.trails.get(id);
    if (!t) {
      t = { username, color, points: [], containerHeight: containerHeight || 1 };
      this.trails.set(id, t);
    } else {
      t.color = color;
      t.username = username;
      if (containerHeight > 0) t.containerHeight = containerHeight;
    }
    const last = t.points[t.points.length - 1];
    if (last && last.x === xRatio && last.y === yOffset) {
      // Same spot — just bump ts so trail keeps the dot "alive".
      last.ts = ts;
      return;
    }
    t.points.push({ x: xRatio, y: yOffset, ts });
    if (t.points.length > MAX_POINTS_PER_USER) t.points.splice(0, t.points.length - MAX_POINTS_PER_USER);
  }

  /* ── render loop ───────────────────────────────────────────────────────── */

  private tick = (): void => {
    if (!this.active) return;
    this.paint();
    this.rafId = requestAnimationFrame(this.tick);
  };

  private paint(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Deep-space backdrop
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, 'rgba(20,22,40,.94)');
    bg.addColorStop(1, 'rgba(4,4,12,.97)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (this.trails.size === 0) {
      this.drawHint(ctx, w, h, 'Hold "." — no one is moving yet');
      return;
    }

    // Use the largest containerHeight any user has reported, so the y axis
    // maps consistently across people on different scroll positions.
    let maxH = 0;
    for (const t of this.trails.values()) maxH = Math.max(maxH, t.containerHeight);
    if (maxH <= 0) maxH = 1;

    const padX = 0.06 * w;
    const padTop = 0.08 * h;
    const padBot = 0.12 * h;
    const drawW = w - padX * 2;
    const drawH = h - padTop - padBot;

    const now = Date.now();

    // Trails (under stars)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5 * this.dpr;
    for (const t of this.trails.values()) {
      const pts = t.points;
      if (pts.length < 2) continue;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const alpha = Math.max(0.04, 1 - (now - b.ts) / TRAIL_DURATION_MS) * 0.55;
        ctx.strokeStyle = withAlpha(t.color, alpha);
        ctx.beginPath();
        ctx.moveTo(padX + a.x * drawW, padTop + (a.y / maxH) * drawH);
        ctx.lineTo(padX + b.x * drawW, padTop + (b.y / maxH) * drawH);
        ctx.stroke();
      }
    }

    // Stars (newest point) + label
    ctx.textAlign = 'center';
    ctx.font = `${11 * this.dpr}px system-ui, sans-serif`;
    for (const t of this.trails.values()) {
      const last = t.points[t.points.length - 1];
      if (!last) continue;
      const cx = padX + last.x * drawW;
      const cy = padTop + (last.y / maxH) * drawH;

      // Outer glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22 * this.dpr);
      glow.addColorStop(0, withAlpha(t.color, 0.85));
      glow.addColorStop(0.5, withAlpha(t.color, 0.25));
      glow.addColorStop(1, withAlpha(t.color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 22 * this.dpr, cy - 22 * this.dpr, 44 * this.dpr, 44 * this.dpr);

      // Bright core
      ctx.beginPath();
      ctx.arc(cx, cy, 2.6 * this.dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      // Label
      ctx.fillStyle = withAlpha(t.color, 0.92);
      ctx.fillText(t.username, cx, cy + 20 * this.dpr);
    }

    // Footer hint
    this.drawHint(ctx, w, h, `${this.trails.size} ${this.trails.size === 1 ? 'star' : 'stars'} · release "." to return`);
  }

  private drawHint(ctx: CanvasRenderingContext2D, w: number, h: number, text: string): void {
    ctx.textAlign = 'center';
    ctx.font = `${11 * this.dpr}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillText(text, w / 2, h - 18 * this.dpr);
  }
}

function withAlpha(hex: string, a: number): string {
  if (!hex || hex[0] !== '#') return `rgba(99,102,241,${a})`;
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  return `rgba(${r},${g},${b},${a})`;
}
