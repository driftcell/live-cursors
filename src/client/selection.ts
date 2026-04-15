/**
 * Text-selection sharing. When the local user selects text, we snapshot the
 * selection rectangles in container-relative coords and broadcast them. Empty
 * rects clear the remote highlight.
 */
import type { RemoteUser, SelectionRect } from './types';
import { createSelectionGroup, OverlaySvg } from './overlay';

const MAX_RECTS = 40;
const DEBOUNCE_MS = 120;

export class SelectionLayer {
  private lastSent: SelectionRect[] | null = null;
  private sendTimer: number | null = null;

  constructor(
    private overlay: OverlaySvg,
    private container: () => Element,
    private send: (rects: SelectionRect[]) => void,
  ) {}

  /** Called on every `selectionchange`. Throttled to keep bandwidth low. */
  onLocalChange(): void {
    if (this.sendTimer != null) return;
    this.sendTimer = window.setTimeout(() => {
      this.sendTimer = null;
      const rects = this.computeLocal();
      if (this.same(rects, this.lastSent)) return;
      this.lastSent = rects;
      this.send(rects);
    }, DEBOUNCE_MS);
  }

  private computeLocal(): SelectionRect[] {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return [];
    const container = this.container();
    const anchor = sel.anchorNode;
    if (!anchor) return [];
    // Only share selections inside the configured container.
    const host = anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
    if (!host || !container.contains(host)) return [];

    const cRect = container.getBoundingClientRect();
    if (cRect.width <= 0) return [];

    const out: SelectionRect[] = [];
    for (let i = 0; i < sel.rangeCount && out.length < MAX_RECTS; i++) {
      const rects = sel.getRangeAt(i).getClientRects();
      for (let j = 0; j < rects.length && out.length < MAX_RECTS; j++) {
        const r = rects[j];
        if (r.width < 1 || r.height < 1) continue;
        out.push({
          xRatio: (r.left - cRect.left) / cRect.width,
          wRatio: r.width / cRect.width,
          yOffset: r.top - cRect.top,
          height: r.height,
        });
      }
    }
    return out;
  }

  private same(a: SelectionRect[], b: SelectionRect[] | null): boolean {
    if (!b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (Math.abs(x.xRatio - y.xRatio) > 0.001 ||
          Math.abs(x.wRatio - y.wRatio) > 0.001 ||
          Math.abs(x.yOffset - y.yOffset) > 0.5 ||
          Math.abs(x.height - y.height) > 0.5) return false;
    }
    return true;
  }

  /* ── remote ───────────────────────────────────────────────────────────── */

  applyRemote(u: RemoteUser, rects: SelectionRect[]): void {
    u.selectionRects = rects;
    if (rects.length === 0) {
      if (u.selectionEl) { u.selectionEl.remove(); u.selectionEl = null; }
      return;
    }
    if (!u.selectionEl) {
      u.selectionEl = createSelectionGroup() as unknown as HTMLElement;
      this.overlay.el.appendChild(u.selectionEl);
    }
    this.overlay.positionSelection(u, this.container().getBoundingClientRect());
  }

  cleanupUser(u: RemoteUser): void {
    if (u.selectionEl) { u.selectionEl.remove(); u.selectionEl = null; }
    u.selectionRects = [];
  }
}
