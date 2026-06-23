import { pool } from "../../config.js";
import type { OpportunityLifecycle, LifecycleTransition, LifecycleSummary, LifecycleStage } from "./types.js";

function makeId() { return globalThis.crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }

export async function initLifecycleTables() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS opportunity_lifecycle (
      id TEXT PRIMARY KEY,
      notice_id TEXT NOT NULL,
      buyer TEXT NOT NULL,
      title TEXT NOT NULL,
      normalised_subject TEXT NOT NULL,
      stage TEXT NOT NULL,
      maturity_score INTEGER NOT NULL DEFAULT 0,
      stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      value_low BIGINT,
      value_high BIGINT,
      desk_category TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_lifecycle_subject_buyer ON opportunity_lifecycle (normalised_subject, buyer);
    CREATE INDEX IF NOT EXISTS idx_lifecycle_stage ON opportunity_lifecycle (stage);
    CREATE INDEX IF NOT EXISTS idx_lifecycle_desk ON opportunity_lifecycle (desk_category);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lifecycle_transitions (
      id TEXT PRIMARY KEY,
      opportunity_lifecycle_id TEXT NOT NULL REFERENCES opportunity_lifecycle(id) ON DELETE CASCADE,
      from_stage TEXT NOT NULL,
      to_stage TEXT NOT NULL,
      notice_id TEXT NOT NULL,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_lifecycle_transitions_opp ON lifecycle_transitions (opportunity_lifecycle_id);
  `);

  console.log("[lifecycle] tables ready");
}

export async function upsertLifecycleEntry(entry: Omit<OpportunityLifecycle, "id" | "stage_entered_at" | "updated_at">): Promise<OpportunityLifecycle> {
  if (!pool) throw new Error("Database required for lifecycle tracking");
  const now = nowIso();
  const id = makeId();

  const r = await pool.query<OpportunityLifecycle>(
    `INSERT INTO opportunity_lifecycle (id, notice_id, buyer, title, normalised_subject, stage, maturity_score, stage_entered_at, source, source_url, value_low, value_high, desk_category, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$8)
     ON CONFLICT ON CONSTRAINT opportunity_lifecycle_pkey DO UPDATE SET
       notice_id = EXCLUDED.notice_id,
       title = EXCLUDED.title,
       stage = EXCLUDED.stage,
       maturity_score = EXCLUDED.maturity_score,
       stage_entered_at = CASE WHEN opportunity_lifecycle.stage != EXCLUDED.stage THEN now() ELSE opportunity_lifecycle.stage_entered_at END,
       source = EXCLUDED.source,
       source_url = EXCLUDED.source_url,
       value_low = COALESCE(EXCLUDED.value_low, opportunity_lifecycle.value_low),
       value_high = COALESCE(EXCLUDED.value_high, opportunity_lifecycle.value_high),
       desk_category = COALESCE(EXCLUDED.desk_category, opportunity_lifecycle.desk_category),
       updated_at = now()
     RETURNING *`,
    [id, entry.notice_id, entry.buyer, entry.title, entry.normalised_subject, entry.stage, entry.maturity_score, now, entry.source, entry.source_url, entry.value_low, entry.value_high, entry.desk_category]
  );
  return r.rows[0];
}

export async function updateLifecycleStage(id: string, stage: LifecycleStage, maturityScore: number, noticeId: string): Promise<OpportunityLifecycle> {
  if (!pool) throw new Error("Database required for lifecycle tracking");

  const r = await pool.query<OpportunityLifecycle>(
    `UPDATE opportunity_lifecycle SET stage = $2, maturity_score = $3, notice_id = $4, stage_entered_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
    [id, stage, maturityScore, noticeId]
  );
  return r.rows[0];
}

export async function insertTransition(transition: Omit<LifecycleTransition, "id" | "detected_at">): Promise<LifecycleTransition> {
  if (!pool) throw new Error("Database required for lifecycle tracking");
  const id = makeId();

  const r = await pool.query<LifecycleTransition>(
    `INSERT INTO lifecycle_transitions (id, opportunity_lifecycle_id, from_stage, to_stage, notice_id, detected_at)
     VALUES ($1,$2,$3,$4,$5,now()) RETURNING *`,
    [id, transition.opportunity_lifecycle_id, transition.from_stage, transition.to_stage, transition.notice_id]
  );
  return r.rows[0];
}

export async function getLifecycleBySubjectAndBuyer(normalisedSubject: string, buyer: string): Promise<OpportunityLifecycle | null> {
  if (!pool) return null;

  const r = await pool.query<OpportunityLifecycle>(
    `SELECT * FROM opportunity_lifecycle WHERE normalised_subject = $1 AND buyer = $2 LIMIT 1`,
    [normalisedSubject, buyer]
  );
  return r.rows[0] ?? null;
}

export async function getLifecycleSummary(): Promise<LifecycleSummary[]> {
  if (!pool) return [];

  const r = await pool.query<LifecycleSummary>(
    `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(value_high), 0)::bigint AS "totalValue", ROUND(AVG(maturity_score))::int AS "avgMaturity"
     FROM opportunity_lifecycle GROUP BY stage ORDER BY "avgMaturity" ASC`
  );
  return r.rows;
}

export async function getRecentTransitions(limit = 20): Promise<(LifecycleTransition & { buyer: string; title: string })[]> {
  if (!pool) return [];

  const r = await pool.query<LifecycleTransition & { buyer: string; title: string }>(
    `SELECT lt.*, ol.buyer, ol.title
     FROM lifecycle_transitions lt
     JOIN opportunity_lifecycle ol ON ol.id = lt.opportunity_lifecycle_id
     ORDER BY lt.detected_at DESC LIMIT $1`,
    [limit]
  );
  return r.rows;
}

export async function getLifecycleByDesk(deskCategory: string, limit = 50): Promise<OpportunityLifecycle[]> {
  if (!pool) return [];

  const r = await pool.query<OpportunityLifecycle>(
    `SELECT * FROM opportunity_lifecycle WHERE desk_category = $1 ORDER BY updated_at DESC LIMIT $2`,
    [deskCategory, limit]
  );
  return r.rows;
}
