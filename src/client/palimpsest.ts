/**
 * Palimpsest — "the page remembers you."
 *
 * Fetches aggregated cursor-trail buckets from `/api/paths`, then paints them
 * onto a viewport-fixed canvas behind everything else. Each bucket is a soft
 * color blob whose opacity is:
 *   - weighted by log(hits)  (popular spots are brighter)
 *   - decayed by age         (older samples fade into near-transparency)
 *
 * Samples are static per page-load; we don't re-fetch during the session.
 * Re-painting happens on scroll (via the engine's rAF hook) and on resize.
 */

interface ServerSample { xb: number; yb: number; color: string; hits: number; age_ms: number }
interface ServerResponse {
  x_buckets: number;
  y_bucket_px: number;
  retention_ms: number;
  samples: ServerSample[];
}

const BLOB_RADIUS = 18;   // px — soft gaussian radius at 1 hit
const MAX_OPACITY = 0.22; // hottest bucket opacity ceiling
const MIN_AGE_OPACITY = 0.05;

export class Palimpsest {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private samples: ServerSample[] = [];
  private xBuckets = 200;
  private yBucketPx = 20;
  private retentionMs = 30 * 24 * 60 * 60 * 1000;
  private loaded = false;
  private dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  constructor(parent: HTMLElement, private container: () => Element) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lc-palimpsest';
    parent.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
    this.resize();
  }

  destroy(): void { this.canvas.remove(); }

  load(server: string, site: string): void {
    fetch(`${server}/api/paths?site=${encodeURIComponent(site)}`)
      .then((r) => r.json() as Promise<ServerResponse>)
      .then((data) => {
        if (!data || !Array.isArray(data.samples)) return;
        this.xBuckets = data.x_buckets || 200;
        this.yBucketPx = data.y_bucket_px || 20;
        this.retentionMs = data.retention_ms || this.retentionMs;
        this.samples = data.samples;
        this.loaded = true;
        this.paint();
      })
      .catch(() => { /* palimpsest is cosmetic — silent failure */ });
  }

  /** Pair this with the engine's scroll rAF so it re-paints in the same frame. */
  paint(): void {
    if (!this.loaded) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const container = this.container();
    const r = container.getBoundingClientRect();
    if (r.width <= 0) return;

    const maxHits = this.samples.reduce((m, s) => s.hits > m ? s.hits : m, 1);
    const logMax = Math.log1p(maxHits);

    ctx.globalCompositeOperation = 'source-over';
    for (const s of this.samples) {
      const xRatio = (s.xb + 0.5) / this.xBuckets;
      const yOffset = s.yb * this.yBucketPx + this.yBucketPx / 2;
      const cx = (r.left + xRatio * r.width) * this.dpr;
      const cy = (r.top + yOffset) * this.dpr;
      // Cull off-viewport blobs (cheap).
      if (cx < -40 * this.dpr || cx > w + 40 * this.dpr) continue;
      if (cy < -40 * this.dpr || cy > h + 40 * this.dpr) continue;

      const hitsWeight = Math.log1p(s.hits) / logMax;           // 0..1
      const ageWeight = 1 - Math.min(1, s.age_ms / this.retentionMs); // 1=new, 0=old
      const alpha = Math.max(MIN_AGE_OPACITY, MAX_OPACITY * hitsWeight * ageWeight);
      const radius = (BLOB_RADIUS + 8 * hitsWeight) * this.dpr;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, withAlpha(s.color, alpha));
      grad.addColorStop(1, withAlpha(s.color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
  }

  resize(): void {
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.paint();
  }
}

/** Accepts `#rrggbb` (or `#rgb`) and returns `rgba(r,g,b,a)`. Falls back to accent. */
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
