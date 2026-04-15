/**
 * Live Cursors — classic <script> embed entry point.
 *
 * Reads configuration from data-* attributes on the script tag,
 * then delegates everything to the shared LiveCursorsEngine.
 *
 * Usage:
 *   <script src="https://live-cursors.driftcell.dev/embed.js"
 *     data-room="my-room"
 *     data-container="main"
 *     data-presence="#header-slot"
 *   ></script>
 */
import { LiveCursorsEngine } from './core.js';

(function () {
  var script = document.currentScript;
  var ORIGIN = new URL(script.src).origin;

  /* ── read config synchronously while currentScript is valid ── */
  function attr(n) { return script && script.getAttribute(n) || ''; }

  var cfg = {
    server:            ORIGIN,
    room:              attr('data-room') || (location.hostname + location.pathname),
    containerSelector: attr('data-container'),
    presenceSelector:  attr('data-presence'),
    showCursors:       attr('data-show-cursors') !== 'false',
    showPresence:      attr('data-show-presence') !== 'false',
    showLogin:         attr('data-show-login') !== 'false',
    showChat:          attr('data-show-chat') !== 'false',
    showSnap:          attr('data-show-snap') === 'true',
    countAnonymous:    attr('data-count-anonymous') !== 'false',
    telemetryEnabled:  attr('data-telemetry') === 'true',
    throttleMs:        parseInt(attr('data-throttle') || '50', 10) || 50,
  };

  function init() {
    var engine = new LiveCursorsEngine(cfg);
    engine.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
