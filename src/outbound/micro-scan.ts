import { anthropic } from "../config.js";
import { getSupplierProfile } from "../intelligence/supplier-graph/index.js";
import { pool } from "../config.js";
import type { OutboundLead, MicroScanResult } from "./types.js";

async function findSimilarOpportunities(deskSlug: string, excludeUrl: string, limit = 3): Promise<
  Array<{ title: string; buyer: string; value: number | null; url: string }>
> {
  if (!pool || !deskSlug) return [];

  const r = await pool.query<{ data: string | object }>(
    `SELECT data FROM desk_cache WHERE slug = $1`,
    [deskSlug],
  );
  if (!r.rows[0]) return [];

  const data = typeof r.rows[0].data === "string"
    ? JSON.parse(r.rows[0].data)
    : r.rows[0].data;

  const awarded: Array<{ title: string; buyer: string; awardedValue: number | null; url: string }> =
    data?.contractsFinder?.awarded || [];

  return awarded
    .filter(n => n.url !== excludeUrl)
    .slice(0, limit)
    .map(n => ({
      title: n.title,
      buyer: n.buyer,
      value: n.awardedValue,
      url: n.url,
    }));
}

async function generateHook(lead: OutboundLead, similar: number): Promise<string> {
  if (!anthropic) {
    return `Contract matching your services found near ${lead.region || "your area"}`;
  }

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: `Write a one-sentence cold email hook for a UK supplier. The supplier is ${lead.company_name} (${lead.sic_codes.join(", ")}). The contract is "${lead.trigger_title}" with ${lead.trigger_buyer}, currently held by ${lead.trigger_incumbent || "unknown"}, worth ${lead.trigger_value ? `£${(lead.trigger_value / 100).toLocaleString()}` : "undisclosed"}, ending ${lead.trigger_contract_end || "soon"}. There are ${similar} similar contracts nearby. Write only the hook line, no quotes, no explanation.`,
      }],
    });
    const text = res.content[0];
    if (text.type === "text") return text.text.trim();
  } catch (err) {
    console.error("[outbound] hook generation failed:", err);
  }

  return `Contract matching your services found near ${lead.region || "your area"}`;
}

export async function runMicroScan(lead: OutboundLead): Promise<MicroScanResult> {
  const [similar, supplierProfile] = await Promise.all([
    findSimilarOpportunities(lead.desk_slug || "", lead.trigger_url, 3),
    lead.company_number
      ? getSupplierProfile(lead.company_number).catch(() => null)
      : Promise.resolve(null),
  ]);

  const hook = await generateHook(lead, similar.length);

  return {
    companySnapshot: {
      name: lead.company_name,
      number: lead.company_number,
      sic: lead.sic_codes,
      address: lead.address,
      website: lead.website,
      status: lead.company_type,
    },
    matchingContract: {
      title: lead.trigger_title,
      buyer: lead.trigger_buyer,
      value: lead.trigger_value,
      incumbent: lead.trigger_incumbent,
      endDate: lead.trigger_contract_end,
      daysLeft: lead.trigger_days_left,
      url: lead.trigger_url,
    },
    similarOpportunities: similar,
    buyerHistory: {
      totalContracts: supplierProfile?.stats.totalContracts ?? 0,
      avgValue: supplierProfile?.stats.avgContractValue ?? 0,
      lastAward: supplierProfile?.stats.lastActivity ?? null,
    },
    recommendedHook: hook,
    evidenceSources: [
      lead.trigger_url,
      ...similar.map(s => s.url),
    ],
  };
}
