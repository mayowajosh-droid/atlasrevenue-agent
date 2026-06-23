import type { HomepageSignal, ChaseStats, ChartDataPoint, ProcurementData, DeskProfile } from "../types.js";
import { pool, sigMemStore, deskCacheMemStore, compilingDesks, captureError, DESK_CACHE_TTL_MS } from "../config.js";
import { pullProcurementData } from "../fetchers/pull-procurement.js";

function nowIso() { return new Date().toISOString(); }

export async function upsertSignals(signals: HomepageSignal[]): Promise<HomepageSignal[]> {
  if (signals.length === 0) return [];
  const inserted: HomepageSignal[] = [];
  if (pool) {
    for (const s of signals) {
      const r = await pool.query<{ inserted: boolean }>(
        `INSERT INTO homepage_signals (id, category, title, buyer, source, source_url, notice_date, deadline_date, value_amount, status, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           deadline_date = EXCLUDED.deadline_date,
           value_amount  = EXCLUDED.value_amount,
           status        = EXCLUDED.status,
           fetched_at    = EXCLUDED.fetched_at
         RETURNING (xmax = 0) AS inserted`,
        [s.id, s.category, s.title, s.buyer, s.source, s.source_url,
         s.notice_date, s.deadline_date ?? null, s.value_amount, s.status, s.fetched_at]
      );
      if (r.rows[0]?.inserted) inserted.push(s);
    }
  } else {
    for (const s of signals) {
      if (!sigMemStore.has(s.id)) inserted.push(s);
      sigMemStore.set(s.id, s);
    }
  }
  return inserted;
}

export async function queryLatestSignals(limit: number): Promise<HomepageSignal[]> {
  if (pool) {
    const r = await pool.query<HomepageSignal>(
      `SELECT * FROM homepage_signals ORDER BY fetched_at DESC LIMIT $1`, [limit]
    );
    return r.rows;
  }
  return [...sigMemStore.values()]
    .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))
    .slice(0, limit);
}

export async function count24hSignals(): Promise<number> {
  if (pool) {
    const r = await pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM homepage_signals`
    );
    return parseInt(r.rows[0]?.n || "0", 10);
  }
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();
  return [...sigMemStore.values()].filter(s => (s.notice_date || s.fetched_at) > cutoff).length;
}

export async function findSamplePdf(): Promise<string | null> {
  const explicit = process.env.SAMPLE_PDF_URL?.trim();
  return explicit || null;
}

export async function queryDeskSignals(categories: string[]): Promise<Map<string, HomepageSignal>> {
  const out = new Map<string, HomepageSignal>();
  if (pool) {
    const r = await pool.query<HomepageSignal>(
      `SELECT DISTINCT ON (category) id, category, title, buyer, source, source_url, notice_date, deadline_date, value_amount, status, fetched_at
       FROM homepage_signals WHERE category = ANY($1) ORDER BY category, notice_date DESC NULLS LAST`,
      [categories]
    );
    for (const row of r.rows) out.set(row.category, row);
    return out;
  }
  for (const s of sigMemStore.values()) {
    if (categories.includes(s.category)) {
      const existing = out.get(s.category);
      if (!existing || s.fetched_at > existing.fetched_at) out.set(s.category, s);
    }
  }
  return out;
}

export async function queryOpenDeskSignals(limit: number): Promise<HomepageSignal[]> {
  if (pool) {
    const r = await pool.query<HomepageSignal>(
      `SELECT id, category, title, buyer, source, source_url, notice_date, deadline_date, value_amount, status, fetched_at
       FROM homepage_signals
       WHERE LOWER(status) LIKE '%open%' OR LOWER(status) LIKE '%active%'
       ORDER BY notice_date DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );
    return r.rows;
  }
  return [...sigMemStore.values()]
    .filter(s => /open|active/i.test(s.status || ""))
    .sort((a, b) => (b.notice_date || "").localeCompare(a.notice_date || ""))
    .slice(0, limit);
}

