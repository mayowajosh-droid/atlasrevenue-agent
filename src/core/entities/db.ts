import { Pool } from 'pg';

export async function initCanonicalTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS canonical_organisations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_ids JSONB NOT NULL DEFAULT '{}',
      primary_name TEXT NOT NULL,
      aliases JSONB NOT NULL DEFAULT '[]',
      domains JSONB NOT NULL DEFAULT '[]',
      sector TEXT,
      lifecycle_stage TEXT,
      last_seen_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS canonical_persons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id UUID NOT NULL REFERENCES canonical_organisations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT,
      is_decision_maker BOOLEAN DEFAULT FALSE,
      email_inferences JSONB NOT NULL DEFAULT '[]',
      ch_officer_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('[Canonical] Tables initialized');
}
