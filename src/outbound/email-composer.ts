import crypto from "crypto";
import { anthropic } from "../config.js";
import { insertEmail, updateLeadStatus } from "./db.js";
import { runMicroScan } from "./micro-scan.js";
import type { OutboundLead, OutboundEmail, MicroScanResult } from "./types.js";

const SYSTEM_PROMPT = `You write cold outreach emails for AtlasRevenue, a UK procurement intelligence platform. You are writing as Mayor, the founder.

You will receive structured data about a specific company and a specific expiring public-sector contract that matches their services. Write a complete cold email — subject line and body.

THE CORE ANGLE:
The email sells a specific finding, not the platform. The recipient should think: "How did this person know this was relevant to us?" You are a knowledgeable person who found a specific contract opportunity near them, not a software salesperson.

PAIN LINE (use naturally, not word-for-word every time):
"Most suppliers only see these when the tender goes live."

SUBJECT LINE PATTERNS (vary these, don't repeat the same one):
- "[Buyer Name] contract coming back around"
- "Contract coming back around near [Location]"
- "[Buyer Name] contract ending soon"
- "[Service type] work near [Location]"

EMAIL STRUCTURE:
1. Open by saying you found something specific and relevant to them.
2. Name the buyer, service type, contract end date, and incumbent (if known).
3. Mention similar contracts nearby (if > 0).
4. One line on what AtlasRevenue does: tracks renewal windows early, turns them into a short action pack showing who the buyer is, who holds the work now, when it comes back around, and what to do before competitors start chasing it.
5. Offer to send a small preview of what you found for their company.
6. Close: "Worth a look?" or similar low-pressure question.
7. Sign off: Mayor, AtlasRevenue
8. Final line: "If this isn't relevant, just say so and I won't contact you again."

TONE:
- Write like a knowledgeable person passing on a lead, not a mass email.
- Short sentences. No fluff. Under 150 words.
- The contract is the reason you're writing — lead with it.
- Real personalisation based on the data. Never fake familiarity ("I loved your website").

NEVER:
- Open with "I hope this finds you well" or any generic opener.
- Use buzzwords: leverage, synergy, solution, cutting-edge, innovative, game-changing, revolutionary.
- Mention pricing, subscription tiers, or platform features.
- Make unverifiable claims about the company or contract.
- Use exclamation marks.
- Include links or attachments.
- Say "I came across your company" — you found a contract, not them.

FORMAT:
Return ONLY in this exact format (no markdown, no extra text):

SUBJECT: [subject line here]

[email body here]`;

function buildUserMessage(scan: MicroScanResult, lead: OutboundLead): string {
  const value = scan.matchingContract.value
    ? `£${(scan.matchingContract.value / 100).toLocaleString()}`
    : "undisclosed value";

  const timing = scan.matchingContract.daysLeft !== null
    ? scan.matchingContract.daysLeft <= 0
      ? "has already expired"
      : `expires in approximately ${scan.matchingContract.daysLeft} days`
    : "expiry date unknown";

  return JSON.stringify({
    company: {
      name: scan.companySnapshot.name,
      address: scan.companySnapshot.address,
      sector: scan.companySnapshot.sic.join(", "),
    },
    contract: {
      title: scan.matchingContract.title,
      buyer: scan.matchingContract.buyer,
      value,
      incumbent: scan.matchingContract.incumbent || "not disclosed",
      timing,
    },
    similar_contracts_nearby: scan.similarOpportunities.length,
    recommended_hook: scan.recommendedHook,
    contact_name: lead.contact_name || null,
  });
}

function parseEmailResponse(response: string): { subject: string; body: string } | null {
  const subjectMatch = response.match(/^SUBJECT:\s*(.+)/m);
  if (!subjectMatch) return null;

  const subject = subjectMatch[1].trim();
  const bodyStart = response.indexOf("\n", response.indexOf("SUBJECT:"));
  const body = response.slice(bodyStart).trim();

  if (!subject || !body) return null;
  return { subject, body };
}

export async function composeEmail(lead: OutboundLead): Promise<OutboundEmail | null> {
  const scan = await runMicroScan(lead);

  if (!anthropic) {
    console.error("[outbound] no Anthropic client for email composition");
    return null;
  }

  try {
    await updateLeadStatus(lead.id, "composing");

    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        { role: "user", content: buildUserMessage(scan, lead) },
      ],
      system: SYSTEM_PROMPT,
    });

    const text = res.content[0];
    if (text.type !== "text") return null;

    const parsed = parseEmailResponse(text.text);
    if (!parsed) {
      console.error("[outbound] failed to parse LLM email response");
      return null;
    }

    const email: OutboundEmail = {
      id: crypto.randomUUID(),
      lead_id: lead.id,
      subject: parsed.subject,
      body_text: parsed.body,
      gmail_message_id: null,
      gmail_thread_id: null,
      sent_at: null,
      status: "draft",
      created_at: new Date().toISOString(),
    };

    await insertEmail({
      id: email.id,
      lead_id: email.lead_id,
      subject: email.subject,
      body_text: email.body_text,
      status: email.status,
    });

    await updateLeadStatus(lead.id, "ready");
    return email;
  } catch (err) {
    console.error("[outbound] email composition failed:", err);
    await updateLeadStatus(lead.id, "qualified");
    return null;
  }
}

export async function composeEmailsForApprovedLeads(limit = 10): Promise<number> {
  const { pool: dbPool } = await import("../config.js");
  if (!dbPool) return 0;

  const r = await dbPool.query(
    `SELECT * FROM outbound_leads WHERE status = 'approved'
     AND id NOT IN (SELECT lead_id FROM outbound_emails)
     ORDER BY qualification_score DESC LIMIT $1`,
    [limit],
  );

  let composed = 0;
  for (const lead of r.rows as OutboundLead[]) {
    const email = await composeEmail(lead);
    if (email) composed++;
    // Brief pause between LLM calls
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return composed;
}
