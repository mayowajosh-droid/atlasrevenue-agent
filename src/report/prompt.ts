import { z } from "zod";
import type { ProcurementNotice, ProcurementData, IncumbentEntry, ScanRecord } from "../types.js";
import { intakeSchema } from "../data/intake.js";
import { resolveSectorFromInput } from "../data/sectors.js";
import { dataQualitySummary } from "../fetchers/scoring.js";
import { escapeHtml, formatMoney, formatDate } from "../lib/intel.js";
import { renderWorldClassDashboard } from "../designEngine.js";

function nowIso() { return new Date().toISOString(); }

function procurementDataMarkdown(data: ProcurementData) {
  const open = [...data.contractsFinder.open]
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    .slice(0, 20);
  const awarded = [...data.contractsFinder.awarded]
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    .slice(0, 20);
  const findTender = [...(data.findTender?.notices || [])]
    .sort((a, b) => new Date(b.publishedDate || 0).getTime() - new Date(a.publishedDate || 0).getTime())
    .slice(0, 20);
  const companiesHouse = data.companiesHouse?.matches || [];
  const allErrors = [
    ...(data.contractsFinder.errors || []).map(error => `Contracts Finder: ${error}`),
    ...(data.findTender?.errors || []).map(error => `Find a Tender: ${error}`),
    ...(data.companiesHouse?.errors || []).map(error => `Companies House: ${error}`)
  ];

  const quality = data.quality || dataQualitySummary(
    open,
    [...awarded, ...findTender],
    allErrors,
    data.keywords,
    data.regions
  );

  const renderRows = (items: ProcurementNotice[], emptyLabel: string) =>
    items.length
      ? items
          .map(
            item =>
              `- [Pulled record: ${item.source}] ${item.title} | Buyer: ${item.buyer} | Status: ${item.status || "-"} | Relevance: ${item.relevanceScore ?? "-"} /100 | Reason: ${item.relevanceReason || "-"} | Value: ${formatMoney(
                item.valueLow || item.awardedValue
              )}-${formatMoney(item.valueHigh || item.awardedValue)} | Deadline: ${formatDate(
                item.deadlineDate
              )} | Awarded supplier: ${item.awardedSupplier || "-"} | SME: ${
                item.suitableForSme === null ? "-" : item.suitableForSme ? "yes" : "no"
              } | Source URL: ${item.url}`
          )
          .join("\n")
      : `- No matching structured records returned from ${emptyLabel} for this scan.`;

  const companyRows = companiesHouse.length
    ? companiesHouse
        .map(
          company =>
            `- [Pulled record: Companies House] ${company.companyName} | Company number: ${company.companyNumber} | Status: ${company.companyStatus || "-"} | Type: ${company.companyType || "-"} | Created: ${company.dateOfCreation || "-"} | SIC: ${company.sicCodes.length ? company.sicCodes.join(", ") : "-"} | Address: ${company.address || "-"} | Source URL: ${company.url}`
        )
        .join("\n")
    : "- No matching Companies House company profile returned for this intake company name.";

  return `
STRUCTURED PROCUREMENT AND COMPANY DATA PULLED BEFORE ANALYSIS

Source confidence labels allowed in this report:
- Pulled record = record returned directly from Contracts Finder, Find a Tender or Companies House and includes Source URL.
- Verified web fact = fact verified by web search and listed with a URL in Source Appendix.
- Strategy target = commercially relevant buyer/supplier/opportunity suggested by analyst logic, but not confirmed as a pulled record.
- Unconfirmed = mentioned in intake or plausible from context but not verified from sources checked.

Data quality warning:
Level: ${quality.level}
Warning: ${quality.warning}
Average relevance: ${quality.averageRelevance}/100
Strong matches: ${quality.strongMatches}
Moderate matches: ${quality.moderateMatches}
Total structured records: ${quality.totalRecords}

Data generated at: ${data.generatedAt}
Sources: Contracts Finder API v2 search_notices; Find a Tender public OCDS release packages; Companies House search/companies
Regions searched: ${data.regions}
Keywords searched: ${data.keywords.join(", ")}

Companies House company profile matches:
${companyRows}

Contracts Finder open opportunities:
${renderRows(open, "Contracts Finder open opportunities")}

Contracts Finder awarded / historical signals:
${renderRows(awarded, "Contracts Finder awarded records")}

Find a Tender public OCDS notices:
${renderRows(findTender, "Find a Tender")}

Data pull errors:
${allErrors.length ? allErrors.map(error => `- ${error}`).join("\n") : "- None"}
`;
}



export function enforceDataQualityLanguage(report: string) {
  return String(report || "")
    .replace(/\bConfirmed\b/g, "Source-labelled")
    .replace(/\bconfirmed\b/g, "source-labelled")
    .replace(/\bsource-backed\b/gi, "source-labelled")
    .replace(/\bSource-backed\b/g, "Source-labelled");
}



export function trustNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value || 0);
}

