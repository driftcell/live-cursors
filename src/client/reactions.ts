/**
 * Transient floating-emoji reactions. Local user presses 1-6 to throw one at
 * the current cursor; remote reactions arrive with container-relative coords.
 */
import { containerToViewport } from './util';

export const REACTION_KEYS: Record<string, string> = {
  '1': '❤️',
  '2': '👀',
  '3': '🎉',
  '4': '🔥',
  '5': '👍',
  '6': '🫠',
};

const SPAWN_COOLDOWN_MS = 300;
const LIFETIME_MS = 1500;

export class ReactionsLayer {
  private lastSpawn = 0;

  constructor(private parent: HTMLElement, private container: () => Element) {}

  /** Returns true when the emoji was accepted + sent. */
  spawnLocal(emoji: string, cx: number, cy: number): boolean {
    const now = Date.now();
    if (now - this.lastSpawn < SPAWN_COOLDOWN_MS) return false;
    this.lastSpawn = now;
    this.spawn(emoji, cx, cy);
    return true;
  }

  /** Render a remote reaction at container-relative coords. */
  showRemote(emoji: string, xRatio: number, yOffset: number): void {
    const p = containerToViewport(this.container(), xRatio, yOffset);
    this.spawn(emoji, p.x, p.y);
  }

  private spawn(emoji: string, x: number, y: number): void {
    const el = document.createElement('div');
    el.className = 'lc-reaction';
    el.textContent = emoji;
    el.style.setProperty('--x', `${x}px`);
    el.style.setProperty('--y', `${y}px`);
    this.parent.appendChild(el);
    setTimeout(() => el.remove(), LIFETIME_MS);
  }
}
