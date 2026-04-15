/**
 * <live-cursors> Web Component entry point.
 *
 * Usage:
 *   <script src="https://live-cursors.driftcell.dev/embed-wc.js"></script>
 *   <live-cursors
 *     server="https://live-cursors.driftcell.dev"
 *     room="my-room"
 *     container="main"
 *     presence="#header-slot"
 *     show-cursors
 *     show-presence
 *     show-login
 *     show-chat
 *     throttle="50"
 *   ></live-cursors>
 *
 * Boolean attributes: present = true, absent = false.
 * Can coexist with the classic <script src="embed.js"> approach.
 */
import { LiveCursorsEngine } from './core.js';

(function () {
  'use strict';

  class LiveCursorsElement extends HTMLElement {
    static get observedAttributes() {
      return [
        'server', 'room', 'container', 'presence',
        'show-cursors', 'show-presence', 'show-login', 'show-chat',
        'show-snap', 'count-anonymous', 'telemetry', 'throttle',
      ];
    }

    constructor() {
      super();
      this._engine = null;
      this._connected = false;
    }

    /* ── config readers (live from attributes) ─────────────────────────── */
    get server()           { return this.getAttribute('server') || location.origin; }
    get room()             { return this.getAttribute('room') || (location.hostname + location.pathname); }
    get containerSel()     { return this.getAttribute('container') || ''; }
    get presenceSel()      { return this.getAttribute('presence') || ''; }
    get showCursors()      { return !this.hasAttribute('show-cursors') || this.getAttribute('show-cursors') !== 'false'; }
    get showPresence()     { return !this.hasAttribute('show-presence') || this.getAttribute('show-presence') !== 'false'; }
    get showLogin()        { return !this.hasAttribute('show-login') || this.getAttribute('show-login') !== 'false'; }
    get showChat()         { return !this.hasAttribute('show-chat') || this.getAttribute('show-chat') !== 'false'; }
    get showSnap()         { return this.getAttribute('show-snap') === 'true'; }
    get countAnonymous()   { return !this.hasAttribute('count-anonymous') || this.getAttribute('count-anonymous') !== 'false'; }
    get telemetryEnabled() { return this.getAttribute('telemetry') === 'true'; }
    get throttleMs()       { return parseInt(this.getAttribute('throttle') || '50', 10) || 50; }

    /* ── lifecycle ─────────────────────────────────────────────────────── */
    connectedCallback() {
      if (this._connected) return;
      this._connected = true;

      this._engine = new LiveCursorsEngine({
        server:            this.server,
        room:              this.room,
        containerSelector: this.containerSel,
        presenceSelector:  this.presenceSel,
        showCursors:       this.showCursors,
        showPresence:      this.showPresence,
        showLogin:         this.showLogin,
        showChat:          this.showChat,
        showSnap:          this.showSnap,
        countAnonymous:    this.countAnonymous,
        telemetryEnabled:  this.telemetryEnabled,
        throttleMs:        this.throttleMs,
      });
      this._engine.start();
    }

    disconnectedCallback() {
      this._connected = false;
      if (this._engine) {
        this._engine.destroy();
        this._engine = null;
      }
    }
  }

  if (!customElements.get('live-cursors')) {
    customElements.define('live-cursors', LiveCursorsElement);
  }
})();
