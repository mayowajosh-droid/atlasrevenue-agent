import { escapeHtml } from "../lib/intel.js";
import {
  getLeadsPaginated, getTodayStats, getActiveCampaigns, getRecentReports,
  getUnhandledReplies, getSuppressions, getAllTimeStats, getLeadsByDesk,
  getLeadStatusBreakdown, getRecentEmails, getSendQueueCount, getPendingEmails,
  getReplyClassificationBreakdown,
} from "./db.js";
import { isGmailConfigured } from "./gmail.js";
import { OUTBOUND_ENABLED, OUTBOUND_DAILY_LIMIT } from "../config.js";

function adminCss(): string {
  return `
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Spline+Sans+Mono:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --brand:#B4924E;--brand-dim:rgba(180,146,78,.1);--brand-mid:rgba(180,146,78,.28);--brand-border:rgba(180,146,78,.32);
  --base:#F4F1E9;--surface:#FFFFFF;--surface-2:#FAF8F4;--surface-3:#F2EDE5;
  --border:#E5DED4;--border-2:#CEC5B8;
  --text:#1A1208;--muted:#7D6B50;--muted-2:#A8957C;
  --green:#166534;--green-bg:rgba(22,101,52,.08);--green-border:rgba(22,101,52,.22);
  --red:#B91C1C;--red-bg:rgba(185,28,28,.07);--red-border:rgba(185,28,28,.2);
  --amber:#92400E;--amber-bg:rgba(146,64,14,.08);--amber-border:rgba(146,64,14,.2);
  --blue:#1D4ED8;--blue-bg:rgba(29,78,216,.08);--blue-border:rgba(29,78,216,.2);
  --sg:'Space Grotesk',system-ui,sans-serif;
  --mono:'Spline Sans Mono','SF Mono',ui-monospace,monospace;
  --inter:'Inter',system-ui,sans-serif;
}
html,body{height:100%;background:var(--base);color:var(--text);font-family:var(--inter);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:var(--brand);text-decoration:none}
a:hover{text-decoration:underline}
.shell{display:grid;grid-template-columns:252px 1fr;min-height:100vh}
.sidebar{background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto}
.sb-brand{padding:20px 20px 16px;background:linear-gradient(145deg,rgba(180,146,78,.06) 0%,rgba(255,255,255,0) 65%);border-bottom:1px solid var(--border)}
.sb-logo-row{display:flex;align-items:center;gap:9px}
.sb-dot{width:8px;height:8px;border-radius:50%;background:var(--brand);box-shadow:0 0 8px rgba(180,146,78,.55)}
.sb-logo{font-family:var(--sg);font-size:17px;font-weight:700;letter-spacing:-.02em}
.sb-tag{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-top:8px}
.sb-nav{padding:12px 0;flex:1}
.sb-group{font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-2);padding:14px 20px 4px}
.sb-link{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;font-family:var(--inter);font-size:13px;font-weight:500;color:var(--muted);text-decoration:none!important;border-left:2px solid transparent;margin:1px 0}
.sb-link:hover{color:var(--text);background:var(--surface-2);text-decoration:none}
.sb-link.active{color:var(--brand);border-left-color:var(--brand);background:var(--brand-dim)}
.sb-count{font-family:var(--mono);font-size:10px;background:var(--base);border:1px solid var(--border);padding:1px 7px;border-radius:20px;color:var(--muted)}
.topbar{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 32px 12px;border-bottom:1px solid var(--border);background:var(--surface)}
.topbar-crumb{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted-2);margin-bottom:4px}
.topbar-crumb span{margin:0 4px;opacity:.5}
.topbar-title{font-family:var(--sg);font-size:22px;font-weight:700;letter-spacing:-.02em}
.topbar-right{display:flex;gap:10px;align-items:center}
.content{padding:24px 32px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:28px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px}
.card-label{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted-2);margin-bottom:6px}
.card-value{font-family:var(--sg);font-size:28px;font-weight:700;letter-spacing:-.03em}
.card-sub{font-family:var(--inter);font-size:11px;color:var(--muted);margin-top:4px}
.section{margin-bottom:32px}
.section-title{font-family:var(--sg);font-size:15px;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.section-desc{font-size:12px;color:var(--muted);margin-bottom:12px}
.tbl{width:100%;border-collapse:collapse;font-size:12px}
.tbl th{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted-2);padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);background:var(--surface-2)}
.tbl td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:top}
.tbl tr:hover td{background:var(--surface-2)}
.badge{display:inline-block;font-family:var(--mono);font-size:10px;padding:2px 8px;border-radius:4px;letter-spacing:.04em}
.badge-green{background:var(--green-bg);color:var(--green);border:1px solid var(--green-border)}
.badge-amber{background:var(--amber-bg);color:var(--amber);border:1px solid var(--amber-border)}
.badge-red{background:var(--red-bg);color:var(--red);border:1px solid var(--red-border)}
.badge-blue{background:var(--blue-bg);color:var(--blue);border:1px solid var(--blue-border)}
.badge-muted{background:var(--surface-3);color:var(--muted);border:1px solid var(--border)}
.btn{font-family:var(--inter);font-size:12px;font-weight:500;padding:5px 14px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;text-decoration:none!important}
.btn:hover{background:var(--surface-2)}
.btn-brand{background:var(--brand);color:#fff;border-color:var(--brand)}
.btn-brand:hover{opacity:.9}
.btn-sm{font-size:10px;padding:3px 10px}
.btn-red{background:var(--red-bg);color:var(--red);border-color:var(--red-border)}
.status-bar{display:flex;gap:12px;align-items:center;padding:10px 18px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:20px;font-size:12px;flex-wrap:wrap}
.status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.status-dot.on{background:var(--green)}
.status-dot.off{background:var(--red)}
.tabs{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:24px}
.tab{padding:10px 20px;font-family:var(--inter);font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;background:none;border-top:0;border-left:0;border-right:0}
.tab:hover{color:var(--text)}
.tab.active{color:var(--brand);border-bottom-color:var(--brand)}
.tab-panel{display:none}
.tab-panel.active{display:block}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}
.mini-bar{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.mini-bar-label{font-family:var(--mono);font-size:10px;color:var(--muted-2);min-width:90px;text-transform:uppercase;letter-spacing:.06em}
.mini-bar-track{flex:1;height:6px;background:var(--surface-3);border-radius:3px;overflow:hidden}
.mini-bar-fill{height:100%;border-radius:3px;background:var(--brand)}
.mini-bar-val{font-family:var(--mono);font-size:11px;min-width:30px;text-align:right}
.email-preview{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px}
.email-preview-subject{font-family:var(--sg);font-size:14px;font-weight:600;margin-bottom:4px}
.email-preview-meta{font-family:var(--mono);font-size:10px;color:var(--muted-2);margin-bottom:10px;display:flex;gap:12px}
.email-preview-body{font-size:12px;line-height:1.6;color:var(--text);white-space:pre-wrap;max-height:120px;overflow:hidden;position:relative}
.email-preview-body.expanded{max-height:none}
.email-expand{font-size:11px;color:var(--brand);cursor:pointer;margin-top:4px;display:inline-block}
.empty{color:var(--muted);font-size:12px;padding:20px 0}
@media(max-width:900px){
  .shell{grid-template-columns:1fr}
  .sidebar{display:none}
  .cards{grid-template-columns:repeat(2,1fr)}
  .grid-2,.grid-3{grid-template-columns:1fr}
}
</style>`;
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    qualified: "badge-blue", approved: "badge-amber", composing: "badge-amber",
    ready: "badge-green", sent: "badge-green", replied: "badge-green",
    opted_out: "badge-muted", bounced: "badge-red", suppressed: "badge-muted",
    draft: "badge-muted", active: "badge-green", paused: "badge-amber", completed: "badge-muted",
  };
  return `<span class="badge ${map[status] || "badge-muted"}">${escapeHtml(status)}</span>`;
}

