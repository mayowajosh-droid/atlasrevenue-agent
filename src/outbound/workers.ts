import { Worker } from "bullmq";
import { redisConnection, outboundQueue, OUTBOUND_ENABLED, captureError } from "../config.js";
import { generateDailyLeads } from "./lead-generator.js";
import { composeEmailsForApprovedLeads } from "./email-composer.js";
import { processReplies } from "./reply-classifier.js";
import { generateAndSendDailyReport } from "./daily-report.js";
import { sendPreviewPack } from "./preview-pack.js";
import { getPendingEmails, updateEmailSent, updateEmailStatus, updateLeadStatus, getUnhandledReplies, markReplyHandled } from "./db.js";
import { sendOutboundEmail, isWithinSendWindow, randomSendDelay, isGmailConfigured } from "./gmail.js";

async function handleGenerate(): Promise<void> {
  console.log("[outbound] starting daily lead generation");
  const result = await generateDailyLeads();
  console.log("[outbound] lead gen done:", result);
}

async function handleCompose(): Promise<void> {
  const composed = await composeEmailsForApprovedLeads(10);
  if (composed > 0) console.log(`[outbound] composed ${composed} emails`);
}

async function handleSend(): Promise<void> {
  if (!OUTBOUND_ENABLED) return;
  if (!isWithinSendWindow()) return;

  const gmailReady = await isGmailConfigured();
  if (!gmailReady) {
    console.log("[outbound] Gmail not configured, skipping send");
    return;
  }

  const pending = await getPendingEmails(5);
  for (const email of pending) {
    const lead = await import("./db.js").then(db => db.getLeadById(email.lead_id));
    if (!lead?.contact_email) continue;

    const result = await sendOutboundEmail({
      to: lead.contact_email,
      subject: email.subject,
      bodyText: email.body_text,
    });

    if (result) {
      await updateEmailSent(email.id, result.messageId, result.threadId);
      await updateLeadStatus(lead.id, "sent");
      console.log(`[outbound] sent email to ${lead.company_name}`);
    } else {
      await updateEmailStatus(email.id, "bounced");
      await updateLeadStatus(lead.id, "bounced");
    }

    // Random delay between sends
    await new Promise(resolve => setTimeout(resolve, randomSendDelay()));
  }
}

async function handleReplies(): Promise<void> {
  const gmailReady = await isGmailConfigured();
  if (!gmailReady) return;

  const result = await processReplies();

  // Auto-send preview packs for "send_info" replies
  const unhandled = await getUnhandledReplies();
  for (const reply of unhandled) {
    if (reply.classification === "send_info" && reply.confidence >= 80) {
      const email = await import("./db.js").then(db => db.getEmailsForLead(reply.lead_id));
      const sentEmail = email.find(e => e.gmail_thread_id);
      if (sentEmail?.gmail_thread_id && sentEmail.gmail_message_id) {
        const sent = await sendPreviewPack(reply.lead_id, sentEmail.gmail_thread_id, sentEmail.gmail_message_id);
        if (sent) {
          await markReplyHandled(reply.id);
          console.log(`[outbound] auto-sent preview pack for lead ${reply.lead_id}`);
        }
      }
    }
  }
}

async function handleReport(): Promise<void> {
  console.log("[outbound] generating daily report");
  await generateAndSendDailyReport();
}

export function startOutboundWorkers(): void {
  if (!redisConnection || !outboundQueue) {
    console.log("[outbound] Redis not available, outbound workers disabled");
    return;
  }

  // Schedule recurring jobs
  outboundQueue.add("generate", {}, {
    repeat: { pattern: "0 6 * * 1-5", tz: "Europe/London" },
    jobId: "outbound-daily-generate",
    removeOnComplete: { count: 5 },
    removeOnFail: { age: 3 * 24 * 60 * 60 * 1000 },
  });

  outboundQueue.add("compose", {}, {
    repeat: { pattern: "30 7 * * 1-5", tz: "Europe/London" },
    jobId: "outbound-daily-compose",
    removeOnComplete: { count: 5 },
    removeOnFail: { age: 3 * 24 * 60 * 60 * 1000 },
  });

  outboundQueue.add("send", {}, {
    repeat: { every: 5 * 60 * 1000 },
    jobId: "outbound-send-loop",
    removeOnComplete: { count: 10 },
    removeOnFail: { age: 24 * 60 * 60 * 1000 },
  });

  outboundQueue.add("replies", {}, {
    repeat: { every: 15 * 60 * 1000 },
    jobId: "outbound-reply-poll",
    removeOnComplete: { count: 10 },
    removeOnFail: { age: 24 * 60 * 60 * 1000 },
  });

  outboundQueue.add("report", {}, {
    repeat: { pattern: "0 17 * * 1-5", tz: "Europe/London" },
    jobId: "outbound-daily-report",
    removeOnComplete: { count: 5 },
    removeOnFail: { age: 3 * 24 * 60 * 60 * 1000 },
  });

  const worker = new Worker(
    "atlasrevenue-outbound",
    async (job) => {
      switch (job.name) {
        case "generate": return handleGenerate();
        case "compose": return handleCompose();
        case "send": return handleSend();
        case "replies": return handleReplies();
        case "report": return handleReport();
        default: console.log(`[outbound] unknown job: ${job.name}`);
      }
    },
    {
      connection: redisConnection as any,
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => {
    if (job.name !== "send" && job.name !== "replies") {
      console.log(`[outbound] job ${job.name} completed`);
    }
  });

  worker.on("failed", (job, err) => {
    console.error(`[outbound] job ${job?.name} failed:`, err.message);
    captureError(err, { job: job?.name, outbound: true });
  });

  console.log("[outbound] workers started (generate 06:00, compose 07:30, send every 5m, replies every 15m, report 17:00)");
}