export function trustMoney(value: number) {
  if (!value || Number.isNaN(value)) return "Not stated";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(value);
}

export function parseMoneyCap(input: any) {
  const text = [
    input?.maximumContractSize,
    input?.idealContractSize,
    input?.mainServices,
    input?.mainGoal
  ]
    .join(" ")
    .toLowerCase();

  // Require £ prefix OR explicit k/m/million/thousand suffix to avoid matching bare years/counts
  const matches = [...text.matchAll(/£\s*([0-9,]+(?:\.[0-9]+)?)\s*(k|m|million|thousand)?|([0-9,]+(?:\.[0-9]+)?)\s*(k|m|million|thousand)/gi)];
  const values = matches
    .map(match => {
      const n = parseFloat((match[1] || match[3]).replace(/,/g, ""));
      const unit = (match[2] || match[4] || "").toLowerCase();
      if (unit === "m" || unit === "million") return n * 1_000_000;
      if (unit === "k" || unit === "thousand") return n * 1_000;
      return n;
    })
    .filter(value => value >= 1_000);

  if (values.length) return Math.max(...values);

  if (text.includes("quantity surveying") || text.includes("construction") || text.includes("cost management") || text.includes("project management")) {
    return 500_000;
  }

  if (text.includes("marketing") || text.includes("campaign") || text.includes("video") || text.includes("film") || text.includes("creative")) {
    return 150_000;
  }

  if (text.includes("photography")) {
    return 25_000;
  }

  return 75_000;
}


export function normaliseCompanyName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(ltd|limited|uk|plc|llp|group|company|co)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function noticeRecordValue(notice: any) {
  return Number(notice?.awardedValue || notice?.valueHigh || notice?.valueLow || 0) || 0;
}

export function noticeRecordId(notice: any) {
  return String(notice?.id || "").trim();
}


