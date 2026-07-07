import { openai, OPENAI_MODEL } from "../config.js";

export type DiscoveredContact = {
  website: string | null;
  email: string | null;
  contact_name: string | null;
  contact_role: string | null;
};

const EMPTY: DiscoveredContact = { website: null, email: null, contact_name: null, contact_role: null };

const GENERIC_LOCALS = /^(info|contact|hello|hi|admin|enquiries|enquiry|support|help|office|reception|sales|marketing|jobs|careers|hr|team|mail|noreply|no-reply|webmaster|postmaster)@/i;

function firstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export async function discoverRealSupplierContact(companyName: string): Promise<DiscoveredContact> {
  const prompt = `Using web search, find the OFFICIAL UK company website and, if available, a REAL named business-development / sales / commercial / procurement contact at "${companyName}".

Rules — read carefully, they matter:
1. Website must be the company's own domain, verified via a live web search result. Do NOT guess a domain from the company name.
2. Contact email must belong to a NAMED PERSON at that domain — never info@, contact@, hello@, sales@, enquiries@, admin@, or any other role-based address. Only return an email if you can also find the person's name.
3. If you cannot find a real verified website, return "website": null.
4. If you cannot find a real named contact with a real personal email, return "email": null, "contact_name": null, "contact_role": null.
5. NEVER fabricate. Nulls are the correct answer when nothing is verifiable.

Return ONLY this JSON object, no prose, no markdown fences:
{"website": "...", "email": "...", "contact_name": "...", "contact_role": "..."}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let response;
    try {
      response = await openai.responses.create({
        model: OPENAI_MODEL,
        tools: [{ type: "web_search" } as any],
        input: prompt,
      }, { signal: controller.signal });
    } catch {
      response = await openai.responses.create({
        model: OPENAI_MODEL,
        tools: [{ type: "web_search_preview" } as any],
        input: prompt,
      }, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    const text = response.output_text || "";
    const parsed = firstJsonObject(text);
    if (!parsed) return EMPTY;

    const raw = {
      website: typeof parsed.website === "string" ? parsed.website.trim() : null,
      email: typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : null,
      contact_name: typeof parsed.contact_name === "string" ? parsed.contact_name.trim() : null,
      contact_role: typeof parsed.contact_role === "string" ? parsed.contact_role.trim() : null,
    };

    // Reject generic role-based emails even if the model returns them.
    if (raw.email && GENERIC_LOCALS.test(raw.email)) {
      raw.email = null;
      raw.contact_name = null;
      raw.contact_role = null;
    }

    // Reject an email without a name — role-play or fabrication risk.
    if (raw.email && !raw.contact_name) {
      raw.email = null;
      raw.contact_role = null;
    }

    // Basic email sanity.
    if (raw.email && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw.email)) {
      raw.email = null;
      raw.contact_name = null;
      raw.contact_role = null;
    }

    // Website must be an http(s) URL.
    if (raw.website && !/^https?:\/\//i.test(raw.website)) {
      raw.website = `https://${raw.website}`;
    }
    if (raw.website && !/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(raw.website)) {
      raw.website = null;
    }

    return raw;
  } catch (err) {
    console.warn(`[outbound] supplier discovery failed for ${companyName}:`, String(err).slice(0, 120));
    return EMPTY;
  }
}
