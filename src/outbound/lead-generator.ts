import crypto from "crypto";
import { pool } from "../config.js";
import { DESK_PROFILES } from "../data/desk-profiles.js";
import { computeRenewalRadar, renewalDaysLeft, anyKeywordMatches, isOverseasNotice } from "../lib/intel.js";
import type { SupplierEntity } from "../intelligence/supplier-graph/types.js";
import { getOutboundConfig, setOutboundConfig, insertLead } from "./db.js";
import { qualifyLeadTriggerPair, DESK_SUPPLIER_SIC_PREFIXES } from "./qualification.js";
import { checkSuppression } from "./suppression.js";
import type { OutboundLead } from "./types.js";

type RenewalCandidate = {
  buyer: string;
  title: string;
  awardedValue: number | null;
  awardedSupplier: string;
  contractEnd?: string | null;
  url: string;
};

async function findSuppliersBySicPrefix(prefixes: string[], limit = 100): Promise<SupplierEntity[]> {
  if (!pool || prefixes.length === 0) return [];
  const clauses = prefixes.map((_, i) => `EXISTS (SELECT 1 FROM unnest(sic_codes) AS s WHERE s LIKE $${i + 1})`);
  const params = prefixes.map(p => `${p}%`);
  const r = await pool.query<SupplierEntity>(
    `SELECT * FROM supplier_entities
     WHERE company_status = 'active' AND (${clauses.join(" OR ")})
     ORDER BY total_wins DESC
     LIMIT $${params.length + 1}`,
    [...params, limit],
  );
  return r.rows;
}

function extractRegionFromBuyer(buyer: string): string | null {
  const regionPatterns: Array<[RegExp, string]> = [
    [/\blondon\b/i, "Greater London"],
    [/\bmanchester\b/i, "Greater Manchester"],
    [/\bbirmingham\b/i, "West Midlands"],
    [/\bleeds\b/i, "West Yorkshire"],
    [/\bbristol\b/i, "Bristol"],
    [/\bnewcastle\b/i, "Tyne and Wear"],
    [/\bliverpool\b/i, "Merseyside"],
    [/\bsheffield\b/i, "South Yorkshire"],
    [/\bnottingham\b/i, "Nottinghamshire"],
    [/\bcardiff\b|wales\b/i, "Wales"],
    [/\bedinburgh\b|scotland\b/i, "Scotland"],
    [/\bbelfast\b|northern ireland\b/i, "Northern Ireland"],
  ];
  for (const [re, region] of regionPatterns) {
    if (re.test(buyer)) return region;
  }
  return null;
}

function extractRegionFromAddress(address: string | null): string | null {
  if (!address) return null;
  return extractRegionFromBuyer(address);
}

async function getRotationDesks(): Promise<typeof DESK_PROFILES> {
  const liveDesks = DESK_PROFILES.filter(d => d.live);
  if (liveDesks.length === 0) return [];

  const lastIdx = parseInt(await getOutboundConfig("lead_gen_desk_offset") || "0", 10);
  const desksPerRun = 3;
  const start = lastIdx % liveDesks.length;
  const selected: typeof DESK_PROFILES = [];

  for (let i = 0; i < desksPerRun && i < liveDesks.length; i++) {
    selected.push(liveDesks[(start + i) % liveDesks.length]);
  }

  await setOutboundConfig("lead_gen_desk_offset", String(start + desksPerRun));
  return selected;
}

export async function generateDailyLeads(campaignId?: string): Promise<{
  desksProcessed: string[];
  contractsFound: number;
  suppliersMatched: number;
  leadsCreated: number;
}> {
  const desks = await getRotationDesks();
  const stats = { desksProcessed: [] as string[], contractsFound: 0, suppliersMatched: 0, leadsCreated: 0 };

  for (const desk of desks) {
    try {
      const result = await generateLeadsForDesk(desk.slug, campaignId);
      stats.desksProcessed.push(desk.slug);
      stats.contractsFound += result.contractsFound;
      stats.suppliersMatched += result.suppliersMatched;
      stats.leadsCreated += result.leadsCreated;
    } catch (err) {
      console.error(`[outbound] lead gen failed for desk ${desk.slug}:`, err);
    }
  }

  console.log(`[outbound] daily lead gen complete:`, stats);
  return stats;
}

