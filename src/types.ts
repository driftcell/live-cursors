/**
 * Shared type definitions for live-cursors.
 *
 * Centralises interfaces that are used across the Worker entry-point,
 * Durable Object, and helper modules so they stay in sync.
 */

export interface Env {
  CURSOR_ROOM: DurableObjectNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
  DB: D1Database;
  TELEMETRY_ENDPOINT: string;
}

/** Wire-safe subset of user info shared with clients. */
export interface PublicUserInfo {
  id: string;
  username: string;
  avatar: string;
  url: string;
  color: string;
}
