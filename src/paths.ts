/**
 * Palimpsest — long-lived cursor trails aggregated into D1.
 *
 * Positions are quantized into buckets keyed by (site, x_bucket, y_bucket, color):
 *   - x_bucket: xRatio rounded to 0.5% (0..199)
 *   - y_bucket: yOffset / 20 (20 px granularity)
 *   - color:   hex string already assigned to the user
 *
 * Each sample increments `hits` on its bucket and bumps `last_ts`. Rows older
 * than RETENTION_MS are purged on every flush. The client queries the latest
 * N rows and renders them as faint color blobs forming a "footprint" of
 * everyone who has ever visited.
 */

export const X_BUCKETS = 200;         // 0.5% granularity on xRatio
export const Y_BUCKET_PX = 20;        // 20 px bands on yOffset
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const QUERY_LIMIT = 2000;

export interface PathBucketSample {
  xb: number;
  yb: number;
  color: string;
  hits: number;
  age_ms: number;
}

/** Ensure the palimpsest table exists. */
export async function ensurePathsTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS paths (
         site    TEXT NOT NULL,
         xb      INTEGER NOT NULL,
         yb      INTEGER NOT NULL,
         color   TEXT NOT NULL,
         hits    INTEGER NOT NULL DEFAULT 1,
         last_ts INTEGER NOT NULL,
         PRIMARY KEY (site, xb, yb, color)
       )`,
    )
    .run();
  await db
    .prepare(`CREATE INDEX IF NOT EXISTS idx_paths_site_ts ON paths(site, last_ts)`)
    .run();
}

export interface BufferedSample { xb: number; yb: number; color: string; hits: number; lastTs: number }

/** Upsert a batch of buckets for one site. Uses D1's batch API when available. */
export async function flushPaths(
  db: D1Database,
  site: string,
  buckets: Iterable<BufferedSample>,
): Promise<number> {
  const stmts: D1PreparedStatement[] = [];
  const upsert = db.prepare(
    `INSERT INTO paths (site, xb, yb, color, hits, last_ts)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(site, xb, yb, color) DO UPDATE SET
       hits = hits + ?5,
       last_ts = MAX(last_ts, ?6)`,
  );
  for (const b of buckets) {
    stmts.push(upsert.bind(site, b.xb, b.yb, b.color, b.hits, b.lastTs));
  }
  if (stmts.length === 0) return 0;
  await db.batch(stmts);
  return stmts.length;
}

/** Delete rows older than RETENTION_MS for a single site (cheap, indexed). */
export async function purgeStalePaths(db: D1Database, site: string): Promise<void> {
  const cutoff = Date.now() - RETENTION_MS;
  await db.prepare(`DELETE FROM paths WHERE site = ?1 AND last_ts < ?2`).bind(site, cutoff).run();
}

/** Return the most-recent N buckets for a site, newest first. */
export async function queryPaths(db: D1Database, site: string): Promise<PathBucketSample[]> {
  const now = Date.now();
  const res = await db
    .prepare(
      `SELECT xb, yb, color, hits, last_ts
       FROM paths
       WHERE site = ?1
       ORDER BY last_ts DESC
       LIMIT ?2`,
    )
    .bind(site, QUERY_LIMIT)
    .all<{ xb: number; yb: number; color: string; hits: number; last_ts: number }>();
  const rows = res.results || [];
  return rows.map((r) => ({
    xb: r.xb,
    yb: r.yb,
    color: r.color,
    hits: r.hits,
    age_ms: now - r.last_ts,
  }));
}
