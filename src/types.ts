export type ScanStatus = "pending" | "pending_payment" | "running" | "completed" | "failed";
export type UserTier = "free" | "payg" | "pro" | "agency";
export type UserRecord = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  tier: UserTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  role: string;
  setup_token: string | null;
  setup_token_expires: string | null;
};
export type ScanRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  status: ScanStatus;
  company_name: string;
  input_json: any;
  procurement_json: any | null;
  report_markdown: string | null;
  error_message: string | null;
  pdf_storage_key?: string | null;
  pdf_storage_url?: string | null;
  pdf_storage_etag?: string | null;
  pdf_storage_updated_at?: string | null;
  progress_stage?: string | null;
  user_id?: string | null;
  capability_statement?: string | null;
  outreach_emails?: string | null;
  frameworks_assessment?: string | null;
};

export type SubscriptionRecord = {
  id: string;
  scan_id: string;
  company_name: string;
  email: string;
  input_json: any;
  alerted_notice_ids: string[];
  active: boolean;
  created_at: string;
  last_alerted_at: string | null;
};

export type ArticleStatus = "draft" | "scheduled" | "published";
export type CommentStatus = "pending" | "approved" | "spam" | "hidden";
export type ArticleRow = {
  id: string; slug: string; title: string; dek: string | null;
  eyebrow: string | null; hero_prompt: string | null; hero_image_url: string | null;
  body_md: string; desk: string | null; status: ArticleStatus; author_id: string;
  published_at: string | null; updated_at: string; views: number; reading_time: number;
  og_image: string | null; seo_title: string | null; seo_description: string | null;
  like_count: number; tags: string | null;
};
export type ArticleAssetRow = {
  id: string; article_id: string; kind: "still" | "gif";
  prompt: string | null; prompt_hash: string | null;
  image_url: string | null; caption: string | null;
  position_key: string; rendered_at: string | null;
};
export type CommentRow = {
  id: string; article_id: string; user_id: string; parent_id: string | null;
  body: string; status: CommentStatus; is_author_reply: boolean;
  like_count: number; created_at: string; guest_name?: string;
  author_email?: string; article_slug?: string; article_title?: string;
};

export type ProcurementNotice = {
  source: "Contracts Finder" | "Find a Tender";
  id: string;
  title: string;
  buyer: string;
  description: string;
  status: string;
  type: string;
  region: string;
  publishedDate: string | null;
  deadlineDate: string | null;
  awardedDate: string | null;
  valueLow: number | null;
  valueHigh: number | null;
  awardedValue: number | null;
  awardedSupplier: string;
  suitableForSme: boolean | null;
  url: string;
  keyword: string;
  sourceConfidence?: string;
  relevanceScore?: number;
  relevanceReason?: string;
};

export type CompanyHouseRecord = {
  companyName: string;
  companyNumber: string;
  companyStatus: string;
  companyType: string;
  dateOfCreation: string | null;
  address: string;
  sicCodes: string[];
  url: string;
};

export type ProcurementData = {
  generatedAt: string;
  quality?: any;
  keywords: string[];
  regions: string;
  companiesHouse?: {
    matches: CompanyHouseRecord[];
    errors: string[];
  };
  findTender?: {
    notices: ProcurementNotice[];
    errors: string[];
  };
  contractsFinder: {
    open: ProcurementNotice[];
    awarded: ProcurementNotice[];
    errors: string[];
  };
};

export type HomepageSignal = {
  id: string;
  category: string;
  title: string;
  buyer: string | null;
  source: string;
  source_url: string;
  notice_date: string | null;
  deadline_date: string | null;
  value_amount: number | null;
  status: string;
  fetched_at: string;
};

export type AsyncRouteHandler = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) => Promise<void>;

export type ChaseStats = {
  totalOpen: number;
  avgValueK: number | null;
  closingThisMonth: number;
  byDesk: { category: string; count: number }[];
};

export type ChartDataPoint = { month: string; total_m: number };

export type DeskCategory = {
  label: string;
  keywords: string[];
  subcategories: string[];
};

export type DeskProfile = {
  slug: string;
  label: string;
  standfirst: string;
  live: boolean;
  pinnedProfile: any;
  categories: DeskCategory[];
};

export type SectorResult = { key: string; label: string; terms: string[] };

export type IncumbentEntry = { name: string; count: number; totalValue: number; latestAward: string | null };

export type BriefingSubscriberRow = { id: string; email: string; category: string | null };
