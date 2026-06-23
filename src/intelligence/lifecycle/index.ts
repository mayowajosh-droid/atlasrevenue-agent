export type { LifecycleStage, OpportunityLifecycle, LifecycleTransition, LifecycleSummary } from "./types.js";
export { initLifecycleTables, getLifecycleSummary, getRecentTransitions, getLifecycleByDesk } from "./db.js";
export { detectStage, normaliseSubject } from "./stage-detector.js";
export { scoreMaturity } from "./maturity-scorer.js";
export { trackNotice, bulkTrackNotices } from "./transition-tracker.js";
