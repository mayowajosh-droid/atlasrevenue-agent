import { pool } from "../../config.js";
import type { EarlySignal } from "./types.js";

export async function initEarlySignalsTables(): Promise<void> {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS early_signals (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      indicator TEXT NOT NULL,
      region TEXT NOT NULL,
      period TEXT NOT NULL,
      current_value NUMERIC NOT NULL,
      previous_value NUMERIC,
      change_pct NUMERIC,
      significance TEXT NOT NULL,
      desk_categories TEXT[] NOT NULL DEFAULT '{}',
      narrative TEXT NOT NULL DEFAULT '',
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_early_signals_source_fetched
      ON early_signals (source, fetched_at DESC);

    CREATE TABLE IF NOT EXISTS ons_data_cache (
      indicator TEXT NOT NULL,
      region TEXT NOT NULL,
      period TEXT NOT NULL,
      value NUMERIC NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (indicator, region, period)
    );

    CREATE TABLE IF NOT EXISTS land_registry_cache (
      district TEXT PRIMARY KEY,
      avg_price BIGINT NOT NULL,
      transaction_count INTEGER NOT NULL,
      period TEXT NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function upsertEarlySignal(signal: EarlySignal): Promise<void> {
  if (!pool) return;

  await pool.query(
    `INSERT INTO early_signals
       (id, source, indicator, region, period, current_value, previous_value, change_pct, significance, desk_categories, narrative, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
       current_value = EXCLUDED.current_value,
       previous_value = EXCLUDED.previous_value,
       change_pct = EXCLUDED.change_pct,
       significance = EXCLUDED.significance,
       desk_categories = EXCLUDED.desk_categories,
       narrative = EXCLUDED.narrative,
       fetched_at = EXCLUDED.fetched_at`,
    [
      signal.id,
      signal.source,
      signal.indicator,
      signal.region,
      signal.period,
      signal.current_value,
      signal.previous_value,
      signal.change_pct,
      signal.significance,
      signal.desk_categories,
      signal.narrative,
      signal.fetched_at,
    ]
  );
}

export async function getLatestEarlySignals(limit = 20): Promise<EarlySignal[]> {
  if (!pool) return [];

  const { rows } = await pool.query(
    `SELECT id, source, indicator, region, period,
            current_value, previous_value, change_pct,
            significance, desk_categories, narrative, fetched_at
     FROM early_signals
     ORDER BY fetched_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows as EarlySignal[];
}

export async function getEarlySignalsByDesk(deskSlug: string): Promise<EarlySignal[]> {
  if (!pool) return [];

  const { rows } = await pool.query(
    `SELECT id, source, indicator, region, period,
            current_value, previous_value, change_pct,
            significance, desk_categories, narrative, fetched_at
     FROM early_signals
     WHERE $1 = ANY(desk_categories)
     ORDER BY fetched_at DESC
     LIMIT 50`,
    [deskSlug]
  );
  return rows as EarlySignal[];
}

export async function upsertOnsCache(
  indicator: string,
  region: string,
  period: string,
  value: number
): Promise<void> {
  if (!pool) return;

  await pool.query(
    `INSERT INTO ons_data_cache (indicator, region, period, value, fetched_at)
     VALUES ($1,$2,$3,$4, NOW())
     ON CONFLICT (indicator, region, period) DO UPDATE SET
       value = EXCLUDED.value,
       fetched_at = EXCLUDED.fetched_at`,
    [indicator, region, period, value]
  );
}

export async function upsertLandRegistryCache(
  district: string,
  avgPrice: number,
  transactionCount: number,
  period: string
): Promise<void> {
  if (!pool) return;

  await pool.query(
    `INSERT INTO land_registry_cache (district, avg_price, transaction_count, period, fetched_at)
     VALUES ($1,$2,$3,$4, NOW())
     ON CONFLICT (district) DO UPDATE SET
       avg_price = EXCLUDED.avg_price,
       transaction_count = EXCLUDED.transaction_count,
       period = EXCLUDED.period,
       fetched_at = EXCLUDED.fetched_at`,
    [district, avgPrice, transactionCount, period]
  );
}
