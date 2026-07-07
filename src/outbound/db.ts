import { pool } from "../config.js";
import type {
  OutboundCampaign, OutboundLead, OutboundEmail, OutboundReply,
  OutboundSuppression, OutboundDailyReport, OutboundConfig,
  LeadStatus, EmailStatus, CampaignStatus, DailyReportMetrics,
  DailyReportResponder, ReplyClassification, SuppressionReason,
} from "./types.js";

export async function initOutboundTables(): Promise<void> {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS outbound_config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS outbound_campaigns (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      desk_slug      TEXT,
      status         TEXT NOT NULL DEFAULT 'active',
      total_leads    INTEGER NOT NULL DEFAULT 0,
      total_sent     INTEGER NOT NULL DEFAULT 0,
      total_replies  INTEGER NOT NULL DEFAULT 0,
      total_positive INTEGER NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS outbound_leads (
      id                    TEXT PRIMARY KEY,
      campaign_id           TEXT,
      company_name          TEXT NOT NULL,
      company_number        TEXT,
      sic_codes             TEXT[] NOT NULL DEFAULT '{}',
      address               TEXT,
      region                TEXT,
      company_type          TEXT,
      website               TEXT,
      contact_email         TEXT,
      contact_name          TEXT,
      contact_role          TEXT,
      trigger_title         TEXT NOT NULL,
      trigger_buyer         TEXT NOT NULL,
      trigger_incumbent     TEXT,
      trigger_value         BIGINT,
      trigger_contract_end  TIMESTAMPTZ,
      trigger_url           TEXT NOT NULL,
      trigger_days_left     INTEGER,
      similar_count         INTEGER NOT NULL DEFAULT 0,
      desk_slug             TEXT,
      qualification_score   INTEGER NOT NULL DEFAULT 0,
      qualification_reasons TEXT[] NOT NULL DEFAULT '{}',
      status                TEXT NOT NULL DEFAULT 'qualified',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_leads_company_trigger
      ON outbound_leads (company_number, trigger_url)
      WHERE company_number IS NOT NULL;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outbound_leads_status ON outbound_leads (status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outbound_leads_campaign ON outbound_leads (campaign_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS outbound_emails (
      id               TEXT PRIMARY KEY,
      lead_id          TEXT NOT NULL REFERENCES outbound_leads(id) ON DELETE CASCADE,
      subject          TEXT NOT NULL,
      body_text        TEXT NOT NULL,
      gmail_message_id TEXT,
      gmail_thread_id  TEXT,
      sent_at          TIMESTAMPTZ,
      status           TEXT NOT NULL DEFAULT 'draft',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outbound_emails_lead ON outbound_emails (lead_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outbound_emails_thread ON outbound_emails (gmail_thread_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outbound_emails_status ON outbound_emails (status);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS outbound_replies (
      id               TEXT PRIMARY KEY,
      email_id         TEXT NOT NULL REFERENCES outbound_emails(id) ON DELETE CASCADE,
      lead_id          TEXT NOT NULL REFERENCES outbound_leads(id) ON DELETE CASCADE,
      gmail_message_id TEXT,
      classification   TEXT NOT NULL,
      confidence       REAL NOT NULL DEFAULT 0,
      raw_snippet      TEXT NOT NULL DEFAULT '',
      classified_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      handled          BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_outbound_replies_email ON outbound_replies (email_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS outbound_suppressions (
      id         TEXT PRIMARY KEY,
      email      TEXT,
      domain     TEXT,
      reason     TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_suppressions_email ON outbound_suppressions (email) WHERE email IS NOT NULL;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_suppressions_domain ON outbound_suppressions (domain) WHERE domain IS NOT NULL;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS outbound_daily_reports (
      id          TEXT PRIMARY KEY,
      report_date DATE NOT NULL UNIQUE,
      metrics     JSONB NOT NULL DEFAULT '{}',
      responders  JSONB NOT NULL DEFAULT '[]',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // One-shot backfill: nuke fake info@ emails injected by the old fallback logic.
  try {
    const nuked = await pool.query(
      `UPDATE outbound_leads SET contact_email = NULL, updated_at = now() WHERE contact_email LIKE 'info@%'`,
    );
    if (nuked.rowCount && nuked.rowCount > 0) {
      console.log(`[outbound] nuked ${nuked.rowCount} fake info@ contact emails`);
    }
  } catch (err) { console.warn("[outbound] info@ backfill skipped:", String(err).slice(0, 120)); }
}

// ── Config ──

export async function getOutboundConfig(key: string): Promise<string | null> {
  if (!pool) return null;
  const r = await pool.query(`SELECT value FROM outbound_config WHERE key = $1`, [key]);
  return r.rows[0]?.value ?? null;
}

export async function setOutboundConfig(key: string, value: string): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO outbound_config (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, value],
  );
}

// ── Campaigns ──

export async function insertCampaign(c: Pick<OutboundCampaign, "id" | "name" | "desk_slug">): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO outbound_campaigns (id, name, desk_slug) VALUES ($1, $2, $3)`,
    [c.id, c.name, c.desk_slug ?? null],
  );
}

export async function getActiveCampaigns(): Promise<OutboundCampaign[]> {
  if (!pool) return [];
  const r = await pool.query(`SELECT * FROM outbound_campaigns WHERE status = 'active' ORDER BY created_at DESC`);
  return r.rows;
}

export async function getCampaignById(id: string): Promise<OutboundCampaign | null> {
  if (!pool) return null;
  const r = await pool.query(`SELECT * FROM outbound_campaigns WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function updateCampaignStats(id: string): Promise<void> {
  if (!pool) return;
  await pool.query(`
    UPDATE outbound_campaigns SET
      total_leads    = (SELECT COUNT(*) FROM outbound_leads WHERE campaign_id = $1),
      total_sent     = (SELECT COUNT(*) FROM outbound_leads WHERE campaign_id = $1 AND status IN ('sent','replied')),
      total_replies  = (SELECT COUNT(*) FROM outbound_leads WHERE campaign_id = $1 AND status = 'replied'),
      total_positive = (SELECT COUNT(*) FROM outbound_replies r
                        JOIN outbound_leads l ON r.lead_id = l.id
                        WHERE l.campaign_id = $1 AND r.classification IN ('interested','send_info')),
      updated_at = now()
    WHERE id = $1
  `, [id]);
}

export async function updateCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
  if (!pool) return;
  await pool.query(`UPDATE outbound_campaigns SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
}

// ── Leads ──

export async function insertLead(lead: OutboundLead): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO outbound_leads (
      id, campaign_id, company_name, company_number, sic_codes, address, region,
      company_type, website, contact_email, contact_name, contact_role,
      trigger_title, trigger_buyer, trigger_incumbent, trigger_value,
      trigger_contract_end, trigger_url, trigger_days_left, similar_count,
      desk_slug, qualification_score, qualification_reasons, status, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,now(),now()
    ) ON CONFLICT DO NOTHING`,
    [
      lead.id, lead.campaign_id, lead.company_name, lead.company_number,
      lead.sic_codes, lead.address, lead.region, lead.company_type, lead.website,
      lead.contact_email, lead.contact_name, lead.contact_role,
      lead.trigger_title, lead.trigger_buyer, lead.trigger_incumbent,
      lead.trigger_value, lead.trigger_contract_end, lead.trigger_url,
      lead.trigger_days_left, lead.similar_count, lead.desk_slug,
      lead.qualification_score, lead.qualification_reasons, lead.status,
    ],
  );
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  if (!pool) return;
  await pool.query(`UPDATE outbound_leads SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
}

export async function getLeadsByStatus(status: LeadStatus, limit = 50): Promise<OutboundLead[]> {
  if (!pool) return [];
  const r = await pool.query(
    `SELECT * FROM outbound_leads WHERE status = $1 ORDER BY qualification_score DESC, created_at ASC LIMIT $2`,
    [status, limit],
  );
  return r.rows;
}

export async function getLeadById(id: string): Promise<OutboundLead | null> {
  if (!pool) return null;
  const r = await pool.query(`SELECT * FROM outbound_leads WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function getLeadsPaginated(opts: {
  status?: LeadStatus; campaign_id?: string; desk_slug?: string;
  limit?: number; offset?: number;
}): Promise<{ leads: OutboundLead[]; total: number }> {
  if (!pool) return { leads: [], total: 0 };
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (opts.status) { clauses.push(`status = $${idx++}`); params.push(opts.status); }
  if (opts.campaign_id) { clauses.push(`campaign_id = $${idx++}`); params.push(opts.campaign_id); }
  if (opts.desk_slug) { clauses.push(`desk_slug = $${idx++}`); params.push(opts.desk_slug); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const [countR, dataR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM outbound_leads ${where}`, params),
    pool.query(
      `SELECT * FROM outbound_leads ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset],
    ),
  ]);
  return { leads: dataR.rows, total: countR.rows[0]?.total ?? 0 };
}

export async function leadExistsForTrigger(companyNumber: string, triggerUrl: string): Promise<boolean> {
  if (!pool) return false;
  const r = await pool.query(
    `SELECT 1 FROM outbound_leads WHERE company_number = $1 AND trigger_url = $2 LIMIT 1`,
    [companyNumber, triggerUrl],
  );
  return r.rows.length > 0;
}

export async function getTodayLeadCount(): Promise<number> {
  if (!pool) return 0;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM outbound_leads WHERE created_at >= CURRENT_DATE`,
  );
  return r.rows[0]?.c ?? 0;
}

// ── Emails ──

export async function insertEmail(e: Pick<OutboundEmail, "id" | "lead_id" | "subject" | "body_text" | "status">): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO outbound_emails (id, lead_id, subject, body_text, status) VALUES ($1,$2,$3,$4,$5)`,
    [e.id, e.lead_id, e.subject, e.body_text, e.status],
  );
}

export async function updateEmailSent(id: string, gmailMessageId: string, gmailThreadId: string): Promise<void> {
  if (!pool) return;
  await pool.query(
    `UPDATE outbound_emails SET status = 'sent', gmail_message_id = $2, gmail_thread_id = $3, sent_at = now() WHERE id = $1`,
    [id, gmailMessageId, gmailThreadId],
  );
}

export async function updateEmailStatus(id: string, status: EmailStatus): Promise<void> {
  if (!pool) return;
  await pool.query(`UPDATE outbound_emails SET status = $2 WHERE id = $1`, [id, status]);
}

export async function getPendingEmails(limit = 10): Promise<OutboundEmail[]> {
  if (!pool) return [];
  const r = await pool.query(
    `SELECT e.* FROM outbound_emails e
     JOIN outbound_leads l ON e.lead_id = l.id
     WHERE e.status = 'approved' AND l.status = 'approved'
     ORDER BY e.created_at ASC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

export async function getEmailsForLead(leadId: string): Promise<OutboundEmail[]> {
  if (!pool) return [];
  const r = await pool.query(`SELECT * FROM outbound_emails WHERE lead_id = $1 ORDER BY created_at ASC`, [leadId]);
  return r.rows;
}

export async function getTodaySentCount(): Promise<number> {
  if (!pool) return 0;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM outbound_emails WHERE status = 'sent' AND sent_at >= CURRENT_DATE`,
  );
  return r.rows[0]?.c ?? 0;
}

export async function getSentEmailByThreadId(threadId: string): Promise<OutboundEmail | null> {
  if (!pool) return null;
  const r = await pool.query(`SELECT * FROM outbound_emails WHERE gmail_thread_id = $1 LIMIT 1`, [threadId]);
  return r.rows[0] ?? null;
}

// ── Replies ──

export async function insertReply(r: Pick<OutboundReply, "id" | "email_id" | "lead_id" | "gmail_message_id" | "classification" | "confidence" | "raw_snippet">): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO outbound_replies (id, email_id, lead_id, gmail_message_id, classification, confidence, raw_snippet)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [r.id, r.email_id, r.lead_id, r.gmail_message_id, r.classification, r.confidence, r.raw_snippet],
  );
}

export async function getUnhandledReplies(): Promise<OutboundReply[]> {
  if (!pool) return [];
  const r = await pool.query(`SELECT * FROM outbound_replies WHERE handled = FALSE ORDER BY classified_at ASC`);
  return r.rows;
}

export async function markReplyHandled(id: string): Promise<void> {
  if (!pool) return;
  await pool.query(`UPDATE outbound_replies SET handled = TRUE WHERE id = $1`, [id]);
}

export async function replyExistsForMessage(gmailMessageId: string): Promise<boolean> {
  if (!pool) return false;
  const r = await pool.query(`SELECT 1 FROM outbound_replies WHERE gmail_message_id = $1 LIMIT 1`, [gmailMessageId]);
  return r.rows.length > 0;
}

// ── Suppressions ──

export async function insertSuppression(s: Pick<OutboundSuppression, "id" | "email" | "domain" | "reason">): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO outbound_suppressions (id, email, domain, reason) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
    [s.id, s.email ?? null, s.domain ?? null, s.reason],
  );
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  if (!pool) return false;
  const r = await pool.query(`SELECT 1 FROM outbound_suppressions WHERE email = $1 LIMIT 1`, [email]);
  return r.rows.length > 0;
}

export async function isDomainSuppressed(domain: string): Promise<boolean> {
  if (!pool) return false;
  const r = await pool.query(`SELECT 1 FROM outbound_suppressions WHERE domain = $1 LIMIT 1`, [domain]);
  return r.rows.length > 0;
}

export async function getSuppressions(limit = 100, offset = 0): Promise<OutboundSuppression[]> {
  if (!pool) return [];
  const r = await pool.query(
    `SELECT * FROM outbound_suppressions ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return r.rows;
}

// ── Daily Reports ──

export async function insertDailyReport(report: OutboundDailyReport): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO outbound_daily_reports (id, report_date, metrics, responders)
     VALUES ($1, $2, $3, $4) ON CONFLICT (report_date) DO UPDATE SET metrics = $3, responders = $4`,
    [report.id, report.report_date, JSON.stringify(report.metrics), JSON.stringify(report.responders)],
  );
}

export async function getRecentReports(limit = 14): Promise<OutboundDailyReport[]> {
  if (!pool) return [];
  const r = await pool.query(
    `SELECT * FROM outbound_daily_reports ORDER BY report_date DESC LIMIT $1`,
    [limit],
  );
  return r.rows.map(row => ({
    ...row,
    metrics: typeof row.metrics === "string" ? JSON.parse(row.metrics) : row.metrics,
    responders: typeof row.responders === "string" ? JSON.parse(row.responders) : row.responders,
  }));
}

export async function getTodayStats(): Promise<{
  leads_generated: number;
  leads_qualified: number;
  emails_sent: number;
  replies: number;
  positive_replies: number;
}> {
  if (!pool) return { leads_generated: 0, leads_qualified: 0, emails_sent: 0, replies: 0, positive_replies: 0 };

  const [leads, qualified, sent, replies, positive] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM outbound_leads WHERE created_at >= CURRENT_DATE`),
    pool.query(`SELECT COUNT(*)::int AS c FROM outbound_leads WHERE created_at >= CURRENT_DATE AND qualification_score >= 40`),
    pool.query(`SELECT COUNT(*)::int AS c FROM outbound_emails WHERE sent_at >= CURRENT_DATE AND status = 'sent'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM outbound_replies WHERE classified_at >= CURRENT_DATE`),
    pool.query(`SELECT COUNT(*)::int AS c FROM outbound_replies WHERE classified_at >= CURRENT_DATE AND classification IN ('interested','send_info')`),
  ]);

  return {
    leads_generated: leads.rows[0]?.c ?? 0,
    leads_qualified: qualified.rows[0]?.c ?? 0,
    emails_sent: sent.rows[0]?.c ?? 0,
    replies: replies.rows[0]?.c ?? 0,
    positive_replies: positive.rows[0]?.c ?? 0,
  };
}

// ── Extended stats for full admin dashboard ──

export async function getAllTimeStats(): Promise<{
  total_leads: number;
  total_sent: number;
  total_replies: number;
  total_positive: number;
  total_bounced: number;
  total_suppressed: number;
  reply_rate: number;
  positive_rate: number;
}> {
  if (!pool) return { total_leads: 0, total_sent: 0, total_replies: 0, total_positive: 0, total_bounced: 0, total_suppressed: 0, reply_rate: 0, positive_rate: 0 };
  const [leads, sent, replies, positive, bounced, suppressed] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM outbound_leads`),
    pool.query(`SELECT COUNT(*)::int AS c FROM outbound_emails WHERE status = 'sent'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM outbound_replies`),
    pool.query(`SELECT COUNT(*)::int AS c FROM outbound_replies WHERE classification IN ('interested','send_info')`),
    pool.query(`SELECT COUNT(*)::int AS c FROM outbound_emails WHERE status = 'bounced'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM outbound_suppressions`),
  ]);
  const s = sent.rows[0]?.c ?? 0;
  const r = replies.rows[0]?.c ?? 0;
  const p = positive.rows[0]?.c ?? 0;
  return {
    total_leads: leads.rows[0]?.c ?? 0,
    total_sent: s,
    total_replies: r,
    total_positive: p,
    total_bounced: bounced.rows[0]?.c ?? 0,
    total_suppressed: suppressed.rows[0]?.c ?? 0,
    reply_rate: s > 0 ? Math.round((r / s) * 100) : 0,
    positive_rate: s > 0 ? Math.round((p / s) * 100) : 0,
  };
}

