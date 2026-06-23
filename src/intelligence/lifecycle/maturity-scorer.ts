import type { ProcurementNotice } from "../../types.js";
import type { LifecycleStage } from "./types.js";

const STAGE_RANGES: Record<LifecycleStage, [number, number]> = {
  planning: [10, 20],
  pre_procurement: [25, 40],
  open_tender: [45, 65],
  evaluation: [70, 80],
  awarded: [85, 95],
  delivery: [90, 98],
  completed: [100, 100],
};

export function scoreMaturity(notice: ProcurementNotice, stage: LifecycleStage): number {
  const [min, max] = STAGE_RANGES[stage];

  // Awarded supplier overrides everything
  if (notice.awardedSupplier) return Math.max(90, min);

  let score = min;

  // Has a deadline date and it's in the future
  if (notice.deadlineDate) {
    const deadline = new Date(notice.deadlineDate);
    if (deadline.getTime() > Date.now()) {
      score += 5;

      // Deadline within 30 days — bump to higher end of range
      const daysUntil = (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntil <= 30) {
        score = Math.max(score, max - 3);
      }
    }
  }

  // Has stated value
  if (notice.valueLow !== null || notice.valueHigh !== null) {
    score += 5;
  }

  // Has named buyer
  if (notice.buyer && notice.buyer.trim().length > 0) {
    score += 3;
  }

  // SME suitable
  if (notice.suitableForSme) {
    score += 2;
  }

  return Math.min(score, max);
}
