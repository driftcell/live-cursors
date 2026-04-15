/**
 * Stats module — D1-backed site analytics
 *
 * Tables:
 *   site_stats (site TEXT PK, total_visits INT, peak_online INT, updated_at TEXT)
 *
 * current_online is computed live from the Durable Object session count,
 * so we don't persist it — only total_visits and peak_online live in D1.
 */

export interface SiteStats {
  site: string;
  total_visits: number;
  current_online: number;
  peak_online: number;
  updated_at: string;
}

/** Ensure the stats table exists (called once on first request). */
export async function ensureStatsTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS site_stats (
         site         TEXT PRIMARY KEY,
         total_visits INTEGER NOT NULL DEFAULT 0,
         peak_online  INTEGER NOT NULL DEFAULT 0,
         updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    )
    .run();
}

/** Increment total_visits by `count` and update peak_online. Batched variant. */
export async function recordVisits(
  db: D1Database,
  site: string,
  count: number,
  currentOnline: number,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO site_stats (site, total_visits, peak_online, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(site) DO UPDATE SET
         total_visits = total_visits + ?2,
         peak_online  = MAX(peak_online, ?3),
         updated_at   = ?4`,
    )
    .bind(site, count, currentOnline, now)
    .run();
}

/** Increment total_visits and update peak_online if currentOnline is higher. */
export async function recordVisit(
  db: D1Database,
  site: string,
  currentOnline: number,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO site_stats (site, total_visits, peak_online, updated_at)
       VALUES (?1, 1, ?2, ?3)
       ON CONFLICT(site) DO UPDATE SET
         total_visits = total_visits + 1,
         peak_online  = MAX(peak_online, ?2),
         updated_at   = ?3`,
    )
    .bind(site, currentOnline, now)
    .run();
}

/** Update peak_online if currentOnline exceeds the stored value. */
export async function updatePeak(
  db: D1Database,
  site: string,
  currentOnline: number,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO site_stats (site, total_visits, peak_online, updated_at)
       VALUES (?1, 0, ?2, ?3)
       ON CONFLICT(site) DO UPDATE SET
         peak_online = MAX(peak_online, ?2),
         updated_at  = ?3`,
    )
    .bind(site, currentOnline, now)
    .run();
}

/** Read persisted stats for a site (total_visits & peak_online). */
export async function getStats(
  db: D1Database,
  site: string,
): Promise<{ total_visits: number; peak_online: number } | null> {
  const row = await db
    .prepare(`SELECT total_visits, peak_online FROM site_stats WHERE site = ?1`)
    .bind(site)
    .first<{ total_visits: number; peak_online: number }>();
  return row ?? null;
}

/**
 * Push a stats snapshot to an external telemetry endpoint.
 * Fire-and-forget — errors are logged but never block the caller.
 */
export async function pushTelemetry(
  endpoint: string,
  stats: SiteStats,
): Promise<void> {
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...stats, pushed_at: new Date().toISOString() }),
    });
  } catch (err) {
    console.log(
      JSON.stringify({
        level: 'WARN',
        event: 'telemetry_push_failed',
        endpoint,
        error: String(err),
        ts: new Date().toISOString(),
      }),
    );
  }
}
