import { escapeHtml } from "../lib/intel.js";
import { getLeadsPaginated, getTodayStats, getActiveCampaigns, getRecentReports, getUnhandledReplies } from "./db.js";
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
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:28px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px}
.card-label{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted-2);margin-bottom:6px}
.card-value{font-family:var(--sg);font-size:28px;font-weight:700;letter-spacing:-.03em}
.card-sub{font-family:var(--inter);font-size:11px;color:var(--muted);margin-top:4px}
.section{margin-bottom:32px}
.section-title{font-family:var(--sg);font-size:15px;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px}
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
.status-bar{display:flex;gap:12px;align-items:center;padding:10px 18px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:20px;font-size:12px}
.status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.status-dot.on{background:var(--green)}
.status-dot.off{background:var(--red)}
@media(max-width:900px){
  .shell{grid-template-columns:1fr}
  .sidebar{display:none}
  .cards{grid-template-columns:repeat(2,1fr)}
}
</style>`;
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    qualified: "badge-blue",
    approved: "badge-amber",
    composing: "badge-amber",
    ready: "badge-green",
    sent: "badge-green",
    replied: "badge-green",
    opted_out: "badge-muted",
    bounced: "badge-red",
    suppressed: "badge-muted",
  };
  return `<span class="badge ${map[status] || "badge-muted"}">${escapeHtml(status)}</span>`;
}

function classificationBadge(c: string): string {
  const map: Record<string, string> = {
    interested: "badge-green",
    send_info: "badge-green",
    not_now: "badge-muted",
    wrong_person: "badge-amber",
    unsubscribe: "badge-red",
    angry: "badge-red",
    ooo: "badge-amber",
    bounce: "badge-red",
  };
  return `<span class="badge ${map[c] || "badge-muted"}">${escapeHtml(c)}</span>`;
}

export async function renderAdminOutboundPage(token: string): Promise<string> {
  const [stats, gmailConnected, campaigns, recentReports, unhandledReplies, leadsResult] = await Promise.all([
    getTodayStats(),
    isGmailConfigured(),
    getActiveCampaigns(),
    getRecentReports(7),
    getUnhandledReplies(),
    getLeadsPaginated({ limit: 30, offset: 0 }),
  ]);

  const t = encodeURIComponent(token);

  const leadRows = leadsResult.leads.map((l, i) => `
    <tr>
      <td style="font-family:var(--mono);color:var(--muted)">${i + 1}</td>
      <td><strong>${escapeHtml(l.company_name)}</strong><br><span style="color:var(--muted);font-size:11px">${escapeHtml(l.address || "")}</span></td>
      <td style="font-size:11px">${escapeHtml(l.trigger_title.slice(0, 60))}${l.trigger_title.length > 60 ? "…" : ""}<br><span style="color:var(--muted)">${escapeHtml(l.trigger_buyer)}</span></td>
      <td style="font-family:var(--mono)">${l.trigger_value ? `£${(l.trigger_value / 100).toLocaleString()}` : "—"}</td>
      <td style="font-family:var(--mono)">${l.trigger_days_left !== null ? `${l.trigger_days_left}d` : "—"}</td>
      <td style="font-family:var(--mono);font-weight:600">${l.qualification_score}</td>
      <td>${statusBadge(l.status)}</td>
      <td>
        ${l.status === "qualified" ? `<button class="btn btn-sm btn-brand" onclick="approveLeadFn('${escapeHtml(l.id)}')">Approve</button>` : ""}
        ${["qualified", "approved", "ready"].includes(l.status) ? `<button class="btn btn-sm" onclick="suppressLeadFn('${escapeHtml(l.id)}')">Suppress</button>` : ""}
      </td>
    </tr>
  `).join("");

  const replyRows = unhandledReplies.slice(0, 15).map(r => `
    <tr>
      <td>${escapeHtml(r.lead_id.slice(0, 8))}</td>
      <td style="font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.raw_snippet.slice(0, 80))}</td>
      <td>${classificationBadge(r.classification)}</td>
      <td style="font-family:var(--mono)">${r.confidence}%</td>
      <td><button class="btn btn-sm" onclick="handleReplyFn('${escapeHtml(r.id)}')">Handle</button></td>
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
      <div class="sb-tag">Admin Panel</div>
    </div>
    <nav class="sb-nav">
      <div class="sb-group">Intelligence</div>
      <a href="/admin/scans?token=${t}" class="sb-link">Overview</a>
      <div class="sb-group">Content</div>
      <a href="/admin/articles?token=${t}" class="sb-link">Articles</a>
      <div class="sb-group">Ads & Marketing</div>
      <a href="/admin/outbound?token=${t}" class="sb-link active">Email Marketing <span class="sb-count">${leadsResult.total}</span></a>
    </nav>
  </aside>
  <div style="min-width:0">
    <div class="topbar">
      <div class="topbar-left">
        <div class="topbar-crumb">Admin <span>›</span> Ads & Marketing <span>›</span> <b>Email Marketing</b></div>
        <div class="topbar-title">Outbound Engine</div>
      </div>
      <div class="topbar-right">
        <button class="btn" onclick="generateLeadsFn()">Generate leads now</button>
        ${!gmailConnected ? `<a href="/admin/gmail-setup?token=${t}" class="btn btn-brand">Connect Gmail</a>` : ""}
      </div>
    </div>

    <div class="content">
      <div class="status-bar">
        <span class="status-dot ${OUTBOUND_ENABLED ? "on" : "off"}"></span>
        <span>Sending: <strong>${OUTBOUND_ENABLED ? "Active" : "Paused"}</strong></span>
        <span style="color:var(--muted)">·</span>
        <span>Gmail: <strong>${gmailConnected ? "Connected" : "Not connected"}</strong></span>
        <span style="color:var(--muted)">·</span>
        <span>Daily limit: <strong>${OUTBOUND_DAILY_LIMIT}</strong></span>
        <span style="color:var(--muted)">·</span>
        <span>Campaigns: <strong>${campaigns.length}</strong></span>
      </div>

      <div class="cards">
        <div class="card">
          <div class="card-label">Leads Today</div>
          <div class="card-value">${stats.leads_generated}</div>
          <div class="card-sub">${stats.leads_qualified} qualified</div>
        </div>
        <div class="card">
          <div class="card-label">Sent Today</div>
          <div class="card-value">${stats.emails_sent}</div>
          <div class="card-sub">of ${OUTBOUND_DAILY_LIMIT} limit</div>
        </div>
        <div class="card">
          <div class="card-label">Replies Today</div>
          <div class="card-value">${stats.replies}</div>
          <div class="card-sub">${stats.positive_replies} positive</div>
        </div>
        <div class="card">
          <div class="card-label">Pipeline</div>
          <div class="card-value">${leadsResult.total}</div>
          <div class="card-sub">total leads</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Recent Leads</div>
        ${leadsResult.leads.length === 0
          ? `<p style="color:var(--muted);font-size:12px">No leads yet. Click "Generate leads now" to start.</p>`
          : `<div style="overflow-x:auto"><table class="tbl">
            <thead><tr>
              <th>#</th><th>Company</th><th>Trigger Contract</th><th>Value</th><th>Expires</th><th>Score</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>${leadRows}</tbody>
          </table></div>`
        }
      </div>

      ${unhandledReplies.length > 0 ? `
      <div class="section">
        <div class="section-title">Unhandled Replies <span class="sb-count">${unhandledReplies.length}</span></div>
        <div style="overflow-x:auto"><table class="tbl">
          <thead><tr><th>Lead</th><th>Reply</th><th>Classification</th><th>Confidence</th><th>Action</th></tr></thead>
          <tbody>${replyRows}</tbody>
        </table></div>
      </div>` : ""}

    </div>
  </div>
</div>

<script>
const TOKEN = "${escapeHtml(token)}";
const BASE = "/api/outbound";
function hdr() { return { "Content-Type": "application/json", "x-admin-token": TOKEN }; }
async function approveLeadFn(id) {
  await fetch(BASE + "/leads/" + id + "/approve", { method: "POST", headers: hdr() });
  location.reload();
}
async function suppressLeadFn(id) {
  await fetch(BASE + "/leads/" + id + "/suppress", { method: "POST", headers: hdr() });
  location.reload();
}
async function handleReplyFn(id) {
  await fetch(BASE + "/replies/" + id + "/handle", { method: "POST", headers: hdr() });
  location.reload();
}
async function generateLeadsFn() {
  const btn = event.target;
  btn.disabled = true; btn.textContent = "Generating...";
  const r = await fetch(BASE + "/generate", { method: "POST", headers: hdr() });
  const data = await r.json();
  alert("Generated " + data.leadsCreated + " leads from " + data.desksProcessed.join(", "));
  location.reload();
}
</script>
</body>
</html>`;
}
