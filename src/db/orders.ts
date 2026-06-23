import { pool } from "../config.js";

function makeId() { return globalThis.crypto.randomUUID(); }

export async function createOrder(userId: string, sessionId: string, paymentIntent: string | null, plan: string, amount: number, status: string) {
  if (!pool) return;
  const id = makeId();
  await pool.query(
    `INSERT INTO orders (id, user_id, stripe_session_id, stripe_payment_intent, plan, amount, status) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (stripe_session_id) DO NOTHING`,
    [id, userId, sessionId, paymentIntent, plan, amount, status]
  );
}

export async function ensureWebhookEvent(eventId: string, type: string, payload: string): Promise<boolean> {
  if (!pool) return false;
  try {
    await pool.query(
      `INSERT INTO webhook_events (stripe_event_id, type, payload) VALUES ($1,$2,$3)`,
      [eventId, type, payload]
    );
    return false;
  } catch {
    return true;
  }
}

export async function logAdminAudit(adminUserId: string, action: string, target: string, meta?: object) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO admin_audit (admin_user_id, action, target, meta_json) VALUES ($1,$2,$3,$4)`,
    [adminUserId, action, target, meta ? JSON.stringify(meta) : null]
  );
}