export function buildIncumbentMap(data: ProcurementData): IncumbentEntry[] {
  const awarded = (data?.contractsFinder?.awarded || []) as any[];
  const map = new Map<string, IncumbentEntry>();
  for (const n of awarded) {
    const raw = String(n.awardedSupplier || "").trim();
    if (!raw || raw.toLowerCase().includes("not stated") || raw.length < 3) continue;
    const key = normaliseCompanyName(raw);
    if (!key) continue;
    const entry = map.get(key) || { name: raw, count: 0, totalValue: 0, latestAward: null };
    entry.count++;
    const v = Number(n.awardedValue || n.valueHigh || 0);
    entry.totalValue += v;
    if (n.awardedDate && (!entry.latestAward || n.awardedDate > entry.latestAward)) entry.latestAward = n.awardedDate;
    if (entry.count === 1) entry.name = raw; // keep display name from first seen
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

export function renderIncumbentSection(data: ProcurementData): string {
  const incumbents = buildIncumbentMap(data);
  if (incumbents.length === 0) return "";
  const total = incumbents.reduce((s, e) => s + e.count, 0);
  const rows = incumbents.map(e => {
    const pct = total > 0 ? Math.round((e.count / total) * 100) : 0;
    const val = e.totalValue > 0
      ? (e.totalValue >= 1_000_000 ? `£${(e.totalValue / 1_000_000).toFixed(1)}m` : `£${Math.round(e.totalValue / 1000)}k`)
      : "—";
    const latest = e.latestAward
      ? new Date(e.latestAward).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
      : "—";
    return `<tr>
      <td style="padding:9px 14px;font-size:14px;color:var(--text);border-bottom:1px solid var(--border-2)">${escapeHtml(e.name)}</td>
      <td style="padding:9px 14px;text-align:center;font-size:13px;font-family:var(--mono);border-bottom:1px solid var(--border-2)">${e.count}</td>
      <td style="padding:9px 14px;text-align:right;font-size:13px;font-family:var(--mono);border-bottom:1px solid var(--border-2)">${escapeHtml(val)}</td>
      <td style="padding:9px 14px;border-bottom:1px solid var(--border-2)">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="height:6px;width:${Math.max(pct, 2)}%;background:var(--brand);border-radius:2px"></div>
          <span style="font-size:11px;font-family:var(--mono);color:var(--muted)">${pct}%</span>
        </div>
      </td>
      <td style="padding:9px 14px;font-size:12px;font-family:var(--mono);color:var(--muted);border-bottom:1px solid var(--border-2)">${escapeHtml(latest)}</td>
    </tr>`;
  }).join("");
  if (incumbents.length === 0) {
    return `<section style="margin:40px 0;background:var(--surface-2);border:1px solid var(--border-2);padding:28px 32px" class="no-print">
  <h2 style="font-family:var(--sans);font-size:22px;font-weight:800;margin-bottom:6px;color:var(--text)">Incumbent map</h2>
  <p style="font-size:13px;color:var(--muted);margin-bottom:12px;font-family:var(--mono)">Derived from awarded contract records in this dataset. Not exhaustive — covers notices returned by keyword search only.</p>
  <p style="font-size:13px;color:var(--faint);font-family:var(--mono);padding:20px;border:1px dashed var(--border-2);line-height:1.6">No named suppliers found in the awarded contracts pulled for this scan. Either the matched notices did not include supplier disclosure, or all matched notices are open/pending (no supplier named yet). The LLM report's Buyer Watchlist section identifies who to approach before contracts formally re-tender.</p>
</section>`;
  }
  return `<section style="margin:40px 0;background:var(--surface-2);border:1px solid var(--border-2);padding:28px 32px" class="no-print">
  <h2 style="font-family:var(--sans);font-size:22px;font-weight:800;margin-bottom:6px;color:var(--text)">Incumbent map</h2>
  <p style="font-size:13px;color:var(--muted);margin-bottom:18px;font-family:var(--mono)">Derived from awarded contract records in this dataset. Not exhaustive — covers notices returned by keyword search only.</p>
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:var(--surface-3)">
        <th style="padding:8px 14px;text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600">Supplier</th>
        <th style="padding:8px 14px;text-align:center;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600">Awards</th>
        <th style="padding:8px 14px;text-align:right;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600">Total value</th>
        <th style="padding:8px 14px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600">Share</th>
        <th style="padding:8px 14px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600">Latest award</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

export function renderScanSpendTrend(data: ProcurementData): string {
  const awarded = (data?.contractsFinder?.awarded || []) as any[];
  const nowMs = Date.now();
  const cutoff365 = nowMs - 365 * 24 * 3_600_000;
  const monthlySpend = new Map<string, number>();
  let totalAwarded = 0;
  for (const n of awarded) {
    const d = n.awardedDate ? new Date(n.awardedDate) : (n.publishedDate ? new Date(n.publishedDate) : null);
    if (!d || d.getTime() < cutoff365 || d.getTime() > nowMs) continue;
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const val = Number(n.awardedValue || n.valueHigh || 0);
    monthlySpend.set(mk, (monthlySpend.get(mk) || 0) + val);
    totalAwarded += val;
  }
  const trendData = [...monthlySpend.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (trendData.length < 2) return "";
  const maxMonthVal = Math.max(...trendData.map(([, v]) => v), 1);
  const slice3 = (arr: [string, number][], end: boolean) => {
    const s = end ? arr.slice(-3) : arr.slice(0, 3);
    return s.reduce((sum, [, v]) => sum + v, 0) / Math.max(s.length, 1);
  };
  const first3Avg = slice3(trendData, false);
  const last3Avg = slice3(trendData, true);
  const trendPct = first3Avg > 0 ? Math.round(((last3Avg - first3Avg) / first3Avg) * 100) : 0;
  const fmtShort = (v: number) => v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}m` : v >= 1_000 ? `£${Math.round(v / 1000)}k` : `£${Math.round(v)}`;
  const fmtBig = (v: number) => v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}m` : `£${Math.round(v / 1000)}k`;
  const trendDir = trendPct >= 5 ? "rising" : trendPct <= -5 ? "contracting" : "stable";
  const trendColor = trendPct >= 5 ? "var(--green)" : trendPct <= -5 ? "var(--red)" : "var(--brand)";
  const bars = trendData.map(([key, val]) => {
    const pct = Math.max(Math.round((val / maxMonthVal) * 100), 2);
    const dt = new Date(key + "-01");
    const mo = dt.toLocaleDateString("en-GB", { month: "short" });
    const yr = String(dt.getFullYear()).slice(2);
    return `<div class="rt-bar-col" title="${escapeHtml(`${mo} '${yr}: ${fmtShort(val)}`)}">
      <div class="rt-bar" style="height:${pct}%"></div>
      <div class="rt-bar-label">${escapeHtml(mo)}<br><span>${escapeHtml("'" + yr)}</span></div>
    </div>`;
  }).join("");
  return `<section style="margin:40px 0;padding:28px 32px;background:var(--surface-2);border:1px solid var(--border-2)" class="no-print">
  <div style="display:flex;align-items:baseline;gap:16px;margin-bottom:6px;flex-wrap:wrap">
    <h2 style="font-family:var(--sans);font-size:22px;font-weight:800;margin:0;color:var(--text)">Sector spend trend</h2>
    <span style="font-family:var(--mono);font-size:13px;color:${trendColor};font-weight:700">${trendPct >= 0 ? "▲" : "▼"} ${Math.abs(trendPct)}% ${trendDir}</span>
  </div>
  <p style="font-size:13px;color:var(--muted);margin-bottom:18px;font-family:var(--mono)">Monthly awarded contract value from this scan's pulled records — last 12 months. MoM trend compares 3-month opening vs trailing average.</p>
  <div style="height:140px;display:flex;align-items:flex-end;gap:3px;padding-bottom:0;border-bottom:1px solid var(--border-2)">
    ${bars}
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:8px">
    <span style="font-size:12px;color:var(--muted);font-family:var(--mono)">${escapeHtml(fmtBig(totalAwarded))}+ awarded in period · ${trendData.length} months of data · public record only</span>
    <span style="font-size:11px;color:var(--faint);font-family:var(--mono)">Contracts Finder awarded notices</span>
  </div>
  <style>.rt-bar-col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;flex:1;min-width:0;height:100%}.rt-bar{width:80%;background:var(--brand);border-radius:2px 2px 0 0;opacity:.85;transition:opacity .15s}.rt-bar-col:hover .rt-bar{opacity:1}.rt-bar-label{font-family:var(--mono);font-size:9px;color:var(--muted);text-align:center;margin-top:5px;line-height:1.3}.rt-bar-label span{color:var(--faint)}</style>
</section>`;
}

export function renderBuyerConcentration(data: ProcurementData): string {
  const awarded = (data?.contractsFinder?.awarded || []) as any[];
  const buyerMap = new Map<string, { count: number; value: number }>();
  for (const n of awarded) {
    const buyer = String(n.buyer || "").trim();
    if (!buyer || buyer.length < 3) continue;
    const e = buyerMap.get(buyer) || { count: 0, value: 0 };
    e.count++;
    e.value += Number(n.awardedValue || 0);
    buyerMap.set(buyer, e);
  }
  const topBuyers = [...buyerMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 7);
  if (topBuyers.length === 0) return "";
  const maxCount = topBuyers[0][1].count;
  const fmtMoney = (v: number) => v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}m` : v > 0 ? `£${Math.round(v / 1000)}k` : "—";
  const rows = topBuyers.map(([buyer, { count, value }], i) => {
    const pct = Math.max(Math.round((count / maxCount) * 100), 4);
    return `<div style="display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:13px;color:var(--text);margin-bottom:5px;font-family:var(--sans)">${i === 0 ? `<span style="font-size:9px;font-family:var(--mono);background:var(--brand-dim);color:var(--brand);padding:2px 6px;border-radius:2px;margin-right:6px;font-weight:700">TOP BUYER</span>` : ""}${escapeHtml(buyer.slice(0, 65))}</div>
        <div style="height:3px;background:var(--surface-3);border-radius:2px"><div style="height:3px;width:${pct}%;background:var(--brand);border-radius:2px;opacity:.7"></div></div>
      </div>
      <span style="font-family:var(--mono);font-size:11px;color:var(--muted);white-space:nowrap">${count} award${count !== 1 ? "s" : ""}</span>
      <span style="font-family:var(--mono);font-size:12px;color:var(--text-mid);white-space:nowrap;font-weight:600">${escapeHtml(fmtMoney(value))}</span>
    </div>`;
  }).join("");
  return `<section style="margin:40px 0;background:var(--surface-2);border:1px solid var(--border-2);padding:28px 32px" class="no-print">
  <h2 style="font-family:var(--sans);font-size:22px;font-weight:800;margin-bottom:6px;color:var(--text)">Buyer concentration</h2>
  <p style="font-size:13px;color:var(--muted);margin-bottom:18px;font-family:var(--mono)">Top contracting authorities by awarded contract count — from this scan's pulled records. Ranked by frequency, not value.</p>
  ${rows}
</section>`;
}

