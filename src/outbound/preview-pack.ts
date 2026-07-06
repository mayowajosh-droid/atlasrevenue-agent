import { anthropic } from "../config.js";
import { getLeadById } from "./db.js";
import { sendOutboundEmail } from "./gmail.js";
import { runMicroScan } from "./micro-scan.js";

export async function sendPreviewPack(leadId: string, replyThreadId: string, replyMessageId: string): Promise<boolean> {
  const lead = await getLeadById(leadId);
  if (!lead || !lead.contact_email) return false;

  const scan = await runMicroScan(lead);

  const value = scan.matchingContract.value
    ? `£${(scan.matchingContract.value / 100).toLocaleString()}`
    : "Not disclosed";

  const timing = scan.matchingContract.daysLeft !== null
    ? scan.matchingContract.daysLeft <= 0
      ? "Already expired — likely in re-procurement"
      : `Approximately ${scan.matchingContract.daysLeft} days until expiry`
    : "Expiry date not confirmed";

  const similarLines = scan.similarOpportunities.map((s, i) => {
    const sv = s.value ? `£${(s.value / 100).toLocaleString()}` : "Value not disclosed";
    return `${i + 1}. ${s.title}\n   Buyer: ${s.buyer}\n   Value: ${sv}`;
  }).join("\n\n");

  let briefText = [
    `AtlasRevenue Preview — ${lead.company_name}`,
    ``,
    `─────────────────────────────────`,
    ``,
    `CONTRACT WORTH WATCHING`,
    ``,
    `Title: ${scan.matchingContract.title}`,
    `Buyer: ${scan.matchingContract.buyer}`,
    `Value: ${value}`,
    `Current supplier: ${scan.matchingContract.incumbent || "Not disclosed"}`,
    `Timing: ${timing}`,
    `Source: ${scan.matchingContract.url}`,
    ``,
    `─────────────────────────────────`,
  ].join("\n");

  if (scan.similarOpportunities.length > 0) {
    briefText += [
      ``,
      ``,
      `SIMILAR OPPORTUNITIES NEARBY`,
      ``,
      similarLines,
      ``,
      `─────────────────────────────────`,
    ].join("\n");
  }

  if (scan.buyerHistory.totalContracts > 0) {
    briefText += [
      ``,
      ``,
      `BUYER PROFILE`,
      ``,
      `Total contracts awarded: ${scan.buyerHistory.totalContracts}`,
      `Average contract value: £${Math.round(scan.buyerHistory.avgValue / 100).toLocaleString()}`,
      scan.buyerHistory.lastAward ? `Last award: ${scan.buyerHistory.lastAward}` : null,
      ``,
      `─────────────────────────────────`,
    ].filter(Boolean).join("\n");
  }

  briefText += [
    ``,
    ``,
    `RECOMMENDED FIRST MOVE`,
    ``,
    scan.recommendedHook,
    ``,
    `─────────────────────────────────`,
    ``,
    `This is a preview from AtlasRevenue. The full Renewal Radar Pack includes`,
    `deeper buyer analysis, incumbent mapping, capability statement direction,`,
    `and a 30-day action plan.`,
    ``,
    `Want to discuss? Reply to this email and I'll set up a quick call.`,
    ``,
    `Mayor`,
    `AtlasRevenue`,
  ].join("\n");

  const result = await sendOutboundEmail({
    to: lead.contact_email,
    subject: `Re: Preview — ${scan.matchingContract.buyer} contract`,
    bodyText: briefText,
    replyToMessageId: replyMessageId,
    replyToThreadId: replyThreadId,
  });

  return result !== null;
}
