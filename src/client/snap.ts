import type { RemoteUser } from './types';
import { isSafeImageUrl, resolveElementPath } from './util';

export class SnapHighlight {
  attach(u: RemoteUser, snapId: string): void {
    const target = resolveElementPath(snapId) as HTMLElement | null;
    if (!target) { this.detach(u); return; }
    if (u.snap && u.snap.target === target) return;
    this.detach(u);

    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';

    const line = document.createElement('div');
    line.className = 'lc-snap-line';
    line.style.background = u.color;
    target.appendChild(line);

    const badge = document.createElement('div');
    badge.className = 'lc-snap-badge';
    if (isSafeImageUrl(u.avatar)) {
      const av = document.createElement('img');
      av.className = 'lc-snap-avatar';
      av.src = u.avatar!;
      av.alt = '';
      badge.appendChild(av);
    } else {
      const dot = document.createElement('div');
      dot.className = 'lc-snap-dot';
      dot.style.background = u.color;
      dot.textContent = u.username.charAt(0);
      badge.appendChild(dot);
    }
    target.appendChild(badge);

    u.snap = { line, badge, target };
  }

  detach(u: RemoteUser): void {
    if (!u.snap) return;
    u.snap.line.remove();
    u.snap.badge.remove();
    u.snap = null;
  }
}
