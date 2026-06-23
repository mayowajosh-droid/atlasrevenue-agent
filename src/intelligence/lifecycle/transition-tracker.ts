import type { ProcurementNotice } from "../../types.js";
import type { OpportunityLifecycle, LifecycleStage, LifecycleTransition } from "./types.js";
import { detectStage, normaliseSubject } from "./stage-detector.js";
import { scoreMaturity } from "./maturity-scorer.js";
import { upsertLifecycleEntry, updateLifecycleStage, insertTransition, getLifecycleBySubjectAndBuyer } from "./db.js";

const STAGE_ORDER: LifecycleStage[] = [
  "planning", "pre_procurement", "open_tender", "evaluation", "awarded", "delivery", "completed"
];

function stageIndex(stage: LifecycleStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export async function trackNotice(
  notice: ProcurementNotice,
  deskCategory?: string
): Promise<{ lifecycle: OpportunityLifecycle; transition: LifecycleTransition | null }> {
  const { stage } = detectStage(notice);
  const maturity = scoreMaturity(notice, stage);
  const normSubject = normaliseSubject(notice.title);

  const existing = await getLifecycleBySubjectAndBuyer(normSubject, notice.buyer);

  if (existing && existing.stage !== stage && stageIndex(stage) > stageIndex(existing.stage as LifecycleStage)) {
    // Stage has progressed — record transition and update
    const transition = await insertTransition({
      opportunity_lifecycle_id: existing.id,
      from_stage: existing.stage as LifecycleStage,
      to_stage: stage,
      notice_id: notice.id,
    });
    const updated = await updateLifecycleStage(existing.id, stage, maturity, notice.id);
    return { lifecycle: updated, transition };
  }

  if (existing) {
    // Same stage or earlier — no transition, return existing
    return { lifecycle: existing, transition: null };
  }

  // New lifecycle entry
  const lifecycle = await upsertLifecycleEntry({
    notice_id: notice.id,
    buyer: notice.buyer,
    title: notice.title,
    normalised_subject: normSubject,
    stage,
    maturity_score: maturity,
    source: notice.source,
    source_url: notice.url,
    value_low: notice.valueLow,
    value_high: notice.valueHigh,
    desk_category: deskCategory ?? null,
  });
  return { lifecycle, transition: null };
}

export async function bulkTrackNotices(
  notices: ProcurementNotice[],
  deskCategory?: string
): Promise<{ newEntries: number; transitions: number }> {
  let newEntries = 0;
  let transitions = 0;

  for (const notice of notices) {
    const result = await trackNotice(notice, deskCategory);
    if (result.transition) transitions++;
    // Count as new if this is the first time we see the subject+buyer
    // (upsert returns a row either way, so we check if transition is null and lifecycle was just created)
    if (!result.transition) {
      const normSubject = normaliseSubject(notice.title);
      const existing = await getLifecycleBySubjectAndBuyer(normSubject, notice.buyer);
      if (existing && existing.notice_id === notice.id) newEntries++;
    }
  }

  return { newEntries, transitions };
}