function noticeText(notice: any) {
  return [
    notice?.title,
    notice?.buyer,
    notice?.description,
    notice?.awardedSupplier,
    notice?.keyword,
    notice?.region,
    notice?.type,
    notice?.status
  ]
    .join(" ")
    .toLowerCase();
}

function confidenceGrade(score: number) {
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  if (score >= 45) return "Low";
  return "Very low";
}

function trustStatusForNotice(score: number, notice: any, input: any) {
  const company = normaliseCompanyName(input?.companyName || "");
  const supplier = normaliseCompanyName(notice?.awardedSupplier || "");
  const hasSource = Boolean(notice?.url && noticeRecordId(notice));

  if (company && supplier && supplier.includes(company)) return "Verified";
  if (score >= 70 && hasSource) return "Verified";
  if (score >= 55 && hasSource) return "Inferred";
  if (score >= 40) return "Strategic target";
  return "Not confirmed";
}

export function scoreNoticeForClient(notice: any, input: any) {
  const sector = resolveSectorFromInput(input);
  const text = noticeText(notice);
  const company = normaliseCompanyName(input?.companyName || "");
  const supplier = normaliseCompanyName(notice?.awardedSupplier || "");
  const recordValue = noticeRecordValue(notice);
  const reasons: string[] = [];

  let score = 0;

  const matchedTerms = sector.terms.filter(term => text.includes(term.toLowerCase()));
  if (matchedTerms.length) {
    score += Math.min(45, matchedTerms.length * 14);
    reasons.push(`service match: ${matchedTerms.slice(0, 4).join(", ")}`);
  }

  if (notice?.keyword && sector.terms.some(term => String(notice.keyword).toLowerCase().includes(term.split(" ")[0]))) {
    score += 12;
    reasons.push(`keyword match: ${notice.keyword}`);
  }

  if (company && supplier && supplier.includes(company)) {
    score += 45;
    reasons.push("client appears as awarded supplier");
  }

  if (String(notice?.status || "").toLowerCase().includes("open")) {
    score += 10;
    reasons.push("open opportunity");
  }

  if (String(notice?.status || "").toLowerCase().includes("award") || notice?.awardedSupplier) {
    score += 8;
    reasons.push("award / incumbent signal");
  }

  if (recordValue > 0) {
    score += 8;
    reasons.push("stated contract value");
  }

  if (notice?.buyer) {
    score += 5;
    reasons.push("named buyer");
  }

  if (notice?.url && noticeRecordId(notice)) {
    score += 7;
    reasons.push("source record available");
  }

  score = Math.max(0, Math.min(100, score));

  const cap = parseMoneyCap(input);
  const isRelevant = score >= 55;
  const addressableValue = isRelevant && recordValue > 0 ? Math.min(recordValue, cap) : 0;

  return {
    ...notice,
    recordId: noticeRecordId(notice),
    recordValue,
    relevanceScore: score,
    confidence: confidenceGrade(score),
    trustStatus: trustStatusForNotice(score, notice, input),
    relevanceReasons: reasons,
    addressableValue,
    sourceUrl: notice?.url || ""
  };
}