function classificationBadge(c: string): string {
  const map: Record<string, string> = {
    interested: "badge-green", send_info: "badge-green", not_now: "badge-muted",
    wrong_person: "badge-amber", unsubscribe: "badge-red", angry: "badge-red",
    ooo: "badge-amber", bounce: "badge-red",
  };
  return `<span class="badge ${map[c] || "badge-muted"}">${escapeHtml(c)}</span>`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtMoney(pence: number | null): string {
  if (!pence) return "—";
  const pounds = pence / 100;
  if (pounds >= 1_000_000) return `£${(pounds / 1_000_000).toFixed(1)}m`;
  if (pounds >= 1_000) return `£${(pounds / 1_000).toFixed(0)}k`;
  return `£${pounds.toLocaleString()}`;
}

export async function renderAdminOutboundPage(token: string): Promise<string> {
  const [
    todayStats, allStats, gmailConnected, campaigns, recentReports,
    unhandledReplies, leadsResult, suppressions, leadsByDesk,
    statusBreakdown, recentEmails, sendQueueCount, pendingEmails,
    replyBreakdown,
  ] = await Promise.all([
    getTodayStats(),
    getAllTimeStats(),
    isGmailConfigured(),
    getActiveCampaigns(),
    getRecentReports(14),
    getUnhandledReplies(),
    getLeadsPaginated({ limit: 50, offset: 0 }),
    getSuppressions(50, 0),
    getLeadsByDesk(),
    getLeadStatusBreakdown(),
    getRecentEmails(30),
    getSendQueueCount(),
    getPendingEmails(20),
    getReplyClassificationBreakdown(),
  ]);

  const t = encodeURIComponent(token);
  const maxDesk = leadsByDesk.length > 0 ? Math.max(...leadsByDesk.map(d => d.count)) : 1;
  const maxStatus = statusBreakdown.length > 0 ? Math.max(...statusBreakdown.map(s => s.count)) : 1;
  const maxReplyClass = replyBreakdown.length > 0 ? Math.max(...replyBreakdown.map(r => r.count)) : 1;

  const leadRows = leadsResult.leads.map((l, i) => `
    <tr>
      <td style="font-family:var(--mono);color:var(--muted)">${i + 1}</td>
      <td><strong>${escapeHtml(l.company_name)}</strong><br><span style="color:var(--muted);font-size:11px">${escapeHtml(l.address || "")}</span></td>
      <td style="font-size:11px">${escapeHtml(l.trigger_title.slice(0, 60))}${l.trigger_title.length > 60 ? "…" : ""}<br><span style="color:var(--muted)">${escapeHtml(l.trigger_buyer)}</span></td>
      <td style="font-family:var(--mono)">${fmtMoney(l.trigger_value)}</td>
      <td style="font-family:var(--mono)">${l.trigger_days_left !== null ? `${l.trigger_days_left}d` : "—"}</td>
      <td style="font-family:var(--mono);font-weight:600">${l.qualification_score}</td>
      <td>${statusBadge(l.status)}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmtDate(l.created_at)}</td>
      <td style="white-space:nowrap">
        ${l.status === "qualified" ? `<button class="btn btn-sm btn-brand" onclick="approveLeadFn('${escapeHtml(l.id)}')">Approve</button> ` : ""}
        ${["qualified", "approved", "ready"].includes(l.status) ? `<button class="btn btn-sm btn-red" onclick="suppressLeadFn('${escapeHtml(l.id)}')">Suppress</button>` : ""}
      </td>
    </tr>
  `).join("");

  const replyRows = unhandledReplies.slice(0, 20).map(r => `
    <tr>
      <td style="font-family:var(--mono);font-size:11px">${escapeHtml(r.lead_id.slice(0, 8))}</td>
      <td style="font-size:11px;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.raw_snippet.slice(0, 120))}</td>
      <td>${classificationBadge(r.classification)}</td>
      <td style="font-family:var(--mono)">${r.confidence}%</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmtDate(r.classified_at)}</td>
      <td><button class="btn btn-sm" onclick="handleReplyFn('${escapeHtml(r.id)}')">Handle</button></td>
    </tr>
  `).join("");

  const emailRows = recentEmails.map(e => `
    <div class="email-preview">
      <div class="email-preview-subject">${escapeHtml(e.subject)}</div>
      <div class="email-preview-meta">
        <span>To: ${escapeHtml(e.company_name)}${e.contact_email ? ` &lt;${escapeHtml(e.contact_email)}&gt;` : ""}</span>
        <span>${statusBadge(e.status)}</span>
        <span>${e.sent_at ? fmtDate(e.sent_at) : fmtDate(e.created_at)}</span>
      </div>
      <div class="email-preview-body" id="ep-${escapeHtml(e.id)}">${escapeHtml(e.body_text)}</div>
      <span class="email-expand" onclick="toggleExpand('ep-${escapeHtml(e.id)}')">Show more</span>
    </div>
  `).join("");

  const campaignRows = campaigns.map(c => `
    <tr>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td style="font-family:var(--mono);font-size:11px">${escapeHtml(c.desk_slug || "all")}</td>
      <td>${statusBadge(c.status)}</td>
      <td style="font-family:var(--mono)">${c.total_leads}</td>
      <td style="font-family:var(--mono)">${c.total_sent}</td>
      <td style="font-family:var(--mono)">${c.total_replies}</td>
      <td style="font-family:var(--mono);color:var(--green)">${c.total_positive}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmtDate(c.created_at)}</td>
      <td>
        ${c.status === "active" ? `<button class="btn btn-sm" onclick="pauseCampaignFn('${escapeHtml(c.id)}')">Pause</button>` : ""}
      </td>
    </tr>
  `).join("");

  const reportRows = recentReports.map(r => {
    const m = r.metrics;
    return `
    <tr>
      <td style="font-family:var(--mono)">${fmtDate(r.report_date)}</td>
      <td style="font-family:var(--mono)">${m.leads_generated}</td>
      <td style="font-family:var(--mono)">${m.leads_qualified}</td>
      <td style="font-family:var(--mono)">${m.emails_sent}</td>
      <td style="font-family:var(--mono)">${m.replies_total}</td>
      <td style="font-family:var(--mono);color:var(--green);font-weight:600">${m.replies_positive}</td>
      <td style="font-family:var(--mono)">${m.bounces}</td>
      <td style="font-size:11px">${escapeHtml(m.best_desk || "—")}</td>
      <td style="font-size:11px">${escapeHtml(m.best_hook || "—")}</td>
    </tr>`;
  }).join("");

  const responderRows = recentReports.flatMap(r =>
    (r.responders || []).map(resp => `
      <tr>
        <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmtDate(r.report_date)}</td>
        <td><strong>${escapeHtml(resp.company)}</strong></td>
        <td style="font-size:11px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(resp.reply_snippet.slice(0, 80))}</td>
        <td>${classificationBadge(resp.classification)}</td>
        <td style="font-size:11px">${escapeHtml(resp.next_step)}</td>
      </tr>`)
  ).join("");

  const suppressionRows = suppressions.map(s => `
    <tr>
      <td style="font-family:var(--mono);font-size:11px">${escapeHtml(s.email || "—")}</td>
      <td style="font-family:var(--mono);font-size:11px">${escapeHtml(s.domain || "—")}</td>
      <td>${statusBadge(s.reason)}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmtDate(s.created_at)}</td>
    </tr>
  `).join("");

  const queueRows = pendingEmails.map(e => `
    <tr>
      <td style="font-family:var(--mono);font-size:11px">${escapeHtml(e.lead_id.slice(0, 8))}</td>
      <td style="font-size:12px">${escapeHtml(e.subject)}</td>
      <td>${statusBadge(e.status)}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmtDate(e.created_at)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email Marketing — Admin — AtlasRevenue</title>
${adminCss()}
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="sb-brand">
      <div class="sb-logo-row">
        <span class="sb-dot"></span>
        <span class="sb-logo">Atlas<b>Revenue</b></span>
      </div>
      <div class="sb-tag">Outbound Engine</div>
    </div>
    <nav class="sb-nav">
      <div class="sb-group">Navigation</div>
      <a href="/admin/scans?token=${t}" class="sb-link">Command Centre</a>
      <a href="/admin/articles?token=${t}" class="sb-link">Articles</a>
      <div class="sb-group">Ads &amp; Marketing</div>
      <a href="/admin/outbound?token=${t}" class="sb-link active">Email Marketing <span class="sb-count">${leadsResult.total}</span></a>
      <div class="sb-group">Engine</div>
      <a href="#" class="sb-link" onclick="switchTab('overview');return false">Overview</a>
      <a href="#" class="sb-link" onclick="switchTab('leads');return false">Leads <span class="sb-count">${leadsResult.total}</span></a>
      <a href="#" class="sb-link" onclick="switchTab('emails');return false">Emails <span class="sb-count">${recentEmails.length}</span></a>
      <a href="#" class="sb-link" onclick="switchTab('replies');return false">Replies${unhandledReplies.length > 0 ? ` <span class="sb-count" style="background:var(--amber-bg);color:var(--amber);border-color:var(--amber-border)">${unhandledReplies.length}</span>` : ""}</a>
      <a href="#" class="sb-link" onclick="switchTab('campaigns');return false">Campaigns <span class="sb-count">${campaigns.length}</span></a>
      <a href="#" class="sb-link" onclick="switchTab('reports');return false">Daily Reports <span class="sb-count">${recentReports.length}</span></a>
      <a href="#" class="sb-link" onclick="switchTab('queue');return false">Send Queue <span class="sb-count">${sendQueueCount}</span></a>
      <a href="#" class="sb-link" onclick="switchTab('suppressions');return false">Suppressions <span class="sb-count">${suppressions.length}</span></a>
      <a href="#" class="sb-link" onclick="switchTab('analytics');return false">Performance</a>
      <a href="#" class="sb-link" onclick="switchTab('playbook');return false">Playbook</a>
    </nav>
  </aside>
  <div style="min-width:0">
    <div class="topbar">
      <div>
        <div class="topbar-crumb">Admin <span>›</span> Ads &amp; Marketing <span>›</span> <b>Email Marketing</b></div>
        <div class="topbar-title">Outbound Engine</div>
      </div>
      <div class="topbar-right">
        <button class="btn" onclick="generateLeadsFn()">Generate leads</button>
        ${!gmailConnected ? `<a href="/admin/gmail-setup?token=${t}" class="btn btn-brand">Connect Gmail</a>` : ""}
        <a href="/admin/outbound?token=${t}" class="btn">Refresh</a>
      </div>
    </div>

    <div class="content">

      <!-- ═══ STATUS BAR ═══ -->
      <div class="status-bar">
        <span class="status-dot ${OUTBOUND_ENABLED ? "on" : "off"}"></span>
        <span>Sending: <strong>${OUTBOUND_ENABLED ? "Active" : "Paused"}</strong></span>
        <span style="color:var(--muted)">·</span>
        <span>Gmail: <strong>${gmailConnected ? "Connected" : "Not connected"}</strong></span>
        <span style="color:var(--muted)">·</span>
        <span>Daily limit: <strong>${OUTBOUND_DAILY_LIMIT}</strong></span>
        <span style="color:var(--muted)">·</span>
        <span>Campaigns: <strong>${campaigns.length}</strong></span>
        <span style="color:var(--muted)">·</span>
        <span>Queue: <strong>${sendQueueCount}</strong></span>
      </div>

      <!-- ═══ TAB BAR ═══ -->
      <div class="tabs">
        <button class="tab active" onclick="switchTab('overview')">Overview</button>
        <button class="tab" onclick="switchTab('leads')">Leads</button>
        <button class="tab" onclick="switchTab('emails')">Emails</button>
        <button class="tab" onclick="switchTab('replies')">Replies${unhandledReplies.length > 0 ? ` (${unhandledReplies.length})` : ""}</button>
        <button class="tab" onclick="switchTab('campaigns')">Campaigns</button>
        <button class="tab" onclick="switchTab('reports')">Reports</button>
        <button class="tab" onclick="switchTab('queue')">Queue</button>
        <button class="tab" onclick="switchTab('suppressions')">Suppressions</button>
        <button class="tab" onclick="switchTab('analytics')">Performance</button>
        <button class="tab" onclick="switchTab('playbook')">Playbook</button>
      </div>

      <!-- ═══════════════════════════════════════════ -->
      <!-- TAB: OVERVIEW                               -->
      <!-- ═══════════════════════════════════════════ -->
      <div class="tab-panel active" id="panel-overview">

        <div class="section-title">Today</div>
        <div class="cards">
          <div class="card">
            <div class="card-label">Leads Today</div>
            <div class="card-value">${todayStats.leads_generated}</div>
            <div class="card-sub">${todayStats.leads_qualified} qualified</div>
          </div>
          <div class="card">
            <div class="card-label">Sent Today</div>
            <div class="card-value">${todayStats.emails_sent}</div>
            <div class="card-sub">of ${OUTBOUND_DAILY_LIMIT} limit</div>
          </div>
          <div class="card">
            <div class="card-label">Replies Today</div>
            <div class="card-value">${todayStats.replies}</div>
            <div class="card-sub">${todayStats.positive_replies} positive</div>
          </div>
          <div class="card">
            <div class="card-label">Send Queue</div>
            <div class="card-value">${sendQueueCount}</div>
            <div class="card-sub">awaiting send</div>
          </div>
        </div>

        <div class="section-title">All Time</div>
        <div class="cards">
          <div class="card">
            <div class="card-label">Total Pipeline</div>
            <div class="card-value">${allStats.total_leads}</div>
            <div class="card-sub">leads generated</div>
          </div>
          <div class="card">
            <div class="card-label">Total Sent</div>
            <div class="card-value">${allStats.total_sent}</div>
            <div class="card-sub">${allStats.total_bounced} bounced</div>
          </div>
          <div class="card">
            <div class="card-label">Total Replies</div>
            <div class="card-value">${allStats.total_replies}</div>
            <div class="card-sub">${allStats.reply_rate}% reply rate</div>
          </div>
          <div class="card">
            <div class="card-label">Positive Replies</div>
            <div class="card-value" style="color:var(--green)">${allStats.total_positive}</div>
            <div class="card-sub">${allStats.positive_rate}% of sent</div>
          </div>
          <div class="card">
            <div class="card-label">Suppressed</div>
            <div class="card-value">${allStats.total_suppressed}</div>
            <div class="card-sub">emails/domains</div>
          </div>
        </div>

        ${unhandledReplies.length > 0 ? `
        <div class="section">
          <div class="section-title">Unhandled Replies <span class="sb-count" style="background:var(--amber-bg);color:var(--amber);border-color:var(--amber-border)">${unhandledReplies.length}</span></div>
          <div style="overflow-x:auto"><table class="tbl">
            <thead><tr><th>Lead</th><th>Reply</th><th>Classification</th><th>Confidence</th><th>Date</th><th>Action</th></tr></thead>
            <tbody>${replyRows}</tbody>
          </table></div>
        </div>` : ""}

      </div>

      <!-- ═══════════════════════════════════════════ -->
      <!-- TAB: LEADS                                  -->
      <!-- ═══════════════════════════════════════════ -->
      <div class="tab-panel" id="panel-leads">
        <div class="section">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div class="section-title" style="margin-bottom:0">Lead Pipeline <span class="sb-count">${leadsResult.total}</span></div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm btn-brand" onclick="bulkApproveFn()">Bulk approve qualified</button>
              <button class="btn btn-sm" onclick="generateLeadsFn()">Generate leads</button>
            </div>
          </div>
          ${leadsResult.leads.length === 0
            ? `<p class="empty">No leads yet. Click "Generate leads" to start the engine.</p>`
            : `<div style="overflow-x:auto"><table class="tbl">
              <thead><tr><th>#</th><th>Company</th><th>Trigger Contract</th><th>Value</th><th>Expires</th><th>Score</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
              <tbody>${leadRows}</tbody>
            </table></div>`
          }
        </div>
      </div>

      <!-- ═══════════════════════════════════════════ -->
      <!-- TAB: EMAILS                                 -->
      <!-- ═══════════════════════════════════════════ -->
      <div class="tab-panel" id="panel-emails">
        <div class="section">
          <div class="section-title">Sent &amp; Drafted Emails <span class="sb-count">${recentEmails.length}</span></div>
          <div class="section-desc">Email content generated by the AI composer. Click "Show more" to expand.</div>
          ${recentEmails.length === 0
            ? `<p class="empty">No emails composed yet. Approve leads to trigger composition.</p>`
            : emailRows
          }
        </div>
      </div>

      <!-- ═══════════════════════════════════════════ -->
      <!-- TAB: REPLIES                                -->
      <!-- ═══════════════════════════════════════════ -->
      <div class="tab-panel" id="panel-replies">
        <div class="section">
          <div class="section-title">Unhandled Replies <span class="sb-count" style="background:var(--amber-bg);color:var(--amber);border-color:var(--amber-border)">${unhandledReplies.length}</span></div>
          ${unhandledReplies.length === 0
            ? `<p class="empty">No unhandled replies. All clear.</p>`
            : `<div style="overflow-x:auto"><table class="tbl">
              <thead><tr><th>Lead</th><th>Reply</th><th>Classification</th><th>Confidence</th><th>Date</th><th>Action</th></tr></thead>
              <tbody>${replyRows}</tbody>
            </table></div>`
          }
        </div>
        ${responderRows ? `
        <div class="section">
          <div class="section-title">Reply History (from daily reports)</div>
          <div style="overflow-x:auto"><table class="tbl">
            <thead><tr><th>Date</th><th>Company</th><th>Reply</th><th>Classification</th><th>Next Step</th></tr></thead>
            <tbody>${responderRows}</tbody>
          </table></div>
        </div>` : ""}
      </div>

      <!-- ═══════════════════════════════════════════ -->
      <!-- TAB: CAMPAIGNS                              -->
      <!-- ═══════════════════════════════════════════ -->
      <div class="tab-panel" id="panel-campaigns">
        <div class="section">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div class="section-title" style="margin-bottom:0">Campaigns <span class="sb-count">${campaigns.length}</span></div>
            <button class="btn btn-sm btn-brand" onclick="createCampaignFn()">New campaign</button>
          </div>
          ${campaigns.length === 0
            ? `<p class="empty">No campaigns yet. Create one to organise your outbound by desk or sector.</p>`
            : `<div style="overflow-x:auto"><table class="tbl">
              <thead><tr><th>Name</th><th>Desk</th><th>Status</th><th>Leads</th><th>Sent</th><th>Replies</th><th>Positive</th><th>Created</th><th>Action</th></tr></thead>
              <tbody>${campaignRows}</tbody>
            </table></div>`
          }
        </div>
      </div>

      <!-- ═══════════════════════════════════════════ -->
      <!-- TAB: DAILY REPORTS                          -->
      <!-- ═══════════════════════════════════════════ -->
      <div class="tab-panel" id="panel-reports">
        <div class="section">
          <div class="section-title">Daily Reports <span class="sb-count">${recentReports.length}</span></div>
          <div class="section-desc">These reports are also emailed daily at 17:00 UK time.</div>
          ${recentReports.length === 0
            ? `<p class="empty">No daily reports yet. Reports are generated automatically once the engine is running.</p>`
            : `<div style="overflow-x:auto"><table class="tbl">
              <thead><tr><th>Date</th><th>Leads</th><th>Qualified</th><th>Sent</th><th>Replies</th><th>Positive</th><th>Bounces</th><th>Best Desk</th><th>Best Hook</th></tr></thead>
              <tbody>${reportRows}</tbody>
            </table></div>`
          }
        </div>
      </div>

      <!-- ═══════════════════════════════════════════ -->
      <!-- TAB: SEND QUEUE                             -->
      <!-- ═══════════════════════════════════════════ -->
      <div class="tab-panel" id="panel-queue">
        <div class="section">
          <div class="section-title">Send Queue <span class="sb-count">${sendQueueCount}</span></div>
          <div class="section-desc">Emails waiting to be sent. The engine sends during business hours (09:15–15:45 UK, Mon–Fri).</div>
          ${pendingEmails.length === 0
            ? `<p class="empty">Send queue is empty. Approve leads to queue emails for sending.</p>`
            : `<div style="overflow-x:auto"><table class="tbl">
              <thead><tr><th>Lead</th><th>Subject</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>${queueRows}</tbody>
            </table></div>`
          }
        </div>
      </div>

      <!-- ═══════════════════════════════════════════ -->
      <!-- TAB: SUPPRESSIONS                           -->
      <!-- ═══════════════════════════════════════════ -->
      <div class="tab-panel" id="panel-suppressions">
        <div class="section">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div class="section-title" style="margin-bottom:0">Suppression List <span class="sb-count">${suppressions.length}</span></div>
            <button class="btn btn-sm" onclick="addSuppressionFn()">Add suppression</button>
          </div>
          <div class="section-desc">Emails and domains that will never be contacted. Includes bounces, opt-outs, sole traders, and manual blocks.</div>
          ${suppressions.length === 0
            ? `<p class="empty">No suppressions yet.</p>`
            : `<div style="overflow-x:auto"><table class="tbl">
              <thead><tr><th>Email</th><th>Domain</th><th>Reason</th><th>Added</th></tr></thead>
              <tbody>${suppressionRows}</tbody>
            </table></div>`
          }
        </div>
      </div>

      <!-- ═══════════════════════════════════════════ -->
      <!-- TAB: PLAYBOOK                               -->
      <!-- ═══════════════════════════════════════════ -->
      <div class="tab-panel" id="panel-playbook">

        <div class="section">
          <div class="section-title">The Unit of Outbound</div>
          <div style="background:var(--brand-dim);border:1px solid var(--brand-border);border-radius:10px;padding:20px 24px;margin-bottom:24px">
            <div style="font-family:var(--sg);font-size:15px;font-weight:600;margin-bottom:8px;color:var(--brand)">Company + Matching Money Movement + Decision-Maker + Reason to Talk</div>
            <div style="font-size:12px;color:var(--muted);line-height:1.7">
              The product is not the platform. The product is the cold email. Every email must be traceable: why did we contact them, what contract triggered it, what source supports the claim.<br>
              <strong style="color:var(--text)">Sweet spot:</strong> £500k–£20m turnover suppliers who already want bigger contracts but do not have a full BD team.
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Pain Line</div>
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px 24px;font-family:var(--sg);font-size:16px;font-weight:600;letter-spacing:-.01em;margin-bottom:24px">
            "Most suppliers only see these when the tender goes live."
          </div>
        </div>

        <div class="section">
          <div class="section-title">Lead Groups &amp; Offers (July Priority Order)</div>
          <div style="overflow-x:auto"><table class="tbl">
            <thead><tr><th>Rank</th><th>Lead Group</th><th>Offer</th><th>Price</th></tr></thead>
            <tbody>
              <tr><td style="font-family:var(--mono);font-weight:700;color:var(--brand)">1</td><td>FM, cleaning, maintenance, waste, grounds suppliers</td><td>Renewal Radar Pack</td><td style="font-family:var(--mono);font-weight:600">£299</td></tr>
              <tr><td style="font-family:var(--mono);font-weight:700;color:var(--brand)">2</td><td>Retrofit, solar, insulation, EV suppliers</td><td>Demand Signal Pack</td><td style="font-family:var(--mono);font-weight:600">£399</td></tr>
              <tr><td style="font-family:var(--mono);font-weight:700;color:var(--brand)">3</td><td>Bid writers and tender consultants</td><td>White-label watchlist</td><td style="font-family:var(--mono);font-weight:600">£149/mo</td></tr>
              <tr><td style="font-family:var(--mono);font-weight:700;color:var(--brand)">4</td><td>Domiciliary care providers</td><td>Care Recommissioning Radar</td><td style="font-family:var(--mono);font-weight:600">£299</td></tr>
              <tr><td style="font-family:var(--mono);font-weight:700;color:var(--brand)">5</td><td>Construction maintenance contractors</td><td>Housing &amp; Council Works Radar</td><td style="font-family:var(--mono);font-weight:600">£399</td></tr>
            </tbody>
          </table></div>
        </div>

        <div class="grid-2">
          <div class="section">
            <div class="section-title">Qualification Scorecard</div>
            <div style="overflow-x:auto"><table class="tbl">
              <thead><tr><th>Signal</th><th style="text-align:right">Points</th></tr></thead>
              <tbody>
                <tr><td>Recently won public contract</td><td style="font-family:var(--mono);text-align:right;color:var(--green);font-weight:600">+30</td></tr>
                <tr><td>Appears on a framework</td><td style="font-family:var(--mono);text-align:right;color:var(--green);font-weight:600">+25</td></tr>
                <tr><td>Has public-sector case studies</td><td style="font-family:var(--mono);text-align:right;color:var(--green);font-weight:600">+20</td></tr>
                <tr><td>Sector matches chosen campaign</td><td style="font-family:var(--mono);text-align:right;color:var(--green);font-weight:600">+20</td></tr>
                <tr><td>Local to named opportunity</td><td style="font-family:var(--mono);text-align:right;color:var(--green);font-weight:600">+15</td></tr>
                <tr><td>Company size looks able to bid</td><td style="font-family:var(--mono);text-align:right;color:var(--green);font-weight:600">+15</td></tr>
                <tr><td>Has a real decision-maker email</td><td style="font-family:var(--mono);text-align:right;color:var(--green);font-weight:600">+15</td></tr>
                <tr><td>No clear public-sector intent</td><td style="font-family:var(--mono);text-align:right;color:var(--red);font-weight:600">-25</td></tr>
                <tr><td>Too huge / has internal bid team</td><td style="font-family:var(--mono);text-align:right;color:var(--red);font-weight:600">-15</td></tr>
                <tr><td>Too tiny / sole trader risk</td><td style="font-family:var(--mono);text-align:right;color:var(--red);font-weight:600">-20</td></tr>
              </tbody>
            </table></div>
            <div style="font-size:11px;color:var(--muted);margin-top:8px">Only leads scoring ~70+ should be emailed.</div>
          </div>

          <div class="section">
            <div class="section-title">Send Volume Ramp</div>
            <div style="overflow-x:auto"><table class="tbl">
              <thead><tr><th>Stage</th><th style="text-align:right">Leads/day</th><th style="text-align:right">Emails/day</th><th>Goal</th></tr></thead>
              <tbody>
                <tr><td style="font-family:var(--mono)">Week 1</td><td style="font-family:var(--mono);text-align:right">100</td><td style="font-family:var(--mono);text-align:right">20–30</td><td>Test hooks safely</td></tr>
                <tr><td style="font-family:var(--mono)">Week 2</td><td style="font-family:var(--mono);text-align:right">100</td><td style="font-family:var(--mono);text-align:right">40–60</td><td>Scale winners</td></tr>
                <tr><td style="font-family:var(--mono)">Week 3+</td><td style="font-family:var(--mono);text-align:right">100–300</td><td style="font-family:var(--mono);text-align:right">75–150</td><td>Repeatable outbound</td></tr>
              </tbody>
            </table></div>
            <div style="font-size:11px;color:var(--muted);margin-top:8px">100 generated leads/day is fine. 100 sent/day too early hurts deliverability.</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="section">
            <div class="section-title">Sending Rules</div>
            <div style="overflow-x:auto"><table class="tbl">
              <thead><tr><th>Rule</th><th>Setting</th></tr></thead>
              <tbody>
                <tr><td>Sending days</td><td style="font-family:var(--mono)">Monday – Friday</td></tr>
                <tr><td>Sending window</td><td style="font-family:var(--mono)">09:15 – 15:45 UK</td></tr>
                <tr><td>Max per inbox (start)</td><td style="font-family:var(--mono)">20–30/day</td></tr>
                <tr><td>Max per domain/week</td><td style="font-family:var(--mono)">1–2 contacts</td></tr>
                <tr><td>Follow-up 1</td><td style="font-family:var(--mono)">3 working days</td></tr>
                <tr><td>Follow-up 2</td><td style="font-family:var(--mono)">7 working days</td></tr>
                <tr><td>Stop sequence</td><td style="font-size:11px">Reply, bounce, unsubscribe, meeting booked</td></tr>
                <tr><td>Tracking pixels</td><td style="font-family:var(--mono)">Avoid at first</td></tr>
                <tr><td>Links / attachments</td><td style="font-family:var(--mono)">Minimal / none in first email</td></tr>
              </tbody>
            </table></div>
          </div>

          <div class="section">
            <div class="section-title">Reply Action Map</div>
            <div style="overflow-x:auto"><table class="tbl">
              <thead><tr><th>Reply Type</th><th>Action</th></tr></thead>
              <tbody>
                <tr><td>${classificationBadge("interested")}</td><td>Create task, suggest meeting slots</td></tr>
                <tr><td>${classificationBadge("send_info")}</td><td>Send preview pack</td></tr>
                <tr><td>${classificationBadge("not_now")}</td><td>Follow up in 30–60 days</td></tr>
                <tr><td>${classificationBadge("wrong_person")}</td><td>Ask for the right contact</td></tr>
                <tr><td>${classificationBadge("unsubscribe")}</td><td>Suppress immediately</td></tr>
                <tr><td>${classificationBadge("angry")}</td><td>Suppress company/domain</td></tr>
                <tr><td>${classificationBadge("ooo")}</td><td>Retry after return date</td></tr>
                <tr><td>${classificationBadge("bounce")}</td><td>Mark email invalid</td></tr>
              </tbody>
            </table></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Canonical Cold Email Template</div>
          <div class="email-preview" style="max-width:640px">
            <div class="email-preview-subject">Subject: [Buyer Name] contract coming back around</div>
            <div class="email-preview-body expanded" style="max-height:none">Hi [First Name],

I found something that looks relevant to [Company].

You already work around [sector/service], and [Buyer Name] has a [service type] contract in [region] ending around [date]. The current supplier is listed as [incumbent if available], and I found [number] similar contracts in nearby areas.

Most suppliers only see this when the tender goes live. AtlasRevenue tracks the renewal window earlier, then turns it into a short action pack showing who the buyer is, who holds the work now, when it may come back around, and what to do before competitors start chasing it.

I can send you the small preview I found for [Company] if useful.

Worth a look?

Mayor
AtlasRevenue

If this isn't relevant, just say so and I won't contact you again.</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Preview Pack (on "send it" reply)</div>
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px 24px">
            <div style="font-size:12px;line-height:1.7;color:var(--muted)">
              When someone replies "send it" or "send the preview," the system instantly creates a 1-page PDF or webpage:
            </div>
            <ul style="font-size:12px;line-height:1.8;color:var(--text);margin:10px 0 10px 18px">
              <li>3 contracts worth watching</li>
              <li>Buyer names</li>
              <li>Incumbents</li>
              <li>Dates</li>
              <li>Why this matches them</li>
              <li>Recommended first move</li>
            </ul>
            <div style="font-family:var(--sg);font-size:14px;font-weight:600;color:var(--brand);margin-top:8px">CTA: "Want the full Renewal Radar Pack? £299."</div>
            <div style="font-size:11px;color:var(--muted);margin-top:6px">This converts better than sending them to a pricing page.</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Expected Cold Outreach Outcomes (per 100 emails)</div>
          <div class="cards">
            <div class="card"><div class="card-label">Opens</div><div class="card-value">40–70</div></div>
            <div class="card"><div class="card-label">Replies</div><div class="card-value">2–8</div></div>
            <div class="card"><div class="card-label">Positive</div><div class="card-value" style="color:var(--green)">1–4</div></div>
            <div class="card"><div class="card-label">Calls</div><div class="card-value">1–3</div></div>
            <div class="card"><div class="card-label">Paid Pack</div><div class="card-value" style="color:var(--brand)">0–2</div></div>
          </div>
          <div style="font-size:11px;color:var(--muted)">100 emails → 2 buyers × £399 = £798. If one converts to £149/mo watchlist, the model begins to work.</div>
        </div>

        <div class="section">
          <div class="section-title">Do Not Send If</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <span class="badge badge-red">Sole trader / partnership</span>
            <span class="badge badge-red">Personal Gmail / Yahoo / Outlook</span>
            <span class="badge badge-red">No real business relevance</span>
            <span class="badge badge-red">Already opted out</span>
            <span class="badge badge-red">Domain contacted too recently</span>
            <span class="badge badge-red">Low email confidence</span>
            <span class="badge badge-red">Weak source evidence</span>
            <span class="badge badge-red">Unverifiable claims</span>
          </div>
        </div>

      </div>

      <!-- ═══════════════════════════════════════════ -->
      <!-- TAB: PERFORMANCE / ANALYTICS                -->
      <!-- ═══════════════════════════════════════════ -->
      <div class="tab-panel" id="panel-analytics">

        <div class="section-title">Performance Analytics</div>
        <div class="cards" style="margin-bottom:24px">
          <div class="card">
            <div class="card-label">Reply Rate</div>
            <div class="card-value">${allStats.reply_rate}%</div>
            <div class="card-sub">${allStats.total_replies} / ${allStats.total_sent} sent</div>
          </div>
          <div class="card">
            <div class="card-label">Positive Rate</div>
            <div class="card-value" style="color:var(--green)">${allStats.positive_rate}%</div>
            <div class="card-sub">${allStats.total_positive} interested or send_info</div>
          </div>
          <div class="card">
            <div class="card-label">Bounce Rate</div>
            <div class="card-value" style="color:${allStats.total_sent > 0 && (allStats.total_bounced / allStats.total_sent) > 0.05 ? "var(--red)" : "var(--text)"}">${allStats.total_sent > 0 ? Math.round((allStats.total_bounced / allStats.total_sent) * 100) : 0}%</div>
            <div class="card-sub">${allStats.total_bounced} bounced</div>
          </div>
        </div>

        <div class="grid-3">
          <div class="section">
            <div class="section-title">Leads by Desk</div>
            ${leadsByDesk.length === 0 ? `<p class="empty">No data yet.</p>` : leadsByDesk.map(d => `
              <div class="mini-bar">
                <div class="mini-bar-label">${escapeHtml(d.desk_slug)}</div>
                <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.round((d.count / maxDesk) * 100)}%"></div></div>
                <div class="mini-bar-val">${d.count}</div>
              </div>
            `).join("")}
          </div>

          <div class="section">
            <div class="section-title">Lead Status</div>
            ${statusBreakdown.length === 0 ? `<p class="empty">No data yet.</p>` : statusBreakdown.map(s => `
              <div class="mini-bar">
                <div class="mini-bar-label">${escapeHtml(s.status)}</div>
                <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.round((s.count / maxStatus) * 100)}%"></div></div>
                <div class="mini-bar-val">${s.count}</div>
              </div>
            `).join("")}
          </div>

          <div class="section">
            <div class="section-title">Reply Types</div>
            ${replyBreakdown.length === 0 ? `<p class="empty">No replies yet.</p>` : replyBreakdown.map(r => `
              <div class="mini-bar">
                <div class="mini-bar-label">${escapeHtml(r.classification)}</div>
                <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${Math.round((r.count / maxReplyClass) * 100)}%;${["interested", "send_info"].includes(r.classification) ? "background:var(--green)" : ["angry", "bounce", "unsubscribe"].includes(r.classification) ? "background:var(--red)" : ""}"></div></div>
                <div class="mini-bar-val">${r.count}</div>
              </div>
            `).join("")}
          </div>
        </div>

      </div>

    </div>
  </div>
</div>

<script>
const TOKEN = "${escapeHtml(token)}";
const BASE = "/api/outbound";
function hdr() { return { "Content-Type": "application/json", "x-admin-token": TOKEN }; }

function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  var panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  var tabs = document.querySelectorAll('.tab');
  var names = ['overview','leads','emails','replies','campaigns','reports','queue','suppressions','analytics','playbook'];
  var idx = names.indexOf(name);
  if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');
  document.querySelectorAll('.sb-link').forEach(function(l) { l.classList.remove('active'); });
  document.querySelectorAll('.sb-link[onclick*="' + name + '"]').forEach(function(l) { l.classList.add('active'); });
}

function toggleExpand(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('expanded');
  var btn = el.nextElementSibling;
  if (btn) btn.textContent = el.classList.contains('expanded') ? 'Show less' : 'Show more';
}

async function approveLeadFn(id) {
  await fetch(BASE + "/leads/" + id + "/approve", { method: "POST", headers: hdr() });
  location.reload();
}
async function suppressLeadFn(id) {
  if (!confirm("Suppress this lead?")) return;
  await fetch(BASE + "/leads/" + id + "/suppress", { method: "POST", headers: hdr() });
  location.reload();
}
async function handleReplyFn(id) {
  await fetch(BASE + "/replies/" + id + "/handle", { method: "POST", headers: hdr() });
  location.reload();
}
async function generateLeadsFn() {
  var btn = event.target;
  btn.disabled = true; btn.textContent = "Generating...";
  try {
    var r = await fetch(BASE + "/generate", { method: "POST", headers: hdr() });
    var data = await r.json();
    alert("Generated " + data.leadsCreated + " leads from " + data.desksProcessed.join(", "));
  } catch(e) { alert("Error: " + e.message); }
  location.reload();
}
async function bulkApproveFn() {
  if (!confirm("Approve all qualified leads?")) return;
  try {
    var r = await fetch(BASE + "/leads?status=qualified&limit=200", { headers: hdr() });
    var data = await r.json();
    var ids = data.leads.map(function(l) { return l.id; });
    if (ids.length === 0) { alert("No qualified leads to approve."); return; }
    await fetch(BASE + "/leads/bulk-approve", { method: "POST", headers: hdr(), body: JSON.stringify({ ids: ids }) });
    alert("Approved " + ids.length + " leads.");
  } catch(e) { alert("Error: " + e.message); }
  location.reload();
}
async function pauseCampaignFn(id) {
  await fetch(BASE + "/campaigns/" + id + "/pause", { method: "POST", headers: hdr() });
  location.reload();
}
async function createCampaignFn() {
  var name = prompt("Campaign name:");
  if (!name) return;
  var desk = prompt("Desk slug (leave empty for all desks):");
  await fetch(BASE + "/campaigns", { method: "POST", headers: hdr(), body: JSON.stringify({ name: name, desk_slug: desk || null }) });
  location.reload();
}
async function addSuppressionFn() {
  var email = prompt("Email to suppress (or leave empty for domain):");
  var domain = email ? null : prompt("Domain to suppress:");
  if (!email && !domain) return;
  var reason = prompt("Reason (manual/angry_reply/sole_trader):", "manual");
  await fetch(BASE + "/suppressions", { method: "POST", headers: hdr(), body: JSON.stringify({ email: email || null, domain: domain || null, reason: reason || "manual" }) });
  location.reload();
}
</script>
</body>
</html>`;
}
