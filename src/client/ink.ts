/**
 * Ink (Alt+drag ephemeral drawing). Strokes are broadcast as container-relative
 * point batches, finalized with `final:true`. After finalization they fade out
 * over ~600ms and are removed.
 */
import type { InkStroke, RemoteUser } from './types';
import { clientToContainer } from './util';
import { createPolyline, OverlaySvg } from './overlay';

const POINT_MIN_DIST = 4;   // px in viewport space before a new point is added
const BATCH_MS = 40;        // send batched points every ~25 fps
const MAX_POINTS = 200;     // per stroke
const FADE_DELAY_MS = 1500;
const FADE_DURATION_MS = 600;

export class InkLayer {
  private drawing = false;
  private localPoints: Array<[number, number]> = [];
  private localFlushQueue: Array<[number, number]> = [];
  private localStroke: InkStroke | null = null;
  private lastPushedClient: [number, number] | null = null;
  private lastSendTs = 0;

  constructor(
    private overlay: OverlaySvg,
    private selfColor: () => string,
    private container: () => Element,
    private send: (pts: Array<[number, number]>, final: boolean) => void,
    private addLocalStroke: (s: InkStroke) => void,
  ) {}

  /** Begin a new local stroke from a mousedown event. */
  begin(cx: number, cy: number): void {
    this.drawing = true;
    this.localPoints = [];
    this.localFlushQueue = [];
    this.lastPushedClient = null;
    this.lastSendTs = 0;

    const el = createPolyline(this.selfColor());
    this.overlay.el.appendChild(el);
    this.localStroke = {
      el, pts: [], finalized: false, removeTimer: null,
    };
    this.addLocalStroke(this.localStroke);
    this.addPoint(cx, cy);
  }

  move(cx: number, cy: number): void {
    if (!this.drawing || !this.localStroke) return;
    this.addPoint(cx, cy);
    const now = Date.now();
    if (now - this.lastSendTs >= BATCH_MS && this.localFlushQueue.length > 0) {
      this.send(this.localFlushQueue, false);
      this.localFlushQueue = [];
      this.lastSendTs = now;
    }
  }

  end(): void {
    if (!this.drawing || !this.localStroke) return;
    this.drawing = false;
    if (this.localFlushQueue.length > 0) {
      this.send(this.localFlushQueue, true);
      this.localFlushQueue = [];
    } else {
      this.send([], true);
    }
    this.scheduleFade(this.localStroke);
    this.localStroke = null;
  }

  private addPoint(cx: number, cy: number): void {
    if (this.lastPushedClient) {
      const dx = cx - this.lastPushedClient[0];
      const dy = cy - this.lastPushedClient[1];
      if (dx * dx + dy * dy < POINT_MIN_DIST * POINT_MIN_DIST) return;
    }
    this.lastPushedClient = [cx, cy];
    const pos = clientToContainer(this.container(), cx, cy);
    const pt: [number, number] = [pos.xRatio, pos.yOffset];
    if (!this.localStroke || this.localStroke.pts.length >= MAX_POINTS) return;
    this.localStroke.pts.push(pt);
    this.localFlushQueue.push(pt);
    this.repaintStroke(this.localStroke);
  }

  /** Repaint one stroke using current container geometry. */
  repaintStroke(s: InkStroke): void {
    const r = this.container().getBoundingClientRect();
    const pts = s.pts.map(([xr, yo]) => `${r.left + xr * r.width},${r.top + yo}`).join(' ');
    s.el.setAttribute('points', pts);
  }

  /* ── remote strokes ──────────────────────────────────────────────────── */

  applyRemote(u: RemoteUser, pts: Array<[number, number]>, final: boolean): void {
    // Find active (non-finalized) stroke; else start new.
    let active = u.inkStrokes.find((s) => !s.finalized);
    if (!active) {
      active = {
        el: createPolyline(u.color),
        pts: [],
        finalized: false,
        removeTimer: null,
      };
      this.overlay.el.appendChild(active.el);
      u.inkStrokes.push(active);
    }
    for (const p of pts) {
      if (active.pts.length >= MAX_POINTS) break;
      active.pts.push(p);
    }
    this.repaintStroke(active);
    if (final) {
      active.finalized = true;
      const stroke = active;
      this.scheduleFade(stroke, () => {
        const idx = u.inkStrokes.indexOf(stroke);
        if (idx !== -1) u.inkStrokes.splice(idx, 1);
      });
    }
  }

  private scheduleFade(s: InkStroke, onGone?: () => void): void {
    s.removeTimer = window.setTimeout(() => {
      s.el.classList.add('lc-fading');
      setTimeout(() => { s.el.remove(); onGone?.(); }, FADE_DURATION_MS);
    }, FADE_DELAY_MS);
  }

  cleanupUser(u: RemoteUser): void {
    for (const s of u.inkStrokes) {
      if (s.removeTimer != null) clearTimeout(s.removeTimer);
      s.el.remove();
    }
    u.inkStrokes.length = 0;
  }
}
