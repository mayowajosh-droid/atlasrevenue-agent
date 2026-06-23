export type ContactSource = "web_crawl" | "pattern_inference" | "companies_house" | "manual";

export type BuyerContact = {
  id: string;
  buyer_entity_id: string;
  name: string | null;
  email: string;
  role: string | null;
  department: string | null;
  source: ContactSource;
  confidence_score: number;
  verified: boolean;
  verified_at: string | null;
  domain: string;
  discovered_at: string;
  updated_at: string;
};

export type ContactVerification = {
  id: string;
  buyer_contact_id: string;
  method: "smtp" | "dns_mx" | "pattern_match";
  result: "valid" | "invalid" | "unknown";
  detail: string | null;
  checked_at: string;
};

export type DomainDiscoveryResult = {
  domain: string | null;
  source: "buyer_type_pattern" | "company_website" | "web_search" | "manual";
  confidence: number;
};

export type CrawledContact = {
  name: string | null;
  email: string;
  role: string | null;
  department: string | null;
  pageUrl: string;
};
