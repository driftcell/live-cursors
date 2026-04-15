/**
 * <live-cursors> custom-element entry. Boolean attributes follow the rule:
 * present (or `"true"`) = enabled, value `"false"` = disabled.
 */
import { LiveCursorsEngine } from './engine';

const ATTRS = [
  'server','room','container','presence',
  'show-cursors','show-presence','show-login','show-chat',
  'show-snap','count-anonymous','telemetry','throttle',
];

class LiveCursorsElement extends HTMLElement {
  static get observedAttributes() { return ATTRS; }

  private engine: LiveCursorsEngine | null = null;

  private boolAttr(name: string, defaultOn: boolean): boolean {
    if (!this.hasAttribute(name)) return defaultOn;
    return this.getAttribute(name) !== 'false';
  }

  connectedCallback(): void {
    if (this.engine) return;
    this.engine = new LiveCursorsEngine({
      server:            this.getAttribute('server') || location.origin,
      room:              this.getAttribute('room') || (location.hostname + location.pathname),
      containerSelector: this.getAttribute('container') || '',
      presenceSelector:  this.getAttribute('presence') || '',
      showCursors:       this.boolAttr('show-cursors', true),
      showPresence:      this.boolAttr('show-presence', true),
      showLogin:         this.boolAttr('show-login', true),
      showChat:          this.boolAttr('show-chat', true),
      showSnap:          this.getAttribute('show-snap') === 'true',
      countAnonymous:    this.boolAttr('count-anonymous', true),
      telemetryEnabled:  this.getAttribute('telemetry') === 'true',
      throttleMs:        parseInt(this.getAttribute('throttle') || '50', 10) || 50,
    });
    this.engine.start();
  }

  disconnectedCallback(): void {
    this.engine?.destroy();
    this.engine = null;
  }
}

if (!customElements.get('live-cursors')) {
  customElements.define('live-cursors', LiveCursorsElement);
}
