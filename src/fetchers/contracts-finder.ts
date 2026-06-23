import { ProcurementNotice } from "../types.js";

export function noticeUrl(id: string) {
  return id ? `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(id)}` : "https://www.contractsfinder.service.gov.uk/";
}

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'");
}

export function normaliseNotice(raw: any, keyword: string): ProcurementNotice | null {
  const item = raw?.item || raw;
  if (!item) return null;

  const id = String(item.id || item.noticeIdentifier || "");
  const title = decodeHtmlEntities(String(item.title || "").trim());
  if (!title) return null;

  return {
    source: "Contracts Finder",
    id,
    title,
    buyer: decodeHtmlEntities(String(item.organisationName || "Not stated")),
    description: decodeHtmlEntities(String(item.description || "").slice(0, 900)),
    status: String(item.noticeStatus || ""),
    type: String(item.noticeType || ""),
    region: String(item.regionText || item.region || ""),
    publishedDate: item.publishedDate || null,
    deadlineDate: item.deadlineDate || null,
    awardedDate: item.awardedDate || null,
    valueLow: item.valueLow != null ? (Number(item.valueLow) || null) : null,
    valueHigh: item.valueHigh != null ? (Number(item.valueHigh) || null) : null,
    awardedValue: item.awardedValue != null ? (Number(item.awardedValue) || null) : null,
    awardedSupplier: decodeHtmlEntities(String(item.awardedSupplier || "")),
    suitableForSme: typeof item.isSuitableForSme === "boolean" ? item.isSuitableForSme : null,
    url: noticeUrl(id),
    keyword
  };
}

const CF_ENDPOINTS = [
  "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json",
  "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/JSON",
  "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices"
];

export async function contractsFinderPage(
  searchCriteria: any,
  keyword: string,
  from: number,
  size: number,
  signal?: AbortSignal
): Promise<{ notices: ProcurementNotice[]; total: number }> {
  let lastError = "";
  for (const url of CF_ENDPOINTS) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ searchCriteria, size, from }),
        signal
      });
      if (!resp.ok) { lastError = `${resp.status} ${resp.statusText}`; continue; }
      const data = await resp.json();
      const list = Array.isArray(data.noticeList) ? data.noticeList : [];
      // CF returns maxResults = total matching notices in the full result set
      const total: number = typeof data.maxResults === "number" ? data.maxResults : list.length + from;
      const notices = list.map((e: any) => normaliseNotice(e, keyword)).filter(Boolean) as ProcurementNotice[];
      return { notices, total };
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  }
  throw new Error(lastError || "Contracts Finder search failed");
}

// Paginates through CF exhaustively — stops only when CF has no more results.
export async function contractsFinderSearchAll(
  searchCriteria: any,
  keyword: string,
  signal?: AbortSignal
): Promise<ProcurementNotice[]> {
  const PAGE_SIZE = 100;
  const all: ProcurementNotice[] = [];
  let from = 0;

  while (true) {
    const { notices, total } = await contractsFinderPage(searchCriteria, keyword, from, PAGE_SIZE, signal);
    all.push(...notices);
    if (notices.length < PAGE_SIZE || all.length >= total) break;
    from += PAGE_SIZE;
  }

  return all;
}

export function dedupeNotices(notices: ProcurementNotice[]) {
  const seen = new Set<string>();
  const output: ProcurementNotice[] = [];

  for (const notice of notices) {
    const key = notice.id || `${notice.title}-${notice.buyer}-${notice.publishedDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(notice);
  }

  return output;
}

// Second-pass dedup: collapse framework lots that share the exact same title+buyer.
// Sorts by deadline (earliest first) so the most urgent lot is kept.
// Also deduplicates by URL for cross-source (CF + FTS) overlaps.
export function dedupeNoticesSoft(notices: ProcurementNotice[]): ProcurementNotice[] {
  const byDeadline = [...notices].sort((a, b) => {
    const da = a.deadlineDate ? new Date(a.deadlineDate).getTime() : Infinity;
    const db = b.deadlineDate ? new Date(b.deadlineDate).getTime() : Infinity;
    return da - db;
  });
  const seenUrl = new Set<string>();
  const seenTitleBuyer = new Set<string>();
  const out: ProcurementNotice[] = [];
  for (const n of byDeadline) {
    const urlKey = n.url || "";
    if (urlKey && seenUrl.has(urlKey)) continue;
    if (urlKey) seenUrl.add(urlKey);
    const tbKey = `${n.title.trim().toLowerCase()}|||${(n.buyer || "").trim().toLowerCase()}`;
    if (seenTitleBuyer.has(tbKey)) continue;
    seenTitleBuyer.add(tbKey);
    out.push(n);
  }
  return out;
}
