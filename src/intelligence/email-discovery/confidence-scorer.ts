import type { BuyerContact, ContactVerification, ContactSource } from "./types.js";

const SOURCE_WEIGHTS: Record<ContactSource, number> = {
  web_crawl: 30,
  pattern_inference: 20,
  companies_house: 40,
  manual: 50,
};

const ROLE_BONUS: Record<string, number> = {
  procurement: 15,
  senior_leadership: 10,
  management: 8,
  operational: 5,
  general: 2,
};

export function scoreConfidence(
  source: ContactSource,
  role: string | null,
  department: string | null,
  hasName: boolean,
  domainVerified: boolean,
  verifications: ContactVerification[],
): number {
  let score = SOURCE_WEIGHTS[source] || 10;

  if (role && ROLE_BONUS[role]) score += ROLE_BONUS[role];
  if (department === "procurement") score += 10;
  else if (department) score += 3;

  if (hasName) score += 10;
  if (domainVerified) score += 15;

  const validSmtp = verifications.find(v => v.method === "smtp" && v.result === "valid");
  const invalidSmtp = verifications.find(v => v.method === "smtp" && v.result === "invalid");

  if (validSmtp) score += 20;
  if (invalidSmtp) score = Math.min(score, 15);

  return Math.min(100, Math.max(0, score));
}

export function rankContacts(contacts: BuyerContact[]): BuyerContact[] {
  return [...contacts].sort((a, b) => {
    if (b.confidence_score !== a.confidence_score) return b.confidence_score - a.confidence_score;
    if (a.verified && !b.verified) return -1;
    if (!a.verified && b.verified) return 1;
    return 0;
  });
}
