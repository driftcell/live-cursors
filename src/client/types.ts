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
  showSelection?: boolean;
  showInk?: boolean;
  showFollow?: boolean;
  showReactions?: boolean;
  idleFade?: boolean;
  activeHalo?: boolean;
  palimpsest?: boolean;
  showConstellation?: boolean;
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
  typingEl: HTMLElement | null;

  // activity tracking (idle fade, active halo)
  lastSeenTs: number;

  // text selection overlay
  selectionEl: HTMLElement | null;
  selectionRects: SelectionRect[];

  // ink strokes in progress / fading
  inkStrokes: InkStroke[];
}

export interface SelectionRect {
  xRatio: number;   // container-relative
  wRatio: number;
  yOffset: number;  // container-relative pixels
  height: number;
}

export interface InkStroke {
  /** svg polyline element inside the ink overlay */
  el: SVGPolylineElement;
  /** container-relative points [[xRatio, yOffset], ...] */
  pts: Array<[number, number]>;
  /** active = receiving more points; finalized = no more points coming */
  finalized: boolean;
  /** timer that removes the stroke after fade */
  removeTimer: number | null;
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
  | { type: 'typing'; id: string; typing: boolean }
  | { type: 'selection'; id: string; rects: SelectionRect[] }
  | { type: 'ink'; id: string; pts: Array<[number, number]>; final?: boolean }
  | { type: 'reaction'; id: string; emoji: string; xRatio: number; yOffset: number }
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