export async function getLeadsByDesk(): Promise<Array<{ desk_slug: string; count: number }>> {
  if (!pool) return [];
  const r = await pool.query(
    `SELECT COALESCE(desk_slug, 'unassigned') AS desk_slug, COUNT(*)::int AS count
     FROM outbound_leads GROUP BY desk_slug ORDER BY count DESC`,
  );
  return r.rows;
}

export async function getLeadStatusBreakdown(): Promise<Array<{ status: string; count: number }>> {
  if (!pool) return [];
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count FROM outbound_leads GROUP BY status ORDER BY count DESC`,
  );
  return r.rows;
}

export async function getRecentEmails(limit = 30): Promise<Array<OutboundEmail & { company_name: string; contact_email: string | null }>> {
  if (!pool) return [];
  const r = await pool.query(
    `SELECT e.*, l.company_name, l.contact_email
     FROM outbound_emails e JOIN outbound_leads l ON e.lead_id = l.id
     ORDER BY e.created_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

export async function getSendQueueCount(): Promise<number> {
  if (!pool) return 0;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM outbound_emails e
     JOIN outbound_leads l ON e.lead_id = l.id
     WHERE e.status = 'approved' AND l.status = 'approved'`,
  );
  return r.rows[0]?.c ?? 0;
}

export async function getReplyClassificationBreakdown(): Promise<Array<{ classification: string; count: number }>> {
  if (!pool) return [];
  const r = await pool.query(
    `SELECT classification, COUNT(*)::int AS count FROM outbound_replies GROUP BY classification ORDER BY count DESC`,
  );
  return r.rows;
}
