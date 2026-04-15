/**
 * Shared SVG overlay pinned to the viewport for ink strokes and text-selection
 * rectangles. Points/rects are stored in container-relative coordinates and
 * re-mapped to viewport on every `relayout()` (called from the scroll rAF).
 */
import type { RemoteUser } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class OverlaySvg {
  readonly el: SVGSVGElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this.el.setAttribute('class', 'lc-overlay-svg');
    parent.appendChild(this.el);
  }

  destroy(): void { this.el.remove(); }

  /** Re-map all ink strokes and selection rects for every user to viewport. */
  relayout(users: Iterable<RemoteUser>, container: Element): void {
    const r = container.getBoundingClientRect();
    for (const u of users) {
      for (const s of u.inkStrokes) {
        const pts = s.pts.map(([xr, yo]) => `${r.left + xr * r.width},${r.top + yo}`).join(' ');
        s.el.setAttribute('points', pts);
      }
      if (u.selectionEl && u.selectionRects.length > 0) {
        this.positionSelection(u, r);
      }
    }
  }

  positionSelection(u: RemoteUser, r: DOMRect): void {
    if (!u.selectionEl) return;
    const rects = u.selectionRects;
    const group = u.selectionEl;
    while (group.childNodes.length < rects.length) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'lc-selection-rect');
      rect.setAttribute('fill', u.color);
      rect.setAttribute('stroke', u.color);
      rect.setAttribute('rx', '2');
      group.appendChild(rect);
    }
    while (group.childNodes.length > rects.length) {
      group.removeChild(group.lastChild!);
    }
    rects.forEach((sr, i) => {
      const rect = group.childNodes[i] as SVGRectElement;
      rect.setAttribute('x', String(r.left + sr.xRatio * r.width));
      rect.setAttribute('y', String(r.top + sr.yOffset));
      rect.setAttribute('width', String(sr.wRatio * r.width));
      rect.setAttribute('height', String(sr.height));
    });
  }
}

export function createPolyline(color: string): SVGPolylineElement {
  const p = document.createElementNS(SVG_NS, 'polyline') as SVGPolylineElement;
  p.setAttribute('class', 'lc-ink-path');
  p.setAttribute('stroke', color);
  p.setAttribute('points', '');
  return p;
}

export function createSelectionGroup(): SVGGElement {
  return document.createElementNS(SVG_NS, 'g') as SVGGElement;
}
