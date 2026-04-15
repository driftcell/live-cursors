/**
 * Follow-mode: click a presence avatar → smoothly scroll to keep that user's
 * cursor centered in the viewport. Exits on Escape, another click, manual
 * wheel/touch scroll, or when the target leaves.
 */
import type { RemoteUser } from './types';
import { containerToViewport } from './util';

const RELAYOUT_THROTTLE_MS = 100;
const SCROLL_MARGIN = 120; // px from center before re-scrolling

export class FollowMode {
  private targetId: string | null = null;
  private banner: HTMLElement | null = null;
  private lastScrollTs = 0;
  private exitOnScroll = true;

  constructor(
    private users: Map<string, RemoteUser>,
    private container: () => Element,
    private onChange: () => void,   // re-render presence bar
  ) {}

  isFollowing(id: string): boolean { return this.targetId === id; }
  getTargetId(): string | null { return this.targetId; }

  toggle(id: string): void {
    if (this.targetId === id) this.stop();
    else this.start(id);
  }

  start(id: string): void {
    const u = this.users.get(id);
    if (!u) return;
    this.targetId = id;
    this.lastScrollTs = 0;
    this.renderBanner(u);
    this.tick();
    this.onChange();
  }

  stop(): void {
    if (!this.targetId) return;
    this.targetId = null;
    this.banner?.remove();
    this.banner = null;
    this.onChange();
  }

  /** Call on every remote-cursor update. */
  tick(): void {
    if (!this.targetId) return;
    const u = this.users.get(this.targetId);
    if (!u || u.xRatio < 0) { this.stop(); return; }
    const now = Date.now();
    if (now - this.lastScrollTs < RELAYOUT_THROTTLE_MS) return;
    const p = containerToViewport(this.container(), u.xRatio, u.yOffset);
    const center = window.innerHeight / 2;
    if (Math.abs(p.y - center) < SCROLL_MARGIN) return;
    this.lastScrollTs = now;
    this.exitOnScroll = false;
    const sy = window.scrollY || 0;
    window.scrollTo({ top: sy + (p.y - center), behavior: 'smooth' });
    // Allow user's manual scroll to exit; re-arm after the programmatic scroll lands.
    setTimeout(() => { this.exitOnScroll = true; }, 600);
  }

  /** Hook from global scroll listener — bails out when user manually scrolls. */
  onExternalScroll(): void {
    if (this.targetId && this.exitOnScroll) this.stop();
  }

  /** Called when a user leaves the room. */
  onUserGone(id: string): void {
    if (this.targetId === id) this.stop();
  }

  private renderBanner(u: RemoteUser): void {
    this.banner?.remove();
    const b = document.createElement('div');
    b.className = 'lc-follow-banner';
    b.title = 'Click to stop following';

    const av = document.createElement('div');
    av.className = 'lc-fb-av';
    if (u.avatar) {
      const img = document.createElement('img');
      img.src = u.avatar; img.alt = '';
      av.appendChild(img);
    } else {
      av.textContent = u.username[0];
    }
    b.appendChild(av);

    b.appendChild(document.createTextNode(`Following ${u.username}`));
    const x = document.createElement('span');
    x.className = 'lc-fb-close';
    x.textContent = '✕';
    b.appendChild(x);

    b.onclick = () => this.stop();
    document.body.appendChild(b);
    this.banner = b;
  }
}
