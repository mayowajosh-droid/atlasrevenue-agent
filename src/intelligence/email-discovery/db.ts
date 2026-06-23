import { pool } from "../../config.js";
import crypto from "crypto";
import type { BuyerContact, ContactVerification } from "./types.js";

export async function initEmailDiscoveryTables(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS buyer_contacts (
      id TEXT PRIMARY KEY,
      buyer_entity_id TEXT NOT NULL,
      name TEXT,
      email TEXT NOT NULL,
      role TEXT,
      department TEXT,
      source TEXT NOT NULL DEFAULT 'pattern_inference',
      confidence_score INTEGER NOT NULL DEFAULT 0,
      verified BOOLEAN NOT NULL DEFAULT false,
      verified_at TIMESTAMPTZ,
      domain TEXT NOT NULL,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_buyer_contacts_entity ON buyer_contacts(buyer_entity_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_buyer_contacts_email_entity ON buyer_contacts(email, buyer_entity_id);

    CREATE TABLE IF NOT EXISTS contact_verifications (
      id TEXT PRIMARY KEY,
      buyer_contact_id TEXT NOT NULL REFERENCES buyer_contacts(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      result TEXT NOT NULL,
      detail TEXT,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_contact_verifications_contact ON contact_verifications(buyer_contact_id);
  `);
}

export async function upsertBuyerContact(contact: Omit<BuyerContact, "id" | "discovered_at" | "updated_at">): Promise<BuyerContact> {
  const id = crypto.randomUUID();
  if (!pool) {
    return { ...contact, id, discovered_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  }

  const res = await pool.query(
    `INSERT INTO buyer_contacts (id, buyer_entity_id, name, email, role, department, source, confidence_score, verified, verified_at, domain)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (email, buyer_entity_id)
     DO UPDATE SET name = COALESCE(EXCLUDED.name, buyer_contacts.name),
       role = COALESCE(EXCLUDED.role, buyer_contacts.role),
       department = COALESCE(EXCLUDED.department, buyer_contacts.department),
       confidence_score = GREATEST(EXCLUDED.confidence_score, buyer_contacts.confidence_score),
       verified = EXCLUDED.verified OR buyer_contacts.verified,
       verified_at = COALESCE(EXCLUDED.verified_at, buyer_contacts.verified_at),
       updated_at = now()
     RETURNING *`,
    [id, contact.buyer_entity_id, contact.name, contact.email, contact.role, contact.department,
     contact.source, contact.confidence_score, contact.verified, contact.verified_at, contact.domain]
  );
  return res.rows[0];
}

export async function getContactsForBuyer(buyerEntityId: string): Promise<BuyerContact[]> {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT * FROM buyer_contacts WHERE buyer_entity_id = $1 ORDER BY confidence_score DESC`,
    [buyerEntityId]
  );
  return res.rows;
}

export async function insertVerification(v: Omit<ContactVerification, "id" | "checked_at">): Promise<void> {
  if (!pool) return;
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO contact_verifications (id, buyer_contact_id, method, result, detail) VALUES ($1, $2, $3, $4, $5)`,
    [id, v.buyer_contact_id, v.method, v.result, v.detail]
  );

  if (v.result === "valid") {
    await pool.query(
      `UPDATE buyer_contacts SET verified = true, verified_at = now(), updated_at = now() WHERE id = $1`,
      [v.buyer_contact_id]
    );
  }
}

export async function getVerificationsForContact(contactId: string): Promise<ContactVerification[]> {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT * FROM contact_verifications WHERE buyer_contact_id = $1 ORDER BY checked_at DESC`,
    [contactId]
  );
  return res.rows;
}
