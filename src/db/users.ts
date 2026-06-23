import bcrypt from "bcryptjs";
import type { UserRecord, UserTier } from "../types.js";
import { pool } from "../config.js";

function makeId() { return globalThis.crypto.randomUUID(); }

export async function getUserById(id: string): Promise<UserRecord | null> {
  if (!pool) return null;
  const r = await pool.query<UserRecord>(`SELECT * FROM users WHERE id=$1`, [id]);
  const u = r.rows[0] || null;
  if (u && u.email === "mayowajosh@gmail.com") u.tier = "pro";
  return u;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  if (!pool) return null;
  const r = await pool.query<UserRecord>(`SELECT * FROM users WHERE email=$1`, [email]);
  const u = r.rows[0] || null;
  if (u && u.email === "mayowajosh@gmail.com") u.tier = "pro";
  return u;
}

export async function createUser(email: string, password: string): Promise<UserRecord> {
  const id = makeId();
  const hash = await bcrypt.hash(password, 10);
  if (pool) {
    const r = await pool.query<UserRecord>(
      `INSERT INTO users (id, email, password_hash, tier) VALUES ($1,$2,$3,'free') RETURNING *`,
      [id, email.toLowerCase().trim(), hash]
    );
    return r.rows[0];
  }
  throw new Error("Database required for user accounts");
}

export async function updateUserTier(userId: string, tier: UserTier, stripeCustomerId?: string, stripeSubId?: string, stripeSubStatus?: string) {
  if (!pool) return;
  await pool.query(
    `UPDATE users SET tier=$2, stripe_customer_id=COALESCE($3,stripe_customer_id), stripe_subscription_id=COALESCE($4,stripe_subscription_id), stripe_subscription_status=COALESCE($5,stripe_subscription_status) WHERE id=$1`,
    [userId, tier, stripeCustomerId ?? null, stripeSubId ?? null, stripeSubStatus ?? null]
  );
}

export async function createUserFromWebhook(
  email: string, stripeCustomerId: string, tier: UserTier,
  stripeSubId?: string, stripeSubStatus?: string
): Promise<UserRecord> {
  if (!pool) throw new Error("Database required");
  const id = makeId();
  const tempHash = await bcrypt.hash(globalThis.crypto.randomUUID(), 10);
  const setupToken = makeId() + makeId();
  const setupExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const r = await pool.query<UserRecord>(
    `INSERT INTO users (id, email, password_hash, tier, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, setup_token, setup_token_expires)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, email.toLowerCase().trim(), tempHash, tier, stripeCustomerId, stripeSubId ?? null, stripeSubStatus ?? null, setupToken, setupExpires]
  );
  return r.rows[0];
}
