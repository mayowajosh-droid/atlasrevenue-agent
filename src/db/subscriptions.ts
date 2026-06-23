import { z } from "zod";
import type { SubscriptionRecord } from "../types.js";
import { pool, subMemStore } from "../config.js";
import { intakeSchema } from "../data/intake.js";

function nowIso() { return new Date().toISOString(); }

export async function createSubscription(
  scanId: string,
  email: string,
  input: z.infer<typeof intakeSchema>,
  companyName: string
): Promise<SubscriptionRecord> {
  const record: SubscriptionRecord = {
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    scan_id: scanId,
    company_name: companyName,
    email,
    input_json: input,
    alerted_notice_ids: [],
    active: true,
    created_at: nowIso(),
    last_alerted_at: null
  };

  if (pool) {
    await pool.query(
      `INSERT INTO alert_subscriptions (id, scan_id, company_name, email, input_json, alerted_notice_ids, active, created_at, last_alerted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [record.id, record.scan_id, record.company_name, record.email, record.input_json,
       record.alerted_notice_ids, record.active, record.created_at, record.last_alerted_at]
    );
  } else {
    subMemStore.set(record.id, record);
  }
  return record;
}

export async function getSubscription(id: string): Promise<SubscriptionRecord | null> {
  if (pool) {
    const result = await pool.query(`SELECT * FROM alert_subscriptions WHERE id=$1`, [id]);
    return result.rows[0] || null;
  }
  return subMemStore.get(id) || null;
}

export async function updateSubscriptionAlerted(id: string, noticeIds: string[]) {
  const now = nowIso();
  if (pool) {
    await pool.query(
      `UPDATE alert_subscriptions SET alerted_notice_ids=$2, last_alerted_at=$3 WHERE id=$1`,
      [id, noticeIds, now]
    );
  } else {
    const sub = subMemStore.get(id);
    if (sub) subMemStore.set(id, { ...sub, alerted_notice_ids: noticeIds, last_alerted_at: now });
  }
}

export async function deactivateSubscription(id: string) {
  if (pool) {
    await pool.query(`UPDATE alert_subscriptions SET active=FALSE WHERE id=$1`, [id]);
  } else {
    const sub = subMemStore.get(id);
    if (sub) subMemStore.set(id, { ...sub, active: false });
  }
}

export async function listAllSubscriptions(): Promise<SubscriptionRecord[]> {
  if (pool) {
    const result = await pool.query(`SELECT * FROM alert_subscriptions ORDER BY created_at DESC LIMIT 200`);
    return result.rows;
  }
  return Array.from(subMemStore.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
