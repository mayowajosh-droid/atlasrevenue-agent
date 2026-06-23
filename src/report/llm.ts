import { openai, anthropic, captureError } from "../config.js";
import { OPENAI_MODEL, ANTHROPIC_MODEL } from "../config.js";

function enforceDataQualityLanguage(report: string) {
  return String(report || "")
    .replace(/\bConfirmed\b/g, "Source-labelled")
    .replace(/\bconfirmed\b/g, "source-labelled")
    .replace(/\bsource-backed\b/gi, "source-labelled")
    .replace(/\bSource-backed\b/g, "Source-labelled");
}

export function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fn(controller.signal).finally(() => clearTimeout(timer));
}

// OpenAI calls are capped at 90s (see CLAUDE.md) to keep the scan queue from stalling.
export function withOpenAiTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return withTimeout(90_000, fn);
}

export async function callOpenAiReport(prompt: string): Promise<string> {
  return withOpenAiTimeout(async signal => {
    try {
      const response = await openai.responses.create({
        model: OPENAI_MODEL,
        tools: [{ type: "web_search" } as any],
        input: prompt
      }, { signal });
      return enforceDataQualityLanguage(response.output_text || "No report returned.");
    } catch (firstError: any) {
      try {
        const response = await openai.responses.create({
          model: OPENAI_MODEL,
          tools: [{ type: "web_search_preview" } as any],
          input: prompt
        }, { signal });
        return enforceDataQualityLanguage(response.output_text || "No report returned.");
      } catch (secondError: any) {
        captureError(secondError, {
          openai: { model: OPENAI_MODEL, fallbackAfterPrimaryFailure: true, primaryError: firstError?.message || String(firstError) }
        });
        throw secondError;
      }
    }
  });
}

// Claude generates the report (the product) with server-side web search. Opus + search
// needs more headroom than the 90s OpenAI budget, so it gets its own 150s cap.
export async function callClaudeReport(prompt: string): Promise<string> {
  if (!anthropic) throw new Error("Anthropic client not configured.");
  const client = anthropic;
  return withTimeout(150_000, async signal => {
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      system: "You are AtlasRevenue's senior UK public-sector procurement analyst. Follow the user's instructions exactly. Return only the finished report as clean GitHub-flavored Markdown — no preamble, no sign-off, no commentary outside the report itself.",
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }] as any
    }, { signal });
    const text = message.content
      .map(block => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    return enforceDataQualityLanguage(text || "No report returned.");
  });
}

// Set when Anthropic returns a billing/credit error — skips Claude for the rest of the process lifetime
// so every scan goes straight to OpenAI without a 150s wait.
let anthropicBillingFailed = false;

export function isAnthropicBillingFailed() { return anthropicBillingFailed; }

function isAnthropicCreditError(err: any): boolean {
  const msg: string = (err?.message || String(err)).toLowerCase();
  const status: number = err?.status ?? err?.statusCode ?? 0;
  return (
    msg.includes("credit balance") ||
    msg.includes("billing") ||
    msg.includes("payment required") ||
    msg.includes("your credit") ||
    status === 402
  );
}

export async function callLlmReport(prompt: string): Promise<string> {
  if (anthropic && !anthropicBillingFailed) {
    try {
      return await callClaudeReport(prompt);
    } catch (claudeError: any) {
      if (isAnthropicCreditError(claudeError)) {
        anthropicBillingFailed = true;
        console.warn("[report] Anthropic credit exhausted — switching all future scans to OpenAI");
      } else {
        try {
          captureError(claudeError, {
            anthropic: { model: ANTHROPIC_MODEL, fellBackToOpenAI: true, error: claudeError?.message || String(claudeError) }
          });
        } catch { /* sentry must not block fallback */ }
        console.error("[report] Claude failed, falling back to OpenAI:", claudeError?.message || claudeError);
      }
    }
  }
  return callOpenAiReport(prompt);
}