export function buildTrustLayer(input: any, data: any) {
  const open = data?.contractsFinder?.open || [];
  const awarded = data?.contractsFinder?.awarded || [];

  const scoredOpen = open.map((notice: any) => ({
    ...scoreNoticeForClient(notice, input),
    sourceBucket: "open"
  }));

  const scoredAwarded = awarded.map((notice: any) => ({
    ...scoreNoticeForClient(notice, input),
    sourceBucket: "awarded"
  }));

  const pulled = [...scoredOpen, ...scoredAwarded];
  const relevant = pulled
    .filter((notice: any) => notice.relevanceScore >= 55)
    .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);

  const relevantOpen = relevant.filter((notice: any) => notice.sourceBucket === "open");
  const relevantAwarded = relevant.filter((notice: any) => notice.sourceBucket === "awarded");
  const verified = relevant.filter((notice: any) => notice.trustStatus === "Verified");
  const inferred = relevant.filter((notice: any) => notice.trustStatus === "Inferred");
  const strategic = relevant.filter((notice: any) => notice.trustStatus === "Strategic target");

  const buyers = new Set(relevant.map((notice: any) => notice.buyer).filter(Boolean));
  const suppliers = new Set(relevantAwarded.map((notice: any) => notice.awardedSupplier).filter(Boolean));

  const pulledValue = pulled.reduce((sum: number, notice: any) => sum + notice.recordValue, 0);
  const relevantValue = relevant.reduce((sum: number, notice: any) => sum + notice.recordValue, 0);
  const addressableValue = relevant.reduce((sum: number, notice: any) => sum + notice.addressableValue, 0);

  return {
    generatedAt: nowIso(),
    sectorLens: resolveSectorFromInput(input).label,
    clientCapacityCap: parseMoneyCap(input),
    pulledCount: pulled.length,
    relevantCount: relevant.length,
    noisyCount: pulled.length - relevant.length,
    relevantOpenCount: relevantOpen.length,
    relevantAwardCount: relevantAwarded.length,
    verifiedCount: verified.length,
    inferredCount: inferred.length,
    strategicCount: strategic.length,
    distinctRelevantBuyers: buyers.size,
    distinctRelevantSuppliers: suppliers.size,
    totalPulledRecordValue: pulledValue,
    totalRelevantRecordValue: relevantValue,
    addressableOpportunityValue: addressableValue,
    keywords: data?.keywords || [],
    regions: data?.regions || "Not stated",
    relevantRecords: relevant.slice(0, 30),
    topRelevantRecords: relevant.slice(0, 10),
    excludedRecords: pulled.filter((notice: any) => notice.relevanceScore < 55).slice(0, 20)
  };
}

