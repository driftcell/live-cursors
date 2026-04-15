export interface EngineConfig {
  server: string;
  room: string;
  containerSelector?: string;
  presenceSelector?: string;
  showCursors?: boolean;
  showPresence?: boolean;
  showLogin?: boolean;
  showChat?: boolean;
  showSnap?: boolean;
  countAnonymous?: boolean;
  telemetryEnabled?: boolean;
  throttleMs?: number;
}

export interface SelfUser {
  username: string;
  avatar: string;
  url: string;
}

export interface RemoteUser {
  id: string;
  username: string;
  avatar?: string;
  url?: string;
  color: string;
  xRatio: number;
  yOffset: number;
  inputType: 'mouse' | 'touch';
  containerHeight: number;

  el: HTMLElement | null;
  edgeEl: HTMLElement | null;
  snap: { line: HTMLElement; badge: HTMLElement; target: HTMLElement } | null;
  chatStack: HTMLElement | null;
  chatBubbles: ChatBubble[];
  touchFadeTimer: number | null;
}

export interface ChatBubble {
  el: HTMLElement;
  timer: number | null;
  fadeTimer: number | null;
  remaining: number;
  startedAt: number;
}

export interface ResolvedPos { x: number; y: number; visible: boolean }

export interface ChatHistoryEntry {
  id: string;
  username: string;
  avatar?: string;
  color?: string;
  text: string;
  ts: number;
}

export type WSMessage =
  | { type: 'init'; self: string; users: IncomingUser[]; chatHistory?: ChatHistoryEntry[] }
  | { type: 'join'; user: IncomingUser }
  | { type: 'leave'; id: string }
  | { type: 'cursor'; id: string; xRatio: number; yOffset: number; inputType?: string; containerHeight?: number; snapTarget?: string | null }
  | { type: 'cursor_batch'; cursors: IncomingCursor[] }
  | { type: 'chat'; id: string; text: string }
  | { type: 'ping' }
  | { type: 'stats'; [k: string]: unknown }
  | { type: 'error'; [k: string]: unknown };

export interface IncomingUser {
  id: string;
  username: string;
  avatar?: string;
  url?: string;
  color?: string;
  xRatio?: number;
  yOffset?: number;
  inputType?: string;
  containerHeight?: number;
}

export interface IncomingCursor {
  id: string;
  username?: string;
  avatar?: string;
  url?: string;
  color?: string;
  xRatio: number;
  yOffset: number;
  inputType?: string;
  containerHeight?: number;
  snapTarget?: string | null;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'room_full';
