import type { ChatBubble, ChatHistoryEntry, RemoteUser } from './types';

const DISPLAY_MS = 8000;
const FADE_MS = 500;
const MAX_BUBBLES = 5;

export class ChatLayer {
  private hint: HTMLElement | null = null;
  private hintTimer: number | null = null;
  private inputEl: HTMLElement | null = null;
  private hintShown = false;

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
    if (this.hintTimer != null) clearTimeout(this.hintTimer);
    this.hint = null;
    this.inputEl = null;
  }

  /**
   * Replay chat history as bubbles on the corresponding user cursors.
   * Each user's messages are shown as normal chat bubbles, grouped by sender.
   */
  showHistory(entries: ChatHistoryEntry[], users: Map<string, RemoteUser>, tabHidden: boolean): void {
    if (!this.enabled || entries.length === 0) return;
    for (const e of entries) {
      const u = users.get(e.id);
      if (u) this.show(u, e.text, tabHidden);
    }
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

  /** Show or hide the typing indicator (bouncing dots) on a remote user's cursor. */
  setTyping(u: RemoteUser, typing: boolean): void {
    if (!this.enabled || !u.el) return;
    if (typing) {
      if (u.typingEl) return;
      const el = document.createElement('div');
      el.className = 'lc-typing';
      el.style.background = u.color;
      for (let i = 0; i < 3; i++) {
        const d = document.createElement('div');
        d.className = 'lc-typing-dot';
        el.appendChild(d);
      }
      u.el.appendChild(el);
      u.typingEl = el;
    } else {
      if (!u.typingEl) return;
      u.typingEl.remove();
      u.typingEl = null;
    }
  }

  /** Open an inline input near the local cursor. */
  openInput(x: number, y: number, color: string, onSubmit: (text: string) => void, onOpen?: () => void, onClose?: () => void): void {
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

    const close = () => { onClose?.(); this.closeInput(); };
    onOpen?.();
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
