import type { ConnectionStatus, WSMessage } from './types';
import { emit } from './util';

const PONG = JSON.stringify({ type: 'pong' });

export class Connection {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private active = false;

  constructor(
    private server: string,
    private room: string,
    private token: string | null,
    private onMessage: (msg: WSMessage) => void,
    private onClose: (code: number) => void,
  ) {}

  start(): void {
    this.active = true;
    this.connect();
  }

  stop(): void {
    this.active = false;
    if (this.ws) { try { this.ws.close(); } catch { /* noop */ } this.ws = null; }
  }

  send(payload: object): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try { this.ws.send(JSON.stringify(payload)); return true; } catch { return false; }
  }

  pong(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(PONG); } catch { /* noop */ }
    }
  }

  isOpen(): boolean { return !!this.ws && this.ws.readyState === WebSocket.OPEN; }

  private status(s: ConnectionStatus): void { emit('lc:status', { status: s }); }

  private connect(): void {
    if (!this.active) return;
    this.status('connecting');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let url = proto + '//' + this.server.replace(/^https?:\/\//, '') + '/ws?room=' + encodeURIComponent(this.room);
    if (this.token) url += '&token=' + encodeURIComponent(this.token);

    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => { this.reconnectDelay = 1000; this.status('connected'); };
    ws.onmessage = (e) => {
      try { this.onMessage(JSON.parse(e.data)); } catch { /* malformed */ }
    };
    ws.onclose = (e) => {
      this.ws = null;
      if (e.code === 4503) { this.status('room_full'); this.reconnectDelay = 30000; }
      else this.status('disconnected');
      this.onClose(e.code);
      if (this.active) {
        const delay = this.reconnectDelay;
        setTimeout(() => this.connect(), delay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
      }
    };
  }
}
