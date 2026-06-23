import type { CrawledContact } from "./types.js";

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const IGNORED_DOMAINS = new Set([
  "example.com", "example.org", "test.com", "sentry.io",
  "google.com", "facebook.com", "twitter.com", "linkedin.com",
  "w3.org", "schema.org", "jquery.com", "cloudflare.com",
]);

const ROLE_PATTERNS: [RegExp, string][] = [
  [/\b(procurement|purchasing|buying|commissioning)\b/i, "procurement"],
  [/\b(director|head of|chief|ceo|cfo|coo)\b/i, "senior_leadership"],
  [/\b(manager|lead|supervisor)\b/i, "management"],
  [/\b(officer|coordinator|advisor|analyst)\b/i, "operational"],
  [/\b(admin|reception|enquir|general|info|contact)\b/i, "general"],
];

const DEPT_PATTERNS: [RegExp, string][] = [
  [/\b(procurement|purchasing|commercial|supply chain)\b/i, "procurement"],
  [/\b(finance|accounts|treasury)\b/i, "finance"],
  [/\b(it|digital|technology|ict)\b/i, "technology"],
  [/\b(hr|human resources|people)\b/i, "hr"],
  [/\b(legal|compliance|governance)\b/i, "legal"],
  [/\b(estates|facilities|property)\b/i, "estates"],
];

function inferRole(context: string): string | null {
  for (const [pattern, role] of ROLE_PATTERNS) {
    if (pattern.test(context)) return role;
  }
  return null;
}

function inferDepartment(context: string): string | null {
  for (const [pattern, dept] of DEPT_PATTERNS) {
    if (pattern.test(context)) return dept;
  }
  return null;
}

export function extractEmailsFromText(text: string, pageUrl: string): CrawledContact[] {
  const matches = text.match(EMAIL_REGEX) || [];
  const seen = new Set<string>();
  const contacts: CrawledContact[] = [];

  for (const raw of matches) {
    const email = raw.toLowerCase();
    const domain = email.split("@")[1];
    if (IGNORED_DOMAINS.has(domain) || seen.has(email)) continue;
    seen.add(email);

    const surrounding = extractSurroundingContext(text, raw, 200);
    contacts.push({
      name: inferNameFromEmail(email),
      email,
      role: inferRole(surrounding),
      department: inferDepartment(surrounding),
      pageUrl,
    });
  }

  return contacts;
}

function extractSurroundingContext(text: string, target: string, radius: number): string {
  const idx = text.indexOf(target);
  if (idx < 0) return "";
  return text.slice(Math.max(0, idx - radius), idx + target.length + radius);
}

function inferNameFromEmail(email: string): string | null {
  const local = email.split("@")[0];
  if (["info", "contact", "enquiries", "admin", "reception", "procurement", "general", "hello", "support"].includes(local)) {
    return null;
  }

  const parts = local.split(/[._\-]/);
  if (parts.length >= 2 && parts.every(p => /^[a-z]+$/.test(p))) {
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  }
  return null;
}

export function generatePatternEmails(domain: string, firstName: string, lastName: string): string[] {
  const f = firstName.toLowerCase();
  const l = lastName.toLowerCase();
  return [
    `${f}.${l}@${domain}`,
    `${f[0]}.${l}@${domain}`,
    `${f}${l}@${domain}`,
    `${f[0]}${l}@${domain}`,
    `${f}_${l}@${domain}`,
    `${l}.${f}@${domain}`,
  ];
}
