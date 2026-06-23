import type { ProcurementNotice } from "../../types.js";
import type { LifecycleStage } from "./types.js";

const NOISE_WORDS = /\b(the|a|an|of|for|and|in|to|on|by|with|from|is|are|at|its|this|that|or|as|be|was|were|been|being|have|has|had|do|does|did|will|would|shall|should|may|might|can|could)\b/gi;
const EXTRA_WHITESPACE = /\s+/g;
const NON_ALPHA = /[^a-z0-9 ]/g;

export function normaliseSubject(title: string): string {
  return title
    .toLowerCase()
    .replace(NON_ALPHA, " ")
    .replace(NOISE_WORDS, " ")
    .replace(EXTRA_WHITESPACE, " ")
    .trim();
}

export function detectStage(notice: ProcurementNotice): { stage: LifecycleStage; maturity: number } {
  const status = (notice.status ?? "").toLowerCase();
  const type = (notice.type ?? "").toLowerCase();

  // Completed: closed with awarded supplier
  if ((status.includes("completed") || (status.includes("closed") && notice.awardedSupplier)) && notice.awardedSupplier) {
    return { stage: "completed", maturity: 100 };
  }

  // Awarded: status says awarded or supplier is named
  if (status.includes("awarded") || notice.awardedSupplier) {
    return { stage: "awarded", maturity: notice.awardedValue ? 95 : 85 };
  }

  // Evaluation: closed but not awarded, or explicitly evaluation
  if (status.includes("evaluation") || (status.includes("closed") && !notice.awardedSupplier)) {
    return { stage: "evaluation", maturity: status.includes("evaluation") ? 75 : 70 };
  }

  // Open tender: open status or ITT/RFQ/RFP type
  if (status.includes("open") || type.includes("itt") || type.includes("rfq") || type.includes("rfp")) {
    const hasDeadline = !!notice.deadlineDate;
    return { stage: "open_tender", maturity: hasDeadline ? 55 : 45 };
  }

  // Pre-procurement: PQQ / pre-qualification / selection
  if (type.includes("pre-qualification") || type.includes("selection") || type.includes("pqq") ||
      status.includes("pre-qualification") || status.includes("selection") || status.includes("pqq")) {
    return { stage: "pre_procurement", maturity: type.includes("pqq") ? 35 : 25 };
  }

  // Planning: PIN or planning mentioned
  if (type.includes("pin") || type.includes("prior information") || type.includes("planning") ||
      status.includes("planning") || status.includes("pin")) {
    return { stage: "planning", maturity: type.includes("pin") ? 15 : 10 };
  }

  // Default: treat as open tender (most common for CF/FaT results)
  return { stage: "open_tender", maturity: 50 };
}
