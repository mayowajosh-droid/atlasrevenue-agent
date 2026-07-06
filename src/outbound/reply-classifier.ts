import crypto from "crypto";
import { anthropic } from "../config.js";
import { insertReply, updateLeadStatus, getSentEmailByThreadId, replyExistsForMessage, insertSuppression } from "./db.js";
import { listInboundReplies, markAsRead, type GmailMessage } from "./gmail.js";
import type { ReplyClassification, OutboundReply } from "./types.js";

function detectFromHeaders(msg: GmailMessage): ReplyClassification | null {
  const autoReply = msg.headers["auto-submitted"] || msg.headers["x-autoreply"] || "";
  if (autoReply && autoReply !== "no") return "ooo";

  if (msg.headers["x-autorespond"]) return "ooo";

  const from = msg.from.toLowerCase();
  if (from.includes("mailer-daemon") || from.includes("postmaster")) return "bounce";

  const subject = msg.subject.toLowerCase();
  if (subject.includes("out of office") || subject.includes("automatic reply") || subject.includes("auto-reply")) return "ooo";
  if (subject.includes("delivery") && (subject.includes("fail") || subject.includes("undeliver"))) return "bounce";

  return null;
}

const CLASSIFY_PROMPT = `You classify cold email replies for a UK procurement intelligence company. Given a reply to a cold outreach email, classify it into exactly one category.

Categories:
- interested: They want to know more, expressed genuine interest, asked questions about the opportunity
- send_info: They explicitly asked to receive the preview/pack/details (e.g. "send it", "yes please", "send the preview")
- not_now: Polite decline, not interested right now, not bidding, doesn't apply to them
- wrong_person: They said they're not the right contact, or forwarded/suggested someone else
- unsubscribe: They asked to be removed, said don't contact again, or said "unsubscribe"
- angry: Hostile or threatening response, reported as spam
- ooo: Out of office auto-reply (if not caught by headers)
- bounce: Delivery failure notification

Reply with ONLY the classification word and a confidence score 0-100, separated by a pipe.
Example: interested|85
Example: not_now|90
Example: unsubscribe|95

If uncertain, default to "not_now" with low confidence.`;

async function classifyWithLlm(snippet: string): Promise<{ classification: ReplyClassification; confidence: number }> {
  if (!anthropic) {
    return { classification: "not_now", confidence: 30 };
  }

  try {
    const res = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 20,
      messages: [{ role: "user", content: `Reply text:\n\n${snippet.slice(0, 500)}` }],
      system: CLASSIFY_PROMPT,
    });

    const text = res.content[0];
    if (text.type !== "text") return { classification: "not_now", confidence: 30 };

    const parts = text.text.trim().split("|");
    const classification = parts[0]?.trim() as ReplyClassification;
    const confidence = parseInt(parts[1]?.trim() || "50", 10);

    const valid: ReplyClassification[] = [
      "interested", "send_info", "not_now", "wrong_person",
      "unsubscribe", "angry", "ooo", "bounce",
    ];

    if (!valid.includes(classification)) {
      return { classification: "not_now", confidence: 30 };
    }

    return { classification, confidence: Math.min(100, Math.max(0, confidence)) };
  } catch (err) {
    console.error("[outbound] LLM classify failed:", err);
    return { classification: "not_now", confidence: 20 };
  }
}

export async function processReplies(): Promise<{
  processed: number;
  classifications: Record<ReplyClassification, number>;
}> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const messages = await listInboundReplies(since);

  const classifications: Record<ReplyClassification, number> = {
    interested: 0, send_info: 0, not_now: 0, wrong_person: 0,
    unsubscribe: 0, angry: 0, ooo: 0, bounce: 0,
  };

  let processed = 0;

  for (const msg of messages) {
    if (await replyExistsForMessage(msg.id)) continue;

    const sentEmail = await getSentEmailByThreadId(msg.threadId);
    if (!sentEmail) continue;

    let classification: ReplyClassification;
    let confidence: number;

    const headerClassification = detectFromHeaders(msg);
    if (headerClassification) {
      classification = headerClassification;
      confidence = 95;
    } else {
      const llmResult = await classifyWithLlm(msg.bodyText || msg.snippet);
      classification = llmResult.classification;
      confidence = llmResult.confidence;
    }

    const reply: Pick<OutboundReply, "id" | "email_id" | "lead_id" | "gmail_message_id" | "classification" | "confidence" | "raw_snippet"> = {
      id: crypto.randomUUID(),
      email_id: sentEmail.id,
      lead_id: sentEmail.lead_id,
      gmail_message_id: msg.id,
      classification,
      confidence,
      raw_snippet: (msg.bodyText || msg.snippet).slice(0, 500),
    };

    await insertReply(reply);

    if (classification === "unsubscribe" || classification === "angry") {
      const fromEmail = msg.from.match(/<([^>]+)>/)?.[1] || msg.from;
      await insertSuppression({
        id: crypto.randomUUID(),
        email: fromEmail,
        domain: null,
        reason: classification === "angry" ? "angry_reply" : "opted_out",
      });
      await updateLeadStatus(sentEmail.lead_id, "opted_out");
    } else if (classification === "bounce") {
      await updateLeadStatus(sentEmail.lead_id, "bounced");
    } else {
      await updateLeadStatus(sentEmail.lead_id, "replied");
    }

    await markAsRead(msg.id);

    classifications[classification]++;
    processed++;
  }

  console.log(`[outbound] processed ${processed} replies:`, classifications);
  return { processed, classifications };
}
