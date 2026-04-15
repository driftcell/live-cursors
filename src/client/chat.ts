import type { ChatBubble, ChatHistoryEntry, RemoteUser } from './types';
import { isSafeImageUrl } from './util';

const DISPLAY_MS = 8000;
const FADE_MS = 500;
const MAX_BUBBLES = 5;
const HISTORY_DISMISS_MS = 10000;
const HISTORY_FADE_MS = 400;

export class ChatLayer {
  private hint: HTMLElement | null = null;
  private hintTimer: number | null = null;
  private inputEl: HTMLElement | null = null;
  private hintShown = false;
  private historyPanel: HTMLElement | null = null;
  private historyTimer: number | null = null;

  constructor(private enabled: boolean, parent: HTMLElement) {
    if (!this.enabled) return;
    this.hint = document.createElement('div');
    this.hint.className = 'lc-chat-hint';
    this.hint.textContent = 'Press / to chat';
    parent.appendChild(this.hint);
  }

  destroy(): void {
    if (this.hint) this.hint.remove();
    if (this.inputEl) this.inputEl.remove();
    if (this.historyPanel) this.historyPanel.remove();
    if (this.hintTimer != null) clearTimeout(this.hintTimer);
    if (this.historyTimer != null) clearTimeout(this.historyTimer);
    this.hint = null;
    this.inputEl = null;
    this.historyPanel = null;
  }

  /** Render a one-shot floating panel with chat history pushed by the server on init. */
  showHistory(entries: ChatHistoryEntry[]): void {
    if (!this.enabled || entries.length === 0) return;
    this.dismissHistory(false);

    const panel = document.createElement('div');
    panel.className = 'lc-history-panel';
    const now = Date.now();
    for (const e of entries) panel.appendChild(this.historyRow(e, now));
    document.body.appendChild(panel);
    panel.scrollTop = panel.scrollHeight;
    this.historyPanel = panel;

    this.historyTimer = window.setTimeout(() => {
      this.historyTimer = null;
      panel.classList.add('fade-out');
      setTimeout(() => {
        if (this.historyPanel === panel) this.historyPanel = null;
        panel.remove();
      }, HISTORY_FADE_MS);
    }, HISTORY_DISMISS_MS);
  }

  private dismissHistory(animate: boolean): void {
    if (this.historyTimer != null) { clearTimeout(this.historyTimer); this.historyTimer = null; }
    if (!this.historyPanel) return;
    if (animate) this.historyPanel.classList.add('fade-out');
    else this.historyPanel.remove();
    this.historyPanel = null;
  }

  private historyRow(e: ChatHistoryEntry, now: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'lc-hist-msg';

    const av = document.createElement('div');
    av.className = 'lc-hist-av';
    if (isSafeImageUrl(e.avatar)) {
      const img = document.createElement('img');
      img.src = e.avatar!;
      img.alt = '';
      av.appendChild(img);
    } else {
      av.style.background = e.color || '#6366f1';
      av.textContent = (e.username || '?')[0];
    }
    row.appendChild(av);

    const body = document.createElement('div');
    body.className = 'lc-hist-body';
    const name = document.createElement('div');
    name.className = 'lc-hist-name';
    name.style.color = e.color || '#6366f1';
    name.textContent = e.username || 'Anonymous';
    const text = document.createElement('div');
    text.className = 'lc-hist-text';
    text.textContent = e.text;
    body.appendChild(name);
    body.appendChild(text);
    row.appendChild(body);

    const age = now - (e.ts || now);
    const ts = document.createElement('div');
    ts.className = 'lc-hist-time';
    ts.textContent = age < 60000 ? 'just now'
      : age < 3600000 ? Math.floor(age / 60000) + 'm ago'
      : Math.floor(age / 3600000) + 'h ago';
    row.appendChild(ts);
    return row;
  }

