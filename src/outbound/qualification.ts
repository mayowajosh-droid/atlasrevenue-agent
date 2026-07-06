import type { QualificationResult } from "./types.js";

// Maps desk slugs to the 2-digit SIC prefixes of companies that would BID on
// contracts in that desk. These are the SUPPLIER SIC codes, not buyer codes.
export const DESK_SUPPLIER_SIC_PREFIXES: Record<string, string[]> = {
  construction:      ["41", "42", "43"],
  facilities:        ["81", "43", "80"],
  energy:            ["35", "42", "43", "71"],
  waste:             ["38", "39"],
  security:          ["80"],
  catering:          ["56"],
  digital:           ["62", "63"],
  "social-care":     ["87", "88"],
  childrens:         ["87", "88", "85"],
  health:            ["86"],
  transport:         ["49", "77"],
  recruitment:       ["78"],
  legal:             ["69", "70"],
  finance:           ["64", "66", "69"],
  comms:             ["73", "74"],
  leisure:           ["93", "90"],
  planning:          ["71", "74"],
  research:          ["72", "73"],
  consulting:        ["70", "62"],
  education:         ["85"],
  "housing-support": ["87", "88", "68"],
  frameworks:        [],
  justice:           ["80", "84"],
  emergency:         ["80", "84"],
};

// Adjacent region groups — if the buyer is in one, suppliers in the same group count
const REGION_GROUPS: string[][] = [
  ["Greater London", "Surrey", "Kent", "Essex", "Hertfordshire", "Buckinghamshire", "Berkshire", "Sussex"],
  ["Greater Manchester", "Lancashire", "Cheshire", "Merseyside"],
  ["West Midlands", "Staffordshire", "Warwickshire", "Worcestershire", "Shropshire"],
  ["West Yorkshire", "South Yorkshire", "North Yorkshire", "East Riding of Yorkshire"],
  ["Tyne and Wear", "County Durham", "Northumberland"],
  ["Bristol", "Somerset", "Gloucestershire", "Wiltshire", "Devon"],
  ["Nottinghamshire", "Derbyshire", "Leicestershire", "Lincolnshire"],
  ["Norfolk", "Suffolk", "Cambridgeshire"],
];

function regionsAdjacent(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return true;
  for (const group of REGION_GROUPS) {
    const lowerGroup = group.map(g => g.toLowerCase());
    if (lowerGroup.includes(la) && lowerGroup.includes(lb)) return true;
  }
  return false;
}

function sicOverlap(supplierSicCodes: string[], deskSlug: string | null): number {
  if (!deskSlug) return 0;
  const prefixes = DESK_SUPPLIER_SIC_PREFIXES[deskSlug];
  if (!prefixes || prefixes.length === 0) return 0;
  const matched = supplierSicCodes.some(code =>
    prefixes.some(prefix => code.startsWith(prefix))
  );
  return matched ? 30 : 0;
}

export function qualifyLeadTriggerPair(opts: {
  supplierSicCodes: string[];
  supplierRegion: string | null;
  supplierStatus: string | null;
  supplierTotalWins: number;
  buyerRegion: string | null;
  contractValue: number | null;
  contractDaysLeft: number | null;
  deskSlug: string | null;
}): QualificationResult {
  const reasons: string[] = [];
  let score = 0;

  // SIC code overlap with desk sector (+30)
  const sicScore = sicOverlap(opts.supplierSicCodes, opts.deskSlug);
  if (sicScore > 0) {
    score += sicScore;
    reasons.push("SIC codes match desk sector");
  }

  // Region proximity (+15 same, +10 adjacent)
  if (opts.supplierRegion && opts.buyerRegion) {
    if (opts.supplierRegion.toLowerCase() === opts.buyerRegion.toLowerCase()) {
      score += 15;
      reasons.push("Same region as buyer");
    } else if (regionsAdjacent(opts.supplierRegion, opts.buyerRegion)) {
      score += 10;
      reasons.push("Adjacent region to buyer");
    }
  }

  // Company size appropriate for contract value (+15)
  // We don't have revenue, but total_wins is a proxy for size
  if (opts.contractValue !== null) {
    const isSmallContract = opts.contractValue < 5_000_000;
    const isSmallSupplier = opts.supplierTotalWins < 50;
    if ((isSmallContract && isSmallSupplier) || (!isSmallContract && !isSmallSupplier)) {
      score += 15;
      reasons.push("Company size appropriate for contract value");
    }
  } else {
    score += 10;
    reasons.push("No contract value filter applied");
  }

  // Active on Companies House (+10)
  if (opts.supplierStatus === "active") {
    score += 10;
    reasons.push("Active company status");
  }

  // Has won public contracts before (+20)
  if (opts.supplierTotalWins > 0) {
    score += 20;
    reasons.push(`Has ${opts.supplierTotalWins} previous public contract win${opts.supplierTotalWins > 1 ? "s" : ""}`);
  }

  // Contract timing urgency (+10 within 90 days, +5 within 180)
  if (opts.contractDaysLeft !== null) {
    if (opts.contractDaysLeft <= 90) {
      score += 10;
      reasons.push("Contract expires within 90 days");
    } else if (opts.contractDaysLeft <= 180) {
      score += 5;
      reasons.push("Contract expires within 180 days");
    }
  }

  return {
    score,
    reasons,
    qualified: score >= 40,
  };
}
