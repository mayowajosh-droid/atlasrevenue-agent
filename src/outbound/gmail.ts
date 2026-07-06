import { google, type gmail_v1 } from "googleapis";
import { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, OUTBOUND_DAILY_LIMIT, BASE_URL } from "../config.js";
import { getOutboundConfig, setOutboundConfig, getTodaySentCount } from "./db.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

let gmailClient: gmail_v1.Gmail | null = null;

function makeOAuth2() {
  return new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    `${BASE_URL}/admin/gmail-callback`,
  );
}

export function getGmailAuthUrl(): string {
  const oauth2 = makeOAuth2();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCodeForToken(code: string): Promise<void> {
  const oauth2 = makeOAuth2();
  const { tokens } = await oauth2.getToken(code);
  if (tokens.refresh_token) {
    await setOutboundConfig("gmail_refresh_token", tokens.refresh_token);
  }
  if (tokens.access_token) {
    await setOutboundConfig("gmail_access_token", tokens.access_token);
  }
  if (tokens.expiry_date) {
    await setOutboundConfig("gmail_token_expiry", String(tokens.expiry_date));
  }
  gmailClient = null;
}

export async function getGmailClient(): Promise<gmail_v1.Gmail | null> {
  if (gmailClient) return gmailClient;

  const refreshToken = await getOutboundConfig("gmail_refresh_token");
  if (!refreshToken || !GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) return null;

  const oauth2 = makeOAuth2();
  oauth2.setCredentials({ refresh_token: refreshToken });

  gmailClient = google.gmail({ version: "v1", auth: oauth2 });
  return gmailClient;
}

export async function isGmailConfigured(): Promise<boolean> {
  const token = await getOutboundConfig("gmail_refresh_token");
  return Boolean(token && GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET);
}

export async function sendOutboundEmail(opts: {
  to: string;
  subject: string;
  bodyText: string;
  replyToMessageId?: string;
  replyToThreadId?: string;
}): Promise<{ messageId: string; threadId: string } | null> {
  const gmail = await getGmailClient();
  if (!gmail) return null;

  const todaySent = await getTodaySentCount();
  if (todaySent >= OUTBOUND_DAILY_LIMIT) {
    console.log(`[outbound] daily limit reached (${todaySent}/${OUTBOUND_DAILY_LIMIT})`);
    return null;
  }

  const headers = [
    `To: ${opts.to}`,
    `From: Mayor <hello@atlasrevenue.io>`,
    `Subject: ${opts.subject}`,
    `Content-Type: text/plain; charset=utf-8`,
  ];

  if (opts.replyToMessageId) {
    headers.push(`In-Reply-To: ${opts.replyToMessageId}`);
    headers.push(`References: ${opts.replyToMessageId}`);
  }

  const raw = Buffer.from(
    headers.join("\r\n") + "\r\n\r\n" + opts.bodyText,
  ).toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: opts.replyToThreadId || undefined,
    },
  });

  return {
    messageId: res.data.id || "",
    threadId: res.data.threadId || "",
  };
}

export type GmailMessage = {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  subject: string;
  date: string;
  headers: Record<string, string>;
  bodyText: string;
};

export async function listInboundReplies(sinceMs: number): Promise<GmailMessage[]> {
  const gmail = await getGmailClient();
  if (!gmail) return [];

  const sinceSeconds = Math.floor(sinceMs / 1000);
  const res = await gmail.users.messages.list({
    userId: "me",
    q: `in:inbox from:(-me) to:hello@atlasrevenue.io after:${sinceSeconds}`,
    maxResults: 50,
  });

  if (!res.data.messages?.length) return [];

  const messages: GmailMessage[] = [];
  for (const msg of res.data.messages) {
    if (!msg.id) continue;
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers: Record<string, string> = {};
    for (const h of full.data.payload?.headers || []) {
      if (h.name && h.value) headers[h.name.toLowerCase()] = h.value;
    }

    let bodyText = "";
    const parts = full.data.payload?.parts || [];
    const textPart = parts.find(p => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      bodyText = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    } else if (full.data.payload?.body?.data) {
      bodyText = Buffer.from(full.data.payload.body.data, "base64url").toString("utf-8");
    }

    messages.push({
      id: msg.id,
      threadId: full.data.threadId || "",
      snippet: full.data.snippet || "",
      from: headers["from"] || "",
      subject: headers["subject"] || "",
      date: headers["date"] || "",
      headers,
      bodyText,
    });
  }

  return messages;
}

export async function markAsRead(messageId: string): Promise<void> {
  const gmail = await getGmailClient();
  if (!gmail) return;
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["UNREAD"] },
  });
}

export function isWithinSendWindow(): boolean {
  const ukTime = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
  const parts = ukTime.split(", ");
  const timeParts = parts[1]?.split(":") || [];
  const hour = parseInt(timeParts[0] || "0", 10);
  const minute = parseInt(timeParts[1] || "0", 10);
  const totalMinutes = hour * 60 + minute;

  // 09:15 to 15:45 UK time
  if (totalMinutes < 555 || totalMinutes > 945) return false;

  // Mon-Fri only
  const now = new Date();
  const ukDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(now);
  return !["Sat", "Sun"].includes(ukDay);
}

export function randomSendDelay(): number {
  return (3 + Math.random() * 4) * 60 * 1000;
}