  /** Show a bubble on the user's cursor. */
  show(u: RemoteUser, text: string, tabHidden: boolean): void {
    if (!this.enabled || !u.el) return;

    if (!u.chatStack) {
      u.chatStack = document.createElement('div');
      u.chatStack.className = 'lc-chat-stack';
      u.el.appendChild(u.chatStack);
    }

    while (u.chatBubbles.length >= MAX_BUBBLES) {
      const oldest = u.chatBubbles.shift()!;
      this.clearBubble(oldest);
      oldest.el.remove();
    }

    const el = document.createElement('div');
    el.className = 'lc-chat-bubble';
    el.style.background = u.color;
    el.textContent = text;
    u.chatStack.appendChild(el);

    const entry: ChatBubble = { el, timer: null, fadeTimer: null, remaining: DISPLAY_MS, startedAt: 0 };
    u.chatBubbles.push(entry);
    if (!tabHidden) this.startTimer(u, entry);
  }

  /** Pause/resume bubble timers when tab visibility flips. */
  pause(u: RemoteUser): void {
    for (const b of u.chatBubbles) {
      if (b.timer != null) {
        clearTimeout(b.timer);
        b.timer = null;
        const elapsed = Date.now() - b.startedAt;
        b.remaining = Math.max(0, b.remaining - elapsed);
      }
    }
  }

  resume(u: RemoteUser): void {
    for (const b of u.chatBubbles) {
      if (b.timer == null && b.fadeTimer == null && b.remaining > 0) {
        this.startTimer(u, b);
      }
    }
  }

  private startTimer(u: RemoteUser, b: ChatBubble): void {
    b.startedAt = Date.now();
    b.timer = window.setTimeout(() => {
      b.timer = null;
      b.el.classList.add('fade');
      b.fadeTimer = window.setTimeout(() => {
        b.fadeTimer = null;
        b.el.remove();
        const idx = u.chatBubbles.indexOf(b);
        if (idx !== -1) u.chatBubbles.splice(idx, 1);
        if (u.chatBubbles.length === 0 && u.chatStack) {
          u.chatStack.remove();
          u.chatStack = null;
        }
      }, FADE_MS);
    }, b.remaining);
  }

  cleanup(u: RemoteUser): void {
    for (const b of u.chatBubbles) this.clearBubble(b);
    u.chatBubbles.length = 0;
  }

  private clearBubble(b: ChatBubble): void {
    if (b.timer != null) clearTimeout(b.timer);
    if (b.fadeTimer != null) clearTimeout(b.fadeTimer);
  }

  /** Open an inline input near the local cursor. */
  openInput(x: number, y: number, color: string, onSubmit: (text: string) => void): void {
    if (!this.enabled || this.inputEl) return;
    const wrap = document.createElement('div');
    wrap.className = 'lc-chat-input-wrap';
    wrap.style.transform = `translate3d(${x + 18}px, ${y - 6}px, 0)`;

    const input = document.createElement('input');
    input.className = 'lc-chat-input';
    input.style.background = color;
    input.maxLength = 128;
    input.placeholder = 'Say something…';
    input.autocomplete = 'off';
    wrap.appendChild(input);
    document.body.appendChild(wrap);
    this.inputEl = wrap;

    const close = () => this.closeInput();
    input.addEventListener('mousemove', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = input.value.trim();
        if (text) onSubmit(text);
        close();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        close();
        e.preventDefault();
      }
      e.stopPropagation();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());
    input.addEventListener('blur', close);
    input.focus();
  }

  closeInput(): void {
    if (!this.inputEl) return;
    this.inputEl.remove();
    this.inputEl = null;
  }

  isInputOpen(): boolean { return this.inputEl !== null; }

  /** Flash the hint once when the first remote user appears. */
  flashIfFirst(): void {
    if (!this.enabled || this.hintShown || !this.hint) return;
    this.hintShown = true;
    setTimeout(() => this.flash(), 800);
  }

  private flash(): void {
    if (!this.hint) return;
    if (this.hintTimer != null) clearTimeout(this.hintTimer);
    this.hint.classList.add('visible');
    this.hintTimer = window.setTimeout(() => {
      this.hint?.classList.remove('visible');
      this.hintTimer = null;
    }, 3000);
  }
}
