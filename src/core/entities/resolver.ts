import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { CanonicalOrganisation, EntityResolutionResult, CanonicalIngestRecord } from './types.js';

// Fuzzy matching helpers (simplified; use pg_trgm for production)
async function findExistingEntity(pool: Pool, name: string, chNumber?: string): Promise<CanonicalOrganisation | null> {
  // 1. Exact CH match
  if (chNumber) {
    const res = await pool.query(
      `SELECT * FROM canonical_organisations WHERE external_ids->>'companies_house' = $1`,
      [chNumber]
    );
    if (res.rows.length) return res.rows[0];
  }

  // 2. Fuzzy name match (using trigram in production)
  const cleanName = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const res = await pool.query(
    `SELECT * FROM canonical_organisations WHERE primary_name ILIKE $1 LIMIT 1`,
    [`%${cleanName}%`]
  );
  return res.rows[0] || null;
}

export async function resolveEntity(
  pool: Pool,
  raw: {
    name: string;
    ch_number?: string;
    domain?: string;
    sector?: string;
    address?: string;
    postcode?: string;
  }
): Promise<EntityResolutionResult> {
  const existing = await findExistingEntity(pool, raw.name, raw.ch_number);

  if (existing) {
    // Merge/Update logic
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Merge aliases
    const aliases = existing.aliases || [];
    if (!aliases.some((a: any) => a.name.toLowerCase() === raw.name.toLowerCase())) {
      aliases.push({ name: raw.name, source: 'procurement' as const, confidence: 0.9 });
      updates.push(`aliases = $${paramIndex++}`);
      params.push(JSON.stringify(aliases));
    }

    // Merge domains
    if (raw.domain) {
      const domains = existing.domains || [];
      if (!domains.some((d: any) => d.domain === raw.domain)) {
        domains.push({ domain: raw.domain, verified: false, source: 'procurement' as const });
        updates.push(`domains = $${paramIndex++}`);
        params.push(JSON.stringify(domains));
      }
    }

    // Update sector if missing
    if (raw.sector && !existing.sector) {
      updates.push(`sector = $${paramIndex++}`);
      params.push(raw.sector);
    }

    updates.push(`last_seen_at = NOW()`);

    if (updates.length > 0) {
      params.push(existing.id);
      await pool.query(
        `UPDATE canonical_organisations SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        params
      );
      // Fetch updated
      const updated = await pool.query(`SELECT * FROM canonical_organisations WHERE id = $1`, [existing.id]);
      return {
        entity: updated.rows[0],
        status: 'updated',
        confidence: 0.95,
        conflicts: [],
      };
    }

    return {
      entity: existing,
      status: 'enriched',
      confidence: 1.0,
      conflicts: [],
    };
  }

  // Create new entity
  const id = uuidv4();
  const aliases = [{ name: raw.name, source: 'procurement' as const, confidence: 1.0 }];
  const domains = raw.domain ? [{ domain: raw.domain, verified: false, source: 'procurement' as const }] : [];

  await pool.query(
    `INSERT INTO canonical_organisations (id, primary_name, aliases, domains, external_ids, sector)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      raw.name,
      JSON.stringify(aliases),
      JSON.stringify(domains),
      JSON.stringify({ companies_house: raw.ch_number || null }),
      raw.sector || null,
    ]
  );

  const created = await pool.query(`SELECT * FROM canonical_organisations WHERE id = $1`, [id]);
  return {
    entity: created.rows[0],
    status: 'created',
    confidence: 1.0,
    conflicts: [],
  };
}

// Ingest raw data (solves the "write-only" problem)
export async function ingestRaw(
  pool: Pool,
  payload: any,
  source: CanonicalIngestRecord['source']
): Promise<{ ingest_id: string; entity_id?: string }> {
  const id = uuidv4();
  const res = await pool.query(
    `INSERT INTO canonical_ingest (id, raw_payload, source, status) VALUES ($1, $2, $3, 'pending') RETURNING id`,
    [id, JSON.stringify(payload), source]
  );
  return { ingest_id: res.rows[0].id };
}

export async function linkIngestToEntity(pool: Pool, ingestId: string, entityId: string): Promise<void> {
  await pool.query(
    `UPDATE canonical_ingest SET entity_id = $1, status = 'resolved' WHERE id = $2`,
    [entityId, ingestId]
  );
}