function trustLayerMarkdown(input: any, data: any) {
  const trust = buildTrustLayer(input, data);

  const rows = trust.topRelevantRecords.length
    ? trust.topRelevantRecords
        .map((n: any, index: number) => {
          return `${index + 1}. ${n.title}
- Trust: ${n.trustStatus}
- Confidence: ${n.confidence}
- Relevance score: ${n.relevanceScore}/100
- Buyer: ${n.buyer || "Not stated"}
- Supplier / incumbent: ${n.awardedSupplier || "Not stated"}
- Pulled record value: ${trustMoney(n.recordValue)}
- Addressable value signal: ${trustMoney(n.addressableValue)}
- Source record ID: ${n.recordId || "Not stated"}
- Source URL: ${n.sourceUrl || "Not stated"}
- Why included: ${n.relevanceReasons.join("; ") || "No strong reason recorded"}`
        })
        .join("\n\n")
    : "No relevant records passed the relevance threshold. Treat buyer ideas as strategic targets, not verified opportunities.";

  return `
TRUST LAYER — STRUCTURED DATA FILTER

Definitions:
- Pulled records = all Contracts Finder records returned by the data search.
- Relevant records = pulled records that match the client's services and buyer route with relevance score >= 55/100.
- Addressable opportunity value = capped value signal from relevant records only. It is not a revenue forecast.
- Verified = directly supported by a source record URL/ID and strong relevance.
- Inferred = supported by a source record but relevance still needs human checking.
- Strategic target = commercially sensible target but not directly verified by a pulled record.
- Not confirmed = do not present as fact.

Summary:
- Sector lens: ${trust.sectorLens}
- Pulled records: ${trust.pulledCount}
- Relevant records: ${trust.relevantCount}
- Excluded / noisy records: ${trust.noisyCount}
- Relevant open opportunities: ${trust.relevantOpenCount}
- Relevant award signals: ${trust.relevantAwardCount}
- Verified source-backed records: ${trust.verifiedCount}
- Inferred source-backed records: ${trust.inferredCount}
- Strategic target records: ${trust.strategicCount}
- Distinct relevant buyers: ${trust.distinctRelevantBuyers}
- Distinct relevant suppliers: ${trust.distinctRelevantSuppliers}
- Total pulled-record value: ${trustMoney(trust.totalPulledRecordValue)}
- Relevant pulled-record value: ${trustMoney(trust.totalRelevantRecordValue)}
- Addressable opportunity value signal: ${trustMoney(trust.addressableOpportunityValue)}
- Client capacity cap used: ${trustMoney(trust.clientCapacityCap)}
- Regions searched: ${trust.regions}
- Keywords searched: ${trust.keywords.join(", ") || "Not stated"}

Top relevant source records:
${rows}
`;
}

export function collectEvidenceStats(scan: ScanRecord) {
  const trust = buildTrustLayer(scan.input_json || {}, scan.procurement_json || {});

  return {
    openCount: trust.pulledCount,
    awardCount: trust.relevantCount,
    buyerCount: trust.distinctRelevantBuyers,
    supplierCount: trust.distinctRelevantSuppliers,
    knownValue: trust.addressableOpportunityValue,
    largestValue: trust.totalRelevantRecordValue,
    liveDeadlines: trust.relevantOpenCount,
    pulledCount: trust.pulledCount,
    relevantCount: trust.relevantCount,
    noisyCount: trust.noisyCount,
    verifiedCount: trust.verifiedCount,
    inferredCount: trust.inferredCount,
    strategicCount: trust.strategicCount,
    totalPulledRecordValue: trust.totalPulledRecordValue,
    totalRelevantRecordValue: trust.totalRelevantRecordValue,
    addressableOpportunityValue: trust.addressableOpportunityValue,
    keywords: trust.keywords,
    regions: trust.regions,
    sectorLens: trust.sectorLens
  };
}

export function evidenceBar(label: string, detail: string, valueLabel: string, width: number) {
  const safeWidth = Math.max(8, Math.min(100, width));
  return `
    <div class="evidence-bar">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(detail)}</small>
      </div>
      <b>${escapeHtml(valueLabel)}</b>
      <span><i style="width:${safeWidth}%"></i></span>
    </div>
  `;
}


export function evidenceDashboard(scan: ScanRecord) {
  const trust = buildTrustLayer(scan.input_json || {}, scan.procurement_json || {});
  return renderWorldClassDashboard(trust);
}



