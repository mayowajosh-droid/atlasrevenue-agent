import crypto from "crypto";
import type { Express } from "express";
import { asyncRoute, ADMIN_TOKEN } from "../config.js";
import {
  getLeadsPaginated, getLeadById, updateLeadStatus, getEmailsForLead,
  getActiveCampaigns, insertCampaign, updateCampaignStatus, updateCampaignStats,
  getSuppressions, insertSuppression, getRecentReports, getTodayStats,
  getUnhandledReplies, markReplyHandled, getPendingEmails,
} from "./db.js";
import { generateDailyLeads, bulkImportProspects, enrichLeadsFromSupplierGraph } from "./lead-generator.js";
import { composeEmail } from "./email-composer.js";
import { getGmailAuthUrl, exchangeCodeForToken, isGmailConfigured } from "./gmail.js";
import { discoverRealSupplierContact } from "./supplier-discovery.js";
import { renderAdminOutboundPage } from "./admin-page.js";
import type { LeadStatus, CampaignStatus } from "./types.js";

function requireAdmin(req: any, res: any, next: any) {
  const token = req.header("x-admin-token") || String(req.query.token || "");
  if (token !== ADMIN_TOKEN) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

export function registerOutboundRoutes(app: Express): void {

  // ── Admin HTML page ──

  app.get("/admin/outbound", requireAdmin, asyncRoute(async (req, res) => {
    const html = await renderAdminOutboundPage(String(req.query.token || ""));
    res.type("html").send(html);
  }));

  // ── Gmail OAuth setup ──

  app.get("/admin/gmail-setup", requireAdmin, asyncRoute(async (_req, res) => {
    const url = getGmailAuthUrl();
    res.redirect(url);
  }));

  app.get("/admin/gmail-callback", asyncRoute(async (req, res) => {
    const code = String(req.query.code || "");
    if (!code) { res.status(400).send("Missing code"); return; }
    await exchangeCodeForToken(code);
    res.redirect(`/admin/outbound?token=${encodeURIComponent(ADMIN_TOKEN)}`);
  }));

  // ── Leads API ──

  app.get("/api/outbound/leads", requireAdmin, asyncRoute(async (req, res) => {
    const result = await getLeadsPaginated({
      status: req.query.status as LeadStatus | undefined,
      campaign_id: req.query.campaign_id as string | undefined,
      desk_slug: req.query.desk_slug as string | undefined,
      limit: Number(req.query.limit || 50),
      offset: Number(req.query.offset || 0),
    });
    res.json(result);
  }));

  app.get("/api/outbound/leads/:id", requireAdmin, asyncRoute(async (req, res) => {
    const lead = await getLeadById(req.params.id);
    if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
    const emails = await getEmailsForLead(lead.id);
    res.json({ lead, emails });
  }));

  app.post("/api/outbound/leads/:id/approve", requireAdmin, asyncRoute(async (req, res) => {
    await updateLeadStatus(req.params.id, "approved");
    // Auto-compose email for approved lead
    const lead = await getLeadById(req.params.id);
    if (lead) {
      composeEmail(lead).catch(err => console.error("[outbound] compose on approve failed:", err));
    }
    res.json({ ok: true });
  }));

  app.post("/api/outbound/leads/:id/suppress", requireAdmin, asyncRoute(async (req, res) => {
    await updateLeadStatus(req.params.id, "suppressed");
    res.json({ ok: true });
  }));

  app.post("/api/outbound/leads/bulk-approve", requireAdmin, asyncRoute(async (req, res) => {
    const ids: string[] = req.body?.ids || [];
    for (const id of ids) {
      await updateLeadStatus(id, "approved");
      const lead = await getLeadById(id);
      if (lead) composeEmail(lead).catch(() => {});
    }
    res.json({ ok: true, approved: ids.length });
  }));

  // ── Campaigns API ──

  app.get("/api/outbound/campaigns", requireAdmin, asyncRoute(async (_req, res) => {
    const campaigns = await getActiveCampaigns();
    res.json(campaigns);
  }));

  app.post("/api/outbound/campaigns", requireAdmin, asyncRoute(async (req, res) => {
    const { name, desk_slug } = req.body || {};
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const id = crypto.randomUUID();
    await insertCampaign({ id, name, desk_slug: desk_slug || null });
    res.json({ id, name });
  }));

  app.post("/api/outbound/campaigns/:id/pause", requireAdmin, asyncRoute(async (req, res) => {
    await updateCampaignStatus(req.params.id, "paused");
    res.json({ ok: true });
  }));

  // ── Replies API ──

  app.get("/api/outbound/replies", requireAdmin, asyncRoute(async (_req, res) => {
    const replies = await getUnhandledReplies();
    res.json(replies);
  }));

  app.post("/api/outbound/replies/:id/handle", requireAdmin, asyncRoute(async (req, res) => {
    await markReplyHandled(req.params.id);
    res.json({ ok: true });
  }));

  // ── Suppressions API ──

  app.get("/api/outbound/suppressions", requireAdmin, asyncRoute(async (req, res) => {
    const suppressions = await getSuppressions(
      Number(req.query.limit || 100),
      Number(req.query.offset || 0),
    );
    res.json(suppressions);
  }));

  app.post("/api/outbound/suppressions", requireAdmin, asyncRoute(async (req, res) => {
    const { email, domain, reason } = req.body || {};
    if (!email && !domain) { res.status(400).json({ error: "email or domain required" }); return; }
    await insertSuppression({
      id: crypto.randomUUID(),
      email: email || null,
      domain: domain || null,
      reason: reason || "manual",
    });
    res.json({ ok: true });
  }));

  // ── Reports API ──

  app.get("/api/outbound/reports", requireAdmin, asyncRoute(async (_req, res) => {
    const reports = await getRecentReports(14);
    res.json(reports);
  }));

  app.get("/api/outbound/stats", requireAdmin, asyncRoute(async (_req, res) => {
    const stats = await getTodayStats();
    const gmailConnected = await isGmailConfigured();
    res.json({ ...stats, gmail_connected: gmailConnected });
  }));

  // ── Manual triggers ──

  app.post("/api/outbound/generate", requireAdmin, asyncRoute(async (req, res) => {
    const campaignId = req.body?.campaign_id as string | undefined;
    const result = await generateDailyLeads(campaignId);
    res.json(result);
  }));

  app.post("/api/outbound/bulk-import", requireAdmin, asyncRoute(async (_req, res) => {
    const result = await bulkImportProspects();
    res.json(result);
  }));

  app.post("/api/outbound/enrich", requireAdmin, asyncRoute(async (_req, res) => {
    // Fire-and-forget: enrichment can take several minutes with real supplier
    // discovery. Railway edge cuts requests at ~60s, so respond immediately and
    // let the work run in the background. Progress lands in the DB — refresh
    // the leads table to watch rows populate.
    res.json({ status: "started", note: "Enrichment running in background. Refresh the leads table to see progress." });
    void enrichLeadsFromSupplierGraph()
      .then(result => console.log("[outbound] enrichment complete:", result))
      .catch(err => console.error("[outbound] enrich error:", err));
  }));

  app.get("/api/outbound/discover-test", requireAdmin, asyncRoute(async (req, res) => {
    const name = String(req.query.name || "Kent Construction Consultants Limited");
    const started = Date.now();
    try {
      const found = await discoverRealSupplierContact(name);
      res.json({ name, found, elapsedMs: Date.now() - started });
    } catch (err: any) {
      res.json({ name, error: err.message, stack: err.stack?.split("\n").slice(0, 5), elapsedMs: Date.now() - started });
    }
  }));

  // Discover a small batch inline (sync) and write results directly to DB.
  // Bounded to N leads and returns actual write outcome — used to prove the
  // full happy-path works without the background-void indirection.
  app.post("/api/outbound/discover-batch", requireAdmin, asyncRoute(async (req, res) => {
    const { pool } = await import("../config.js");
    if (!pool) { res.status(500).json({ error: "no db" }); return; }
    const limit = Math.min(Number(req.query.limit || 5), 20);
    const rows = await pool.query<{ id: string; company_name: string }>(
      `SELECT id, company_name FROM outbound_leads
       WHERE status IN ('qualified','approved') AND website IS NULL AND contact_email IS NULL
       ORDER BY qualification_score DESC LIMIT $1`, [limit]);
    const started = Date.now();
    const results: any[] = [];
    for (const lead of rows.rows) {
      try {
        const found = await discoverRealSupplierContact(lead.company_name);
        const sets: string[] = [];
        const vals: unknown[] = [];
        let p = 1;
        if (found.website) { sets.push(`website = $${p++}`); vals.push(found.website); }
        if (found.email) { sets.push(`contact_email = $${p++}`); vals.push(found.email); }
        if (found.contact_name) { sets.push(`contact_name = $${p++}`); vals.push(found.contact_name); }
        if (found.contact_role) { sets.push(`contact_role = $${p++}`); vals.push(found.contact_role); }
        let updated = false;
        if (sets.length > 0) {
          sets.push(`updated_at = now()`);
          vals.push(lead.id);
          await pool.query(`UPDATE outbound_leads SET ${sets.join(", ")} WHERE id = $${p}`, vals);
          updated = true;
        }
        results.push({ company: lead.company_name, found, updated });
      } catch (err: any) {
        results.push({ company: lead.company_name, error: err.message });
      }
    }
    res.json({ count: results.length, elapsedMs: Date.now() - started, results });
  }));

  console.log("[outbound] routes registered");
}
