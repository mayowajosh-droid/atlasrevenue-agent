export type BuyerEntity = {
  id: string;
  name: string;
  normalised_name: string;
  company_number: string | null;
  company_status: string | null;
  company_type: string | null;
  address: string | null;
  sic_codes: string[];
  website: string | null;
  buyer_type: "local_authority" | "nhs" | "central_gov" | "housing" | "education" | "police_fire" | "construction" | "digital" | "facilities" | "transport" | "recruitment" | "legal" | "finance" | "energy" | "security" | "catering" | "waste" | "health" | "social_care" | "consulting" | "company" | "unknown";
  total_awards: number;
  total_award_value: number;
  first_seen: string;
  last_seen: string;
  updated_at: string;
};

export type BuyerOfficer = {
  id: string;
  buyer_entity_id: string;
  name: string;
  role: string;
  appointed_on: string | null;
  resigned_on: string | null;
  nationality: string | null;
  occupation: string | null;
  source: "officer" | "psc";
  fetched_at: string;
};

export type BuyerProcurementHistory = {
  id: string;
  buyer_entity_id: string;
  notice_id: string;
  title: string;
  category: string | null;
  status: string;
  value_low: number | null;
  value_high: number | null;
  awarded_value: number | null;
  awarded_supplier: string | null;
  published_date: string | null;
  deadline_date: string | null;
  awarded_date: string | null;
  source: string;
  source_url: string;
};

export type BuyerProfile = {
  entity: BuyerEntity;
  officers: BuyerOfficer[];
  history: BuyerProcurementHistory[];
  stats: {
    totalContracts: number;
    totalValue: number;
    avgContractValue: number;
    topCategories: { category: string; count: number; value: number }[];
    topSuppliers: { name: string; count: number; value: number }[];
    procurementFrequency: "high" | "medium" | "low";
    lastActivity: string | null;
  };
};
