/**
 * Classic <script> embed entry — reads data-* attributes from its own tag
 * and starts an engine on DOMContentLoaded.
 */
import { LiveCursorsEngine } from './engine';
import type { EngineConfig } from './types';

(function () {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return;
  const origin = new URL(script.src).origin;
  const attr = (n: string): string => script.getAttribute(n) || '';

  const cfg: EngineConfig = {
    server:            origin,
    room:              attr('data-room') || (location.hostname + location.pathname),
    containerSelector: attr('data-container'),
    presenceSelector:  attr('data-presence'),
    showCursors:       attr('data-show-cursors') !== 'false',
    showPresence:      attr('data-show-presence') !== 'false',
    showLogin:         attr('data-show-login') !== 'false',
    showChat:          attr('data-show-chat') !== 'false',
    showSnap:          attr('data-show-snap') === 'true',
    showSelection:     attr('data-show-selection') !== 'false',
    showInk:           attr('data-show-ink') !== 'false',
    showFollow:        attr('data-show-follow') !== 'false',
    showReactions:     attr('data-show-reactions') !== 'false',
    idleFade:          attr('data-idle-fade') !== 'false',
    activeHalo:        attr('data-active-halo') !== 'false',
    palimpsest:        attr('data-palimpsest') === 'true',
    showConstellation: attr('data-show-constellation') !== 'false',
    countAnonymous:    attr('data-count-anonymous') !== 'false',
    telemetryEnabled:  attr('data-telemetry') === 'true',
    throttleMs:        parseInt(attr('data-throttle') || '50', 10) || 50,
  };

  const init = () => new LiveCursorsEngine(cfg).start();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
