import type { Pool } from 'pg';

// The single source of truth for any organisation in the system
export interface CanonicalOrganisation {
  id: string; // UUID
  external_ids: {
    companies_house?: string;
    duns?: string;
    ukprn?: string; // UK Provider Reference Number (education)
    nhs_ods?: string; // NHS Organisation Data Service
    gov_uk_slug?: string;
  };
  primary_name: string;
  aliases: Array<{ name: string; source: 'procurement' | 'ch' | 'planning' | 'user'; confidence: number }>;
  domains: Array<{ domain: string; verified: boolean; source: string }>;
  sector: string | null; // SIC code or desk category
  locations: CanonicalLocation[];
  lifecycle_stage: 'planning' | 'pre_procurement' | 'open_tender' | 'evaluation' | 'awarded' | 'delivery' | 'completed' | null;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CanonicalLocation {
  id: string;
  organisation_id: string;
  type: 'registered' | 'operational' | 'delivery';
  address_line: string;
  postcode: string;
  lat?: number;
  lng?: number;
  ons_code?: string; // ONS geography code
}

export interface CanonicalPerson {
  id: string;
  organisation_id: string;
  name: string;
  role: string;
  is_decision_maker: boolean;
  email_inferences: Array<{ email: string; confidence: number; source: string }>;
  ch_officer_id?: string;
}

export interface EntityResolutionResult {
  entity: CanonicalOrganisation;
  status: 'created' | 'merged' | 'updated' | 'enriched';
  confidence: number;
  conflicts: Array<{ field: string; existing: any; proposed: any; resolution: 'kept' | 'overwritten' | 'manual' }>;
}

export interface CanonicalIngestRecord {
  id: string;
  raw_payload: any;
  source: 'contracts_finder' | 'find_tender' | 'companies_house' | 'planning' | 'ons' | 'land_registry' | 'email_discovery';
  entity_id?: string;
  processed_at: Date;
  status: 'pending' | 'resolved' | 'failed';
}
