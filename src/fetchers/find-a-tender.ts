import { ProcurementNotice } from "../types.js";
import { decodeHtmlEntities } from "./contracts-finder.js";
import { dedupeNotices } from "./contracts-finder.js";
import { enrichNoticeQuality } from "./scoring.js";

export function normaliseFindTenderRelease(release: any, keyword: string): ProcurementNotice | null {
  const tender = release?.tender || {};
  const title = String(tender.title || release.title || "").trim();
  if (!title) return null;

  const buyerName = decodeHtmlEntities(String(release?.buyer?.name || release?.parties?.find?.((party: any) => Array.isArray(party.roles) && party.roles.includes("buyer"))?.name || "Not stated"));
  const amount = tender?.value?.amount != null ? (Number(tender.value.amount) || null) : null;
  const region = String(
    tender?.items?.[0]?.deliveryAddresses?.[0]?.region ||
    release?.parties?.[0]?.address?.region ||
    ""
  );

  return {
    source: "Find a Tender",
    id: String(release.id || release.ocid || ""),
    title,
    buyer: buyerName,
    description: String(tender.description || release.description || "").slice(0, 900),
    status: String(tender.status || ""),
    type: Array.isArray(release.tag) ? release.tag.join(", ") : "",
    region,
    publishedDate: release.date || null,
    deadlineDate: tender?.tenderPeriod?.endDate || null,
    awardedDate: release.date || null,
    valueLow: amount,
    valueHigh: amount,
    awardedValue: amount,
    awardedSupplier: "",
    suitableForSme: null,
    url: release.id ? `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(String(release.id))}` : "https://www.find-tender.service.gov.uk/",
    keyword
  };
}

export async function findTenderSearch(keywords: string[], signal?: AbortSignal): Promise<{ notices: ProcurementNotice[]; errors: string[] }> {
  const errors: string[] = [];
  const keywordSet = keywords.map(k => k.toLowerCase()).filter(Boolean);

  try {
    const to = new Date();
    const from = new Date(to.getTime() - 1000 * 60 * 60 * 24 * 90);
    const url = new URL("https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages");
    url.searchParams.set("limit", "100");
    url.searchParams.set("stages", "tender,award");
    url.searchParams.set("updatedFrom", from.toISOString().slice(0, 19));
    url.searchParams.set("updatedTo", to.toISOString().slice(0, 19));

    const response = await fetch(url, { headers: { Accept: "application/json" }, signal });

    if (!response.ok) {
      return { notices: [], errors: [`Find a Tender OCDS search failed: ${response.status} ${response.statusText}`] };
    }

    const data = await response.json();
    const releases = Array.isArray(data.releases) ? data.releases : [];

    const scored: { notice: ProcurementNotice; score: number }[] = [];
    for (const release of releases) {
      const haystack = [
        release?.tender?.title,
        release?.tender?.description,
        release?.buyer?.name,
        release?.parties?.map?.((party: any) => party?.name).join(" ")
      ].filter(Boolean).join(" ").toLowerCase();

      const matchCount = keywordSet.filter(kw => haystack.includes(kw)).length;
      if (!matchCount) continue;

      const matchedKeyword = keywordSet.find(kw => haystack.includes(kw))!;
      const notice = normaliseFindTenderRelease(release, matchedKeyword);
      if (notice) scored.push({ notice, score: matchCount });
    }

    // primary: most keyword matches; secondary: most recent date
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = new Date(a.notice.publishedDate || a.notice.awardedDate || 0).getTime();
      const db = new Date(b.notice.publishedDate || b.notice.awardedDate || 0).getTime();
      return db - da;
    });
    const notices = scored.map(s => s.notice);

    return { notices: dedupeNotices(notices).map(notice => enrichNoticeQuality(notice, keywords)), errors };
  } catch (error: any) {
    return { notices: [], errors: [error?.message || String(error)] };
  }
}
