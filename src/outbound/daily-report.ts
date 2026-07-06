import crypto from "crypto";
import { OUTBOUND_REPORT_EMAIL } from "../config.js";
import { getTodayStats, getRecentReports, insertDailyReport } from "./db.js";
import { sendOutboundEmail } from "./gmail.js";
import { pool } from "../config.js";
import type { OutboundDailyReport, DailyReportResponder, ReplyClassification } from "./types.js";

async function getTodayResponders(): Promise<DailyReportResponder[]> {
  if (!pool) return [];
  const r = await pool.query(`
    SELECT l.company_name, r.raw_snippet, r.classification
    FROM outbound_replies r
    JOIN outbound_leads l ON r.lead_id = l.id
    WHERE r.classified_at >= CURRENT_DATE
    ORDER BY r.classified_at DESC
    LIMIT 20
  `);

  const nextSteps: Record<ReplyClassification, string> = {
    interested: "Schedule call",
    send_info: "Send preview pack",
    not_now: "Follow up in 30 days",
    wrong_person: "Ask for right contact",
    unsubscribe: "Suppressed",
    angry: "Suppressed — do not contact",
    ooo: "Retry after return date",
    bounce: "Mark email invalid",
  };

  return r.rows.map(row => ({
    company: row.company_name,
    reply_snippet: (row.raw_snippet || "").slice(0, 100),
    classification: row.classification as ReplyClassification,
    next_step: nextSteps[row.classification as ReplyClassification] || "Review manually",
  }));
}

async function getBestDesk(): Promise<string | null> {
  if (!pool) return null;
  const r = await pool.query(`
    SELECT desk_slug, COUNT(*)::int AS c
    FROM outbound_replies
    WHERE classified_at >= CURRENT_DATE AND classification IN ('interested', 'send_info')
    GROUP BY desk_slug
    ORDER BY c DESC LIMIT 1
  `);
  return r.rows[0]?.desk_slug ?? null;
}

export async function generateAndSendDailyReport(): Promise<void> {
  const stats = await getTodayStats();
  const responders = await getTodayResponders();
  const bestDesk = await getBestDesk();

  const today = new Date().toISOString().split("T")[0];

  const report: OutboundDailyReport = {
    id: crypto.randomUUID(),
    report_date: today,
    metrics: {
      leads_generated: stats.leads_generated,
      leads_qualified: stats.leads_qualified,
      emails_sent: stats.emails_sent,
      bounces: 0,
      replies_total: stats.replies,
      replies_positive: stats.positive_replies,
      meetings_booked: 0,
      best_desk: bestDesk,
      best_hook: null,
    },
    responders,
    created_at: new Date().toISOString(),
  };

  await insertDailyReport(report);

  if (!OUTBOUND_REPORT_EMAIL) {
    console.log("[outbound] no report email configured, skipping send");
    return;
  }

  const responderLines = responders.length > 0
    ? responders.map(r =>
      `  ${r.company}\n    Reply: ${r.reply_snippet}\n    Status: ${r.classification}\n    Next: ${r.next_step}`
    ).join("\n\n")
    : "  No replies today.";

  const emailBody = [
    `AtlasRevenue Outbound Report — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`,
    ``,
    `─────────────────────────────────`,
    ``,
    `METRICS`,
    ``,
    `  Leads generated:    ${stats.leads_generated}`,
    `  Leads qualified:    ${stats.leads_qualified}`,
    `  Emails sent:        ${stats.emails_sent}`,
    `  Replies:            ${stats.replies}`,
    `  Positive replies:   ${stats.positive_replies}`,
    bestDesk ? `  Best desk:          ${bestDesk}` : null,
    ``,
    `─────────────────────────────────`,
    ``,
    `RESPONDERS`,
    ``,
    responderLines,
    ``,
    `─────────────────────────────────`,
    ``,
    stats.emails_sent > 0
      ? `Reply rate: ${((stats.replies / stats.emails_sent) * 100).toFixed(1)}%`
      : `No emails sent today.`,
    ``,
    `— AtlasRevenue Outbound Engine`,
  ].filter(l => l !== null).join("\n");

  await sendOutboundEmail({
    to: OUTBOUND_REPORT_EMAIL,
    subject: `Outbound Report — ${stats.replies} replies, ${stats.emails_sent} sent`,
    bodyText: emailBody,
  });

  console.log("[outbound] daily report sent");
}
