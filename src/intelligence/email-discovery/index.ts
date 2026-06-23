export type { BuyerContact, ContactVerification, DomainDiscoveryResult, CrawledContact, ContactSource } from "./types.js";
export { initEmailDiscoveryTables, upsertBuyerContact, getContactsForBuyer, insertVerification, getVerificationsForContact } from "./db.js";
export { discoverDomain, verifyDomainMx } from "./domain-discovery.js";
export { extractEmailsFromText, generatePatternEmails } from "./email-extractor.js";
export { scoreConfidence, rankContacts } from "./confidence-scorer.js";

import type { BuyerEntity } from "../buyer-graph/types.js";
import { discoverDomain, verifyDomainMx } from "./domain-discovery.js";
import { generatePatternEmails } from "./email-extractor.js";
import { scoreConfidence } from "./confidence-scorer.js";
import { upsertBuyerContact } from "./db.js";
import { getBuyerOfficers } from "../buyer-graph/db.js";

export async function discoverContactsForBuyer(entity: BuyerEntity): Promise<number> {
  const domainResult = discoverDomain(entity);
  if (!domainResult.domain) return 0;

  const mxValid = await verifyDomainMx(domainResult.domain);
  if (!mxValid) return 0;

  const officers = await getBuyerOfficers(entity.id);
  let discovered = 0;

  for (const officer of officers) {
    const nameParts = officer.name.split(/[,\s]+/).filter(p => p.length > 1);
    if (nameParts.length < 2) continue;

    const lastName = nameParts[0].replace(/,$/, "");
    const firstName = nameParts[nameParts.length - 1];

    const emails = generatePatternEmails(domainResult.domain, firstName, lastName);
    const bestEmail = emails[0];

    const confidence = scoreConfidence(
      "companies_house",
      officer.role?.includes("director") ? "senior_leadership" : "operational",
      null,
      true,
      mxValid,
      [],
    );

    await upsertBuyerContact({
      buyer_entity_id: entity.id,
      name: officer.name,
      email: bestEmail,
      role: officer.role || null,
      department: null,
      source: "companies_house",
      confidence_score: confidence,
      verified: false,
      verified_at: null,
      domain: domainResult.domain,
    });
    discovered++;
  }

  return discovered;
}
