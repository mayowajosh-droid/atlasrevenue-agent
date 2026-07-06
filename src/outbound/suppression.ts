import { verifyDomainMx } from "../intelligence/email-discovery/index.js";
import { isEmailSuppressed, isDomainSuppressed, leadExistsForTrigger } from "./db.js";
import type { SuppressionCheck } from "./types.js";

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk",
  "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "live.co.uk",
  "aol.com", "icloud.com", "me.com", "msn.com", "btinternet.com",
  "sky.com", "virgin.net", "talk21.com", "talktalk.net",
  "mail.com", "protonmail.com", "proton.me", "zoho.com",
]);

const SOLE_TRADER_TYPES = new Set([
  "sole-trader", "individual", "registered-society",
]);

export async function checkSuppression(opts: {
  email: string | null;
  domain?: string | null;
  companyNumber?: string | null;
  companyType?: string | null;
  triggerUrl: string;
}): Promise<SuppressionCheck> {
  if (!opts.email) {
    return { suppressed: true, reason: "personal_email" };
  }

  const emailDomain = opts.email.split("@")[1]?.toLowerCase();
  if (!emailDomain) {
    return { suppressed: true, reason: "personal_email" };
  }

  if (PERSONAL_DOMAINS.has(emailDomain)) {
    return { suppressed: true, reason: "personal_email" };
  }

  if (opts.companyType && SOLE_TRADER_TYPES.has(opts.companyType.toLowerCase())) {
    return { suppressed: true, reason: "sole_trader" };
  }

  if (await isEmailSuppressed(opts.email)) {
    return { suppressed: true, reason: "opted_out" };
  }

  const domainToCheck = opts.domain || emailDomain;
  if (domainToCheck && await isDomainSuppressed(domainToCheck)) {
    return { suppressed: true, reason: "opted_out" };
  }

  if (opts.companyNumber) {
    const exists = await leadExistsForTrigger(opts.companyNumber, opts.triggerUrl);
    if (exists) {
      return { suppressed: true, reason: "already_contacted" };
    }
  }

  const mxValid = await verifyDomainMx(emailDomain);
  if (!mxValid) {
    return { suppressed: true, reason: "bounced" };
  }

  return { suppressed: false, reason: null };
}