export async function queryChaseableSignals(limit: number): Promise<HomepageSignal[]> {
  if (pool) {
    const r = await pool.query<HomepageSignal>(
      `SELECT DISTINCT ON (LOWER(TRIM(title)), LOWER(TRIM(COALESCE(buyer,''))))
         id, category, title, buyer, source, source_url, notice_date, deadline_date, value_amount, status, fetched_at
       FROM homepage_signals
       WHERE (LOWER(status) LIKE '%open%' OR LOWER(status) LIKE '%active%')
         AND (deadline_date IS NULL OR deadline_date > NOW() + INTERVAL '5 days')
       ORDER BY LOWER(TRIM(title)), LOWER(TRIM(COALESCE(buyer,''))), deadline_date ASC NULLS LAST, notice_date DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );
    return r.rows;
  }
  return [...sigMemStore.values()]
    .filter(s => /open|active/i.test(s.status || ""))
    .sort((a, b) => {
      if (a.deadline_date && b.deadline_date) return a.deadline_date.localeCompare(b.deadline_date);
      if (a.deadline_date) return -1;
      if (b.deadline_date) return 1;
      return (b.notice_date || "").localeCompare(a.notice_date || "");
    })
    .slice(0, limit);
}

export async function queryChaseableStats(): Promise<ChaseStats> {
  if (!pool) return { totalOpen: 0, avgValueK: null, closingThisMonth: 0, byDesk: [] };
  const [totals, byDesk, closing, avgVal] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM homepage_signals
       WHERE (LOWER(status) LIKE '%open%' OR LOWER(status) LIKE '%active%')
         AND (deadline_date IS NULL OR deadline_date > NOW() + INTERVAL '5 days')`
    ),
    pool.query<{ category: string; cnt: string }>(
      `SELECT category, COUNT(*) AS cnt
       FROM homepage_signals
       WHERE (LOWER(status) LIKE '%open%' OR LOWER(status) LIKE '%active%')
         AND (deadline_date IS NULL OR deadline_date > NOW() + INTERVAL '5 days')
       GROUP BY category ORDER BY cnt DESC LIMIT 5`
    ),
    pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM homepage_signals
       WHERE (LOWER(status) LIKE '%open%' OR LOWER(status) LIKE '%active%')
         AND deadline_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'`
    ),
    pool.query<{ avg_k: string }>(
      `SELECT ROUND(AVG(value_amount) / 1000) AS avg_k
       FROM homepage_signals
       WHERE (LOWER(status) LIKE '%open%' OR LOWER(status) LIKE '%active%')
         AND (deadline_date IS NULL OR deadline_date > NOW() + INTERVAL '5 days')
         AND value_amount > 0 AND value_amount < 100000000`
    ),
  ]);
  const rawAvg = parseFloat(avgVal.rows[0]?.avg_k || "0");
  return {
    totalOpen: parseInt(totals.rows[0]?.total || "0"),
    avgValueK: rawAvg > 0 ? rawAvg : null,
    closingThisMonth: parseInt(closing.rows[0]?.cnt || "0"),
    byDesk: byDesk.rows.map(r => ({ category: r.category, count: parseInt(r.cnt) })),
  };
}

export async function queryChartData(): Promise<{ points: ChartDataPoint[]; illustrative: boolean; topDesk: string | null }> {
  if (pool) {
    const [r, topR] = await Promise.all([
      pool.query<ChartDataPoint>(
        `SELECT to_char(date_trunc('month', notice_date), 'Mon') AS month,
                ROUND(SUM(value_amount) / 1e6::numeric, 2)::float AS total_m
         FROM homepage_signals
         WHERE notice_date > NOW() - INTERVAL '12 months'
           AND notice_date <= NOW()
           AND value_amount IS NOT NULL
           AND value_amount > 0
           AND value_amount <= 2000000000
           AND (LOWER(status) LIKE '%award%')
         GROUP BY date_trunc('month', notice_date)
         ORDER BY date_trunc('month', notice_date)`
      ),
      pool.query<{ category: string }>(
        `SELECT category
         FROM homepage_signals
         WHERE notice_date > NOW() - INTERVAL '12 months'
           AND notice_date <= NOW()
           AND value_amount IS NOT NULL
           AND value_amount > 0
           AND value_amount <= 2000000000
           AND (LOWER(status) LIKE '%award%')
         GROUP BY category
         ORDER BY SUM(value_amount) DESC
         LIMIT 1`
      ),
    ]);
    return {
      points: r.rows,
      illustrative: r.rows.length < 3,
      topDesk: topR.rows[0]?.category ?? null,
    };
  }
  return { points: [], illustrative: true, topDesk: null };
}

export async function getDeskCache(slug: string): Promise<{ data: ProcurementData; cached_at: string } | null> {
  if (pool) {
    const r = await pool.query<{ data: ProcurementData; cached_at: string }>(
      `SELECT data, cached_at::text FROM desk_cache WHERE slug = $1 AND cached_at > NOW() - INTERVAL '24 hours'`,
      [slug]
    );
    return r.rows[0] || null;
  }
  const mem = deskCacheMemStore.get(slug);
  if (!mem) return null;
  if (Date.now() - new Date(mem.cached_at).getTime() > DESK_CACHE_TTL_MS) return null;
  return mem;
}

export async function setDeskCache(slug: string, data: ProcurementData): Promise<void> {
  const now = nowIso();
  if (pool) {
    await pool.query(
      `INSERT INTO desk_cache (slug, data, cached_at) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET data = EXCLUDED.data, cached_at = EXCLUDED.cached_at`,
      [slug, JSON.stringify(data), now]
    );
    return;
  }
  deskCacheMemStore.set(slug, { data, cached_at: now });
}

export async function compileDeskInBackground(profile: DeskProfile): Promise<void> {
  if (compilingDesks.has(profile.slug)) return;
  compilingDesks.add(profile.slug);
  try {
    console.log(`[desk] compiling ${profile.slug}`);
    const data = await pullProcurementData(profile.pinnedProfile);
    await setDeskCache(profile.slug, data);
    console.log(`[desk] compiled ${profile.slug} — ${data.contractsFinder.open.length} open, ${data.contractsFinder.awarded.length} awarded`);
  } catch (err: any) {
    console.error(`[desk] compile failed for ${profile.slug}: ${err?.message}`);
    captureError(err, { desk: { slug: profile.slug } });
  } finally {
    compilingDesks.delete(profile.slug);
  }
}
