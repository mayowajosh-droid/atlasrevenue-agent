import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pool } from "../config.js";
import { DESK_PROFILES } from "../data/desk-profiles.js";
import { computeRenewalRadar, renewalDaysLeft, anyKeywordMatches, isOverseasNotice } from "../lib/intel.js";
import type { SupplierEntity } from "../intelligence/supplier-graph/types.js";
import { getOutboundConfig, setOutboundConfig, insertLead } from "./db.js";
import { qualifyLeadTriggerPair, DESK_SUPPLIER_SIC_PREFIXES } from "./qualification.js";
import { checkSuppression } from "./suppression.js";
import type { OutboundLead } from "./types.js";

const SEGMENT_TO_DESK: Record<string, string> = {
  "Facilities & Cleaning": "facilities",
  "Construction & Retrofit": "construction",
  "Social Care": "social-care",
  "Energy & Solar": "energy",
  "Digital & IT": "digital",
  "Security": "security",
  "Waste": "waste",
  "Transport & Fleet": "transport",
  "Catering": "catering",
  "Legal & Professional": "legal",
  "Recruitment & HR": "recruitment",
  "Marketing & Creative": "comms",
  "Grounds & Landscaping": "facilities",
  "Plumbing & M&E": "construction",
  "Fire & Compliance": "facilities",
  "Training": "education",
  "Consultancy": "consulting",
  "Scaffolding & Access": "construction",
};

type ProspectJson = {
  company: string;
  segment: string;
  keyword?: string;
  awards?: number;
  bestValue?: number;
  title: string;
  buyer: string;
  value?: number;
  date?: string;
  region?: string;
};

type ProspectCsv = {
  company: string;
  segment: string;
  region: string;
  last_award_title: string;
  buyer: string;
  award_value: string;
  award_date: string;
  awards_15mo: string;
  cold_open_hook: string;
};

function parseJsonProspects(raw: string): ProspectJson[] {
  const prospects: ProspectJson[] = [];
  const objRegex = /\{[^{}]+\}/g;
  let match;
  while ((match = objRegex.exec(raw)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.company && obj.title && obj.buyer) {
        prospects.push(obj);
      }
    } catch { /* skip malformed entries */ }
  }
  return prospects;
}

function parseCsvProspects(raw: string): ProspectCsv[] {
  const lines = raw.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const prospects: ProspectCsv[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { fields.push(current); current = ""; continue; }
      current += ch;
    }
    fields.push(current);
    if (fields.length >= 6) {
      prospects.push({
        company: fields[0].trim(),
        segment: fields[1].trim(),
        region: fields[2].trim(),
        last_award_title: fields[3].trim(),
        buyer: fields[4].trim(),
        award_value: fields[5].trim(),
        award_date: fields[6]?.trim() || "",
        awards_15mo: fields[7]?.trim() || "0",
        cold_open_hook: fields[8]?.trim() || "",
      });
    }
  }
  return prospects;
}

function parsePenceValue(val: string | number | undefined): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === "number") return val;
  const cleaned = val.replace(/[£,]/g, "").trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  if (cleaned.endsWith("m")) return Math.round(num * 1_000_000 * 100);
  if (cleaned.endsWith("k")) return Math.round(num * 1_000 * 100);
  return Math.round(num * 100);
}