export function buildPrompt(input: z.infer<typeof intakeSchema>, data: ProcurementData) {
  return `
You are AtlasRevenue Agent, a sharp UK public-sector revenue intelligence analyst.

This is a paid commercial scan. It must feel like a practical revenue map, not a generic AI report.

ABSOLUTE IDENTITY RULE:
The intake is the source of truth. Do not replace the company with another similar-name business.
Before using a public fact, confirm it matches at least two of: website, location, services, founder/name, sector, trading identity.
If not confirmed, write "not confirmed from sources checked" and do not use the fact.
Never infer Companies House records, assets, address, team size, founding date, or service category from name-only matching.

TRUST LAYER RULE:
You must separate:
1. Pulled records
2. Relevant records
3. Addressable opportunity value
4. AI interpretation

Every major recommendation must carry one of these labels:
- [Verified] Directly supported by a pulled source record ID/URL.
- [Inferred] Supported by a source record, but relevance requires human verification.
- [Strategic target] Commercially sensible but not directly verified by a pulled record.
- [Not confirmed] Do not treat as fact.

Do not present total pulled-record value as revenue potential.
Only use addressable opportunity value signal when discussing opportunity size, and state that it is capped and directional, not a forecast.

Company intake:
${JSON.stringify(input, null, 2)}

${trustLayerMarkdown(input, data)}

---

PARTNER VOICE — apply throughout the entire report:
Write as a senior commercial partner addressing the managing director directly. "You" means the company. No passive voice where "you" works. Sound like someone who has read the data, drawn a conclusion, and is now telling the client what it means for their business — not summarising the output of a system. Confident where the data supports it. Honest where it does not.

ZERO SELF-REFERENCE — hard constraint:
Remove from your output any sentence that:
- Names or references this scan, this report, this dashboard, or this analysis
- Explains what the report is doing ("This section analyses...", "The following table shows...", "The goal of this report is...")
- Describes how data was gathered ("We pulled X records from...", "The trust filter identified...", "AtlasRevenue indexed...")
Every word must be commercial intelligence directed at the client. Not process description.

LOAD-BEARING NUMBERS — hard constraint:
Every figure above £50k must be followed immediately by: (1) where it sits — named buyer, region, or contract reference; (2) when it becomes live — renewal window, deadline, or urgency horizon; (3) what to do with it — the specific next action. A number without a direct line to action is dead weight. Connect it or cut it.

OPENING THESIS — required before the EDP table:
Section 1 must open with a direct paragraph BEFORE the table. It must:
- Name the specific geography, sector, and the single biggest commercial opportunity or threat visible in the pulled data
- State a specific urgency window (days or months, not "soon" or "in due course")
- Name actual buyers or incumbents from pulled records where possible
- End with the commercial consequence — what the client gains by moving, and what they concede by waiting
If the evidence is too thin to support a specific thesis, write: "The evidence base for [Company] is limited. The clearest available move is [specific action from available data] — start there."

VERDICT VOICE:
The Verdict field must be a direct commercial sentence, not a label.
BAD: "Bid Selectively"
BAD: "Company shows moderate readiness"
GOOD: "Move on [Buyer X] in the next 60 days — this is your clearest opening."
GOOD: "Your [region] incumbency expires before a competitor notices. Contact [Buyer] this month."
GOOD: "Not ready for a prime contract. Get on [Framework Y] first — that is your 18-month revenue route."
The verdict must be specific to this company's actual situation.

---

Return clean Markdown only.

Use this exact structure:

# AtlasRevenue Scan: [Company Name]

## 1. Executive Decision Panel
Open with the OPENING THESIS paragraph, then give the decision panel with these exact fields:

| Field | Answer |
|---|---|
| Verdict | |
| Can they win now? | |
| Best first money route | |
| Fastest action this week | |
| Main blocker | |
| Evidence Grade | |
| Recommended route | |

Rules:
- Write the thesis paragraph first — before the table.
- The verdict must be a direct commercial sentence with a named action (see VERDICT VOICE rule above).
- If verified evidence is weak, do not pretend they are bid-ready.
- Evidence Grade must be A, B, C, D or E:
  - A = strong source-backed evidence and strong sector alignment
  - B = good market signal but some readiness checks needed
  - C = usable but mixed/noisy evidence
  - D = low exact-match evidence; strategic scan, not bid-ready map
  - E = insufficient evidence
- Do not use the phrase "Data quality: Weak" anywhere. Use Evidence Grade instead.

## 2. Evidence Grade and Scan Basis
Include:
- Corrected sector lens
- Regions searched
- Keywords searched
- Open records shown
- Award signals shown
- Total records pulled
- Relevant records
- Verified evidence records
- Inferred records
- Strategic target records
- Excluded / noisy records
- Addressable value signal
- Relevant pulled-record value
- Evidence interpretation

Rules:
- If sector lens and keywords conflict, say this is a QA issue and correct the lens/keyword interpretation.
- Cleaning reports must not use property-survey keywords like building surveying, condition survey, estate consultancy, asset management, property consultancy or built asset consultancy unless the company is actually property/built-environment.
- Software/ICT reports must be framed as software, ICT and digital transformation, not generic professional services.
- Training/enterprise support reports must be framed as training, skills, enterprise support and professional services.

## 3. Market Position Summary
Write as if briefing the client on their market position, not summarising a tool's output. Cover:
- What the evidence base shows about their real competitive position in this sector and region
- Which buyers have money moving and which are dormant
- What the addressable value signal means in practice — named buyers, named routes, specific amounts tied to specific actions
- Where they sit relative to the identified incumbents
Use compact value notation (£k / £m / £bn). No sentence may start with "The data shows..." or "This section..." — start every sentence with a commercial insight.

## 4. Source-Backed Evidence
Only use pulled source records or clearly labelled client-provided evidence.
For each top record:
- Record name
- Buyer
- Evidence status
- Confidence
- Value shown
- Source reference
- Commercial meaning
- Best use

Rules:
- If verified evidence count is 0, do not label any recommendation [Verified] unless it is explicitly client-provided.
- Client-provided evidence must be labelled [Client-provided], not generic [Verified].
- Do not invent buyers, awards, suppliers, values, source URLs, certifications or case studies.

## 5. Money Map: Best Routes to Revenue
Create a table:
Route | Buyer type | Speed to revenue | Difficulty | Evidence strength | Why money exists | Best next action | Score /100

Include 5-7 routes where possible:
- Direct tender
- Framework
- DPS
- Subcontract / partner
- Pilot or grant-funded route
- Buyer outreach / renewal watch
- Compliance preparation

Rules:
- Rank by evidence strength, buyer fit, speed, difficulty and readiness.
- If evidence is weak, make the route cautious.

## 6. Buyer Watchlist
Create a table:
Buyer | Buyer type | Current incumbent | Why they matter | Likely buying route | Evidence strength | Fit score | Next action

Rules:
- Verified buyers must come from pulled records or verified sources.
- Strategic buyers are allowed only when labelled [Strategic target].
- Do not invent named buyers.
- For weak evidence reports, use cautious language such as monitor, validate or qualify.
- The "Current incumbent" column must name the current holder where the pulled data includes an "Awarded supplier" field. Use the format "Incumbent: [name]" or "Not stated" if unknown. This is critical intelligence — do not leave it blank if an awarded supplier is in the data.
- Where an incumbent appears in multiple awarded records, note the repeat win: "Incumbent: [name] (×3 awards)".

## 6a. Incumbent Contract Timeline
Map every contract in the pulled data where a supplier is named (incumbent or recently awarded) onto a 0-to-24-month renewal horizon.

Build a table:
Contract | Buyer | Incumbent / awarded supplier | Value | Published / awarded date | Est. contract end | Est. renewal window opens | Urgency

Urgency:
- **ACT NOW** — renewal process likely already underway or opening within 6 months
- **POSITION** — renewal window opens 6-12 months out; start building buyer relationship
- **WATCH** — 12-24 months; log and track; seek informal contact
- **HORIZON** — beyond 24 months or dates unconfirmable

After the table, write a direct paragraph (no preamble, no self-reference):
Name the single most valuable incumbent position approaching renewal, state the estimated window date, and give one specific action — who to contact, what to say, and why waiting past [specific month] forfeits the advantage.

If no incumbents are named in the pulled records, write: "No named incumbents in pulled records. The Buyer Watchlist above identifies who to approach before contracts are formally re-tendered."

Date estimation guidance: if no end date is given, estimate from published/awarded date + typical sector contract length. Cleaning/FM: 3-5 years. IT: 2-4 years. Consultancy: 1-3 years. Construction: 1-3 years. Training: 1-2 years.

## 7. Bid Readiness Score
Give:
- Overall score /100
- Verdict: Bid now / Bid selectively / Prepare first / Not ready
- Category scores:
  - Public-sector fit
  - Evidence strength
  - Buyer relevance
  - Compliance readiness
  - Capacity fit
  - Case study strength
  - Route clarity
  - Immediate bid readiness

Then explain:
- What blocks the next 20 points
- What to fix in 30 days

Rules:
- Market demand does not automatically mean bid readiness.
- Missing insurance, accreditations, case studies, framework access, capacity or cyber/compliance proof should reduce readiness.

## 8. Do Not Chase These Yet
Create a table:
Contract / route to avoid | Why risky | Proof missing | When it becomes suitable

Give honest negative guidance. Include unsuitable or premature routes such as:
- oversized prime contracts
- wrong-sector framework lots
- low-relevance pulled records
- generic low-margin work
- tenders demanding proof the company does not yet have

## 9. 30-Day Activation Pack
Write this section as direct instructions addressed to the company: "Week 1, you need to..." — not "The company should...".

Weekly actions:
- Week 1: specific evidence-gathering and access actions tied to the named buyers and routes in sections 4-6
- Week 2: capability statement drafting and bid pack — with specific section headings drawn from this company's actual services and evidence
- Week 3: buyer outreach — name specific buyers from the watchlist, with timing and opening angle
- Week 4: bid / partner activation — specify which route, which buyer, and what the entry point looks like

Then include:
- Documents needed before bidding (sector-specific — list exact certifications, insurances, case study formats)
- Capability statement bullets (pull from the company's stated services and the verified/inferred evidence)
- Buyer outreach email (named buyer from watchlist; open with a specific hook from the pulled records, not a generic intro)
- Partner outreach email (named sector; reference the route identified in the Money Map)
- LinkedIn message (short; reference a specific notice or buyer activity)
- Bid/no-bid checklist (specific to the top-scoring route in section 5)

Every item must be specific to this company's actual situation. No sentence that could apply to any other company is allowed.

## 10. QA Notes / Integrity Checks
Create a final table:
Check | Status | Notes

Include checks for:
- sector and keyword match
- verified labels
- zero verified evidence with verified claims
- buyer invention
- client-provided evidence labelling
- company punctuation
- HTML entity cleanup
- source formatting
- required sections
- human verification required

Final commercial note:
End with:
"No outcome is guaranteed. This scan is commercial intelligence, not legal, procurement or financial advice. Human verification is required before bid decisions."
`;
}