async function generateLeadsForDesk(deskSlug: string, campaignId?: string): Promise<{
  contractsFound: number;
  suppliersMatched: number;
  leadsCreated: number;
}> {
  const desk = DESK_PROFILES.find(d => d.slug === deskSlug);
  if (!desk) return { contractsFound: 0, suppliersMatched: 0, leadsCreated: 0 };

  // Pull renewal candidates from desk cache
  const renewals = await getRenewalCandidatesFromCache(deskSlug);
  if (renewals.length === 0) return { contractsFound: 0, suppliersMatched: 0, leadsCreated: 0 };

  const now = new Date();
  const radarNotices = computeRenewalRadar(renewals, now, { horizonDays: 365, limit: 50 });
  const stats = { contractsFound: radarNotices.length, suppliersMatched: 0, leadsCreated: 0 };

  // Find suppliers whose SIC codes match this desk
  const sicPrefixes = DESK_SUPPLIER_SIC_PREFIXES[deskSlug] || [];
  const suppliers = await findSuppliersBySicPrefix(sicPrefixes, 200);

  for (const contract of radarNotices.slice(0, 30)) {
    const daysLeft = contract.contractEnd ? renewalDaysLeft(contract.contractEnd, now) : null;
    const buyerRegion = extractRegionFromBuyer(contract.buyer);

    for (const supplier of suppliers) {
      const supplierRegion = extractRegionFromAddress(supplier.address);

      const qualification = qualifyLeadTriggerPair({
        supplierSicCodes: supplier.sic_codes || [],
        supplierRegion,
        supplierStatus: supplier.company_status,
        supplierTotalWins: supplier.total_wins,
        buyerRegion,
        contractValue: contract.awardedValue,
        contractDaysLeft: daysLeft,
        deskSlug,
      });

      if (!qualification.qualified) continue;
      stats.suppliersMatched++;

      // Build contact email from pattern (first attempt — will be enriched later)
      const contactEmail = supplier.website
        ? `info@${supplier.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`
        : null;

      const suppression = await checkSuppression({
        email: contactEmail,
        companyNumber: supplier.company_number,
        companyType: supplier.company_type,
        triggerUrl: contract.url,
      });

      if (suppression.suppressed) continue;

      // Count similar opportunities for this supplier in this desk
      const similarCount = radarNotices.filter(r =>
        r.url !== contract.url &&
        (buyerRegion ? extractRegionFromBuyer(r.buyer) === buyerRegion : true)
      ).length;

      const lead: OutboundLead = {
        id: crypto.randomUUID(),
        campaign_id: campaignId || null,
        company_name: supplier.name,
        company_number: supplier.company_number,
        sic_codes: supplier.sic_codes || [],
        address: supplier.address,
        region: supplierRegion,
        company_type: supplier.company_type,
        website: supplier.website,
        contact_email: contactEmail,
        contact_name: null,
        contact_role: null,
        trigger_title: contract.title,
        trigger_buyer: contract.buyer,
        trigger_incumbent: contract.awardedSupplier || null,
        trigger_value: contract.awardedValue,
        trigger_contract_end: contract.contractEnd || null,
        trigger_url: contract.url,
        trigger_days_left: daysLeft,
        similar_count: Math.min(similarCount, 10),
        desk_slug: deskSlug,
        qualification_score: qualification.score,
        qualification_reasons: qualification.reasons,
        status: "qualified",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await insertLead(lead);
      stats.leadsCreated++;

      if (stats.leadsCreated >= 100) break;
    }

    if (stats.leadsCreated >= 100) break;
  }

  return stats;
}

async function getRenewalCandidatesFromCache(deskSlug: string): Promise<RenewalCandidate[]> {
  if (!pool) return [];

  const desk = DESK_PROFILES.find(d => d.slug === deskSlug);
  if (!desk) return [];

  // Read from desk_cache table
  const r = await pool.query<{ data: string | object }>(
    `SELECT data FROM desk_cache WHERE slug = $1`,
    [deskSlug],
  );

  if (!r.rows[0]) return [];

  const data = typeof r.rows[0].data === "string"
    ? JSON.parse(r.rows[0].data)
    : r.rows[0].data;

  const awarded = data?.contractsFinder?.awarded || [];
  const renewalPool = data?.renewalPool || [];
  const combined = [...awarded, ...renewalPool];

  const deskKeywords = desk.categories.flatMap(c => c.keywords.map(k => k.toLowerCase()));

  return combined.filter((n: RenewalCandidate) =>
    !isOverseasNotice(n.title, n.buyer || "") &&
    anyKeywordMatches(n.title.toLowerCase(), deskKeywords) &&
    n.awardedSupplier
  );
}
