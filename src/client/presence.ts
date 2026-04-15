import type { EngineConfig, RemoteUser, SelfUser } from './types';
import { GITHUB_SVG } from './util';

export class PresenceBar {
  private root: HTMLElement | null = null;
  private avatarsEl: HTMLElement | null = null;
  private dividerEl: HTMLElement | null = null;
  private authEl: HTMLElement | null = null;

  constructor(
    private cfg: EngineConfig,
    private selfUser: SelfUser | null,
    private tokenKey: string,
    parent: HTMLElement,
    private onFollow: (id: string) => void,
  ) {
    if (!cfg.showPresence) return;
    const root = document.createElement('div');
    root.className = 'lc-presence';

    const avatars = document.createElement('div'); avatars.className = 'lc-presence-avatars';
    const divider = document.createElement('div'); divider.className = 'lc-nav-divider'; divider.style.display = 'none';
    const auth = document.createElement('div');

    root.appendChild(avatars);
    root.appendChild(divider);
    root.appendChild(auth);
    this.root = root; this.avatarsEl = avatars; this.dividerEl = divider; this.authEl = auth;

    const mountSel = cfg.presenceSelector;
    const mount = mountSel ? document.querySelector(mountSel) : null;
    if (mount) { root.classList.add('lc-presence--mounted'); mount.appendChild(root); }
    else parent.appendChild(root);
  }

  destroy(): void { this.root?.remove(); }

  render(
    users: Map<string, RemoteUser>,
    oauthReady: boolean,
    activeIds: Set<string> = new Set(),
    followingId: string | null = null,
  ): void {
    if (!this.root || !this.avatarsEl || !this.dividerEl || !this.authEl) return;

    this.avatarsEl.replaceChildren();
    const all = Array.from(users.values());
    const filtered = this.cfg.countAnonymous ? all : all.filter((u) => !!u.avatar);
    const visible = filtered.slice(0, 5);
    const overflow = filtered.length - visible.length;

    visible.forEach((u, i) => this.avatarsEl!.appendChild(this.avatarEl(u, i, activeIds.has(u.id), followingId === u.id)));
    if (overflow > 0) {
      const b = document.createElement('div');
      b.className = 'lc-p-overflow';
      b.textContent = '+' + overflow;
      this.avatarsEl.appendChild(b);
    }
    this.dividerEl.style.display = all.length > 0 ? '' : 'none';

    this.renderAuth(oauthReady);
  }

  private avatarEl(u: RemoteUser, i: number, active: boolean, following: boolean): HTMLElement {
    const title = `${u.username}${following ? ' (following — click to stop)' : ' (click to follow)'}`;
    const classes = ['lc-p-avatar'];
    if (active) classes.push('lc-active');
    if (following) classes.push('lc-following');

    if (u.avatar) {
      const a = document.createElement('a');
      a.className = classes.join(' ');
      a.href = u.url || '#';
      a.title = title;
      a.style.zIndex = String(100 - i);
      const img = document.createElement('img');
      img.src = u.avatar;
      img.alt = u.username;
      a.appendChild(img);
      a.addEventListener('click', (e) => { e.preventDefault(); this.onFollow(u.id); });
      return a;
    }
    const d = document.createElement('div');
    d.className = classes.join(' ');
    d.style.backgroundColor = u.color;
    d.style.zIndex = String(100 - i);
    d.title = title;
    d.textContent = u.username[0];
    d.addEventListener('click', () => this.onFollow(u.id));
    return d;
  }

  private renderAuth(oauthReady: boolean): void {
    if (!this.authEl) return;
    this.authEl.replaceChildren();
    if (this.selfUser) {
      const btn = document.createElement('button');
      btn.className = 'lc-avatar-logout';
      btn.title = `Sign out (@${this.selfUser.username})`;
      btn.onclick = () => { localStorage.removeItem(this.tokenKey); location.reload(); };
      if (this.selfUser.avatar) {
        const av = document.createElement('img');
        av.src = this.selfUser.avatar;
        av.alt = this.selfUser.username;
        btn.appendChild(av);
      } else {
        btn.style.cssText = 'background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font:700 13px/1 system-ui';
        btn.textContent = this.selfUser.username[0];
      }
      this.authEl.appendChild(btn);
    } else if (this.cfg.showLogin && oauthReady) {
      const a = document.createElement('a');
      a.className = 'lc-btn-login';
      a.href = `${this.cfg.server}/auth/login?redirect=${encodeURIComponent(location.href)}`;
      a.innerHTML = GITHUB_SVG + "Who's Here";
      this.authEl.appendChild(a);
    }
  }
}
