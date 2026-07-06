export type LeadStatus =
  | "qualified"
  | "approved"
  | "composing"
  | "ready"
  | "sent"
  | "replied"
  | "opted_out"
  | "bounced"
  | "suppressed";

export type EmailStatus = "draft" | "approved" | "sent" | "bounced" | "replied";

export type ReplyClassification =
  | "interested"
  | "send_info"
  | "not_now"
  | "wrong_person"
  | "unsubscribe"
  | "angry"
  | "ooo"
  | "bounce";

export type SuppressionReason =
  | "opted_out"
  | "bounced"
  | "sole_trader"
  | "personal_email"
  | "already_contacted"
  | "manual"
  | "angry_reply";

export type CampaignStatus = "active" | "paused" | "completed";

export type OutboundCampaign = {
  id: string;
  name: string;
  desk_slug: string | null;
  status: CampaignStatus;
  total_leads: number;
  total_sent: number;
  total_replies: number;
  total_positive: number;
  created_at: string;
  updated_at: string;
};

export type OutboundLead = {
  id: string;
  campaign_id: string | null;
  company_name: string;
  company_number: string | null;
  sic_codes: string[];
  address: string | null;
  region: string | null;
  company_type: string | null;
  website: string | null;
  contact_email: string | null;
  contact_name: string | null;
  contact_role: string | null;
  trigger_title: string;
  trigger_buyer: string;
  trigger_incumbent: string | null;
  trigger_value: number | null;
  trigger_contract_end: string | null;
  trigger_url: string;
  trigger_days_left: number | null;
  similar_count: number;
  desk_slug: string | null;
  qualification_score: number;
  qualification_reasons: string[];
  status: LeadStatus;
  created_at: string;
  updated_at: string;
};

export type OutboundEmail = {
  id: string;
  lead_id: string;
  subject: string;
  body_text: string;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  sent_at: string | null;
  status: EmailStatus;
  created_at: string;
};

export type OutboundReply = {
  id: string;
  email_id: string;
  lead_id: string;
  gmail_message_id: string | null;
  classification: ReplyClassification;
  confidence: number;
  raw_snippet: string;
  classified_at: string;
  handled: boolean;
};

export type OutboundSuppression = {
  id: string;
  email: string | null;
  domain: string | null;
  reason: SuppressionReason;
  created_at: string;
};

export type DailyReportMetrics = {
  leads_generated: number;
  leads_qualified: number;
  emails_sent: number;
  bounces: number;
  replies_total: number;
  replies_positive: number;
  meetings_booked: number;
  best_desk: string | null;
  best_hook: string | null;
};

export type DailyReportResponder = {
  company: string;
  reply_snippet: string;
  classification: ReplyClassification;
  next_step: string;
};

export type OutboundDailyReport = {
  id: string;
  report_date: string;
  metrics: DailyReportMetrics;
  responders: DailyReportResponder[];
  created_at: string;
};

export type MicroScanResult = {
  companySnapshot: {
    name: string;
    number: string | null;
    sic: string[];
    address: string | null;
    website: string | null;
    status: string | null;
  };
  matchingContract: {
    title: string;
    buyer: string;
    value: number | null;
    incumbent: string | null;
    endDate: string | null;
    daysLeft: number | null;
    url: string;
  };
  similarOpportunities: Array<{
    title: string;
    buyer: string;
    value: number | null;
    url: string;
  }>;
  buyerHistory: {
    totalContracts: number;
    avgValue: number;
    lastAward: string | null;
  };
  recommendedHook: string;
  evidenceSources: string[];
};

export type QualificationResult = {
  score: number;
  reasons: string[];
  qualified: boolean;
};

export type SuppressionCheck = {
  suppressed: boolean;
  reason: SuppressionReason | null;
};

export type OutboundConfig = {
  key: string;
  value: string;
  updated_at: string;
};
