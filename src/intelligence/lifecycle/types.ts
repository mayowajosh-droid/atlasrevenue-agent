export type LifecycleStage = "planning" | "pre_procurement" | "open_tender" | "evaluation" | "awarded" | "delivery" | "completed";

export type OpportunityLifecycle = {
  id: string;
  notice_id: string;
  buyer: string;
  title: string;
  normalised_subject: string;
  stage: LifecycleStage;
  maturity_score: number;
  stage_entered_at: string;
  source: string;
  source_url: string;
  value_low: number | null;
  value_high: number | null;
  desk_category: string | null;
  updated_at: string;
};

export type LifecycleTransition = {
  id: string;
  opportunity_lifecycle_id: string;
  from_stage: LifecycleStage;
  to_stage: LifecycleStage;
  notice_id: string;
  detected_at: string;
};

export type LifecycleSummary = {
  stage: LifecycleStage;
  count: number;
  totalValue: number;
  avgMaturity: number;
};