export async function bulkImportProspects(): Promise<{
  jsonLoaded: number;
  csvLoaded: number;
  skippedDuplicates: number;
  total: number;
}> {
  if (!pool) throw new Error("No database connection");

  const existing = await pool.query<{ company_name: string }>(
    `SELECT DISTINCT company_name FROM outbound_leads`,
  );
  const existingNames = new Set(existing.rows.map(r => r.company_name.toLowerCase()));

  const stats = { jsonLoaded: 0, csvLoaded: 0, skippedDuplicates: 0, total: 0 };
  const seen = new Set<string>();

  const jsonPath = process.env.PROSPECT_POOL_PATH || path.resolve(process.cwd(), "data/prospects-pool.json");
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const prospects = parseJsonProspects(raw);
    for (const p of prospects) {
      const key = p.company.toLowerCase();
      if (existingNames.has(key) || seen.has(key)) { stats.skippedDuplicates++; continue; }
      seen.add(key);

      const deskSlug = SEGMENT_TO_DESK[p.segment] || null;
      const lead: OutboundLead = {
        id: crypto.randomUUID(),
        campaign_id: null,
        company_name: p.company,
        company_number: null,
        sic_codes: [],
        address: null,
        region: p.region || null,
        company_type: null,
        website: null,
        contact_email: null,
        contact_name: null,
        contact_role: null,
        trigger_title: p.title,
        trigger_buyer: p.buyer,
        trigger_incumbent: null,
        trigger_value: p.value ? Math.round(p.value * 100) : null,
        trigger_contract_end: null,
        trigger_url: "",
        trigger_days_left: null,
        similar_count: 0,
        desk_slug: deskSlug,
        qualification_score: Math.min(100, 40 + (p.awards || 0) * 5),
        qualification_reasons: [
          `${p.awards || 0} previous public contract wins`,
          `Segment: ${p.segment}`,
          p.region ? `Region: ${p.region}` : null,
        ].filter(Boolean) as string[],
        status: "qualified",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await insertLead(lead);
      stats.jsonLoaded++;
    }
  }

  const csvPath = process.env.PROSPECT_CSV_PATH || path.resolve(process.cwd(), "data/prospects-500.csv");
  if (fs.existsSync(csvPath)) {
    const raw = fs.readFileSync(csvPath, "utf8");
    const prospects = parseCsvProspects(raw);
    for (const p of prospects) {
      const key = p.company.toLowerCase();
      if (existingNames.has(key) || seen.has(key)) { stats.skippedDuplicates++; continue; }
      seen.add(key);

      const deskSlug = SEGMENT_TO_DESK[p.segment] || null;
      const awards = parseInt(p.awards_15mo, 10) || 0;
      const lead: OutboundLead = {
        id: crypto.randomUUID(),
        campaign_id: null,
        company_name: p.company,
        company_number: null,
        sic_codes: [],
        address: null,
        region: p.region || null,
        company_type: null,
        website: null,
        contact_email: null,
        contact_name: null,
        contact_role: null,
        trigger_title: p.last_award_title,
        trigger_buyer: p.buyer,
        trigger_incumbent: null,
        trigger_value: parsePenceValue(p.award_value),
        trigger_contract_end: null,
        trigger_url: "",
        trigger_days_left: null,
        similar_count: 0,
        desk_slug: deskSlug,
        qualification_score: Math.min(100, 40 + awards * 5),
        qualification_reasons: [
          `${awards} recent contract wins`,
          `Segment: ${p.segment}`,
          p.region ? `Region: ${p.region}` : null,
        ].filter(Boolean) as string[],
        status: "qualified",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await insertLead(lead);
      stats.csvLoaded++;
    }
  }

  stats.total = stats.jsonLoaded + stats.csvLoaded;
  console.log(`[outbound] bulk import complete:`, stats);
  return stats;
}

function normaliseName(name: string): string {
  return name.toLowerCase()
    .replace(/\b(ltd|limited|plc|llp|uk|group|company|co|inc|corporation|corp)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function domainFromWebsite(website: string | null): string | null {
  if (!website) return null;
  try {
    const host = website.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    if (!host || host.includes("companieshouse") || host.includes("gov.uk")) return null;
    return host;
  } catch { return null; }
}

export async function enrichLeadsFromSupplierGraph(): Promise<{
  total: number;
  matched: number;
  websiteFound: number;
  emailSet: number;
  addressSet: number;
  scoreUpdated: number;
  debug: { supplierCount: number; sampleLeadNorms: string[]; sampleSupplierNorms: string[] };
}> {
  if (!pool) throw new Error("No database connection");

  const stats = { total: 0, matched: 0, websiteFound: 0, emailSet: 0, addressSet: 0, scoreUpdated: 0 };

  // Build a normalised_name lookup column on outbound_leads, then JOIN in one pass
  const countResult = await pool.query<{ cnt: string }>(
    `SELECT count(*) as cnt FROM outbound_leads WHERE status IN ('qualified','approved')`,
  );
  stats.total = parseInt(countResult.rows[0].cnt, 10);

  // Batch: update company_number, address, sic_codes, company_type, website from supplier_entities
  const mainUpdate = await pool.query(`
    UPDATE outbound_leads ol SET
      company_number = COALESCE(ol.company_number, se.company_number),
      address = COALESCE(ol.address, se.address),
      sic_codes = CASE WHEN array_length(ol.sic_codes, 1) > 0 THEN ol.sic_codes ELSE se.sic_codes END,
      company_type = COALESCE(ol.company_type, se.company_type),
      website = COALESCE(ol.website, se.website),
      qualification_score = CASE
        WHEN ol.qualification_score < 70 AND se.total_wins > 0
        THEN LEAST(100, ol.qualification_score + LEAST(se.total_wins * 3, 30))
        ELSE ol.qualification_score
      END,
      updated_at = now()
    FROM supplier_entities se
    WHERE ol.status IN ('qualified','approved')
      AND trim(lower(regexp_replace(
        regexp_replace(ol.company_name, '\\m(ltd|limited|plc|llp|uk|group|company|co|inc|corporation|corp)\\M', '', 'gi'),
        '[^a-z0-9]+', ' ', 'gi'
      ))) = se.normalised_name
  `);
  stats.matched = mainUpdate.rowCount ?? 0;

  // Set contact_email from website domain where missing
  const emailUpdate = await pool.query(`
    UPDATE outbound_leads SET
      contact_email = 'info@' || lower(regexp_replace(regexp_replace(website, '^https?://', ''), '/.*$', '')),
      updated_at = now()
    WHERE status IN ('qualified','approved')
      AND website IS NOT NULL
      AND contact_email IS NULL
      AND website !~ 'companieshouse|gov\\.uk'
      AND regexp_replace(regexp_replace(website, '^https?://', ''), '/.*$', '') <> ''
  `);
  stats.emailSet = emailUpdate.rowCount ?? 0;

  // Count results
  const enriched = await pool.query<{ websites: string; addresses: string; scores: string }>(`
    SELECT
      count(*) FILTER (WHERE website IS NOT NULL) as websites,
      count(*) FILTER (WHERE address IS NOT NULL) as addresses,
      count(*) FILTER (WHERE qualification_score >= 70) as scores
    FROM outbound_leads
    WHERE status IN ('qualified','approved')
  `);
  stats.websiteFound = parseInt(enriched.rows[0].websites, 10);
  stats.addressSet = parseInt(enriched.rows[0].addresses, 10);
  stats.scoreUpdated = parseInt(enriched.rows[0].scores, 10);

  // Debug: show sample normalised names from both sides
  const supplierCount = await pool.query<{ cnt: string }>(`SELECT count(*) as cnt FROM supplier_entities`);
  const sampleLeadNorms = await pool.query<{ norm: string }>(`
    SELECT trim(lower(regexp_replace(
      regexp_replace(company_name, '\\m(ltd|limited|plc|llp|uk|group|company|co|inc|corporation|corp)\\M', '', 'gi'),
      '[^a-z0-9]+', ' ', 'gi'
    ))) as norm FROM outbound_leads LIMIT 10
  `);
  const sampleSupplierNorms = await pool.query<{ normalised_name: string }>(`
    SELECT normalised_name FROM supplier_entities ORDER BY total_wins DESC LIMIT 10
  `);

  const debug = {
    supplierCount: parseInt(supplierCount.rows[0].cnt, 10),
    sampleLeadNorms: sampleLeadNorms.rows.map(r => r.norm),
    sampleSupplierNorms: sampleSupplierNorms.rows.map(r => r.normalised_name),
  };

  console.log(`[outbound] enrichment complete:`, stats, debug);
  return { ...stats, debug };
}

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
