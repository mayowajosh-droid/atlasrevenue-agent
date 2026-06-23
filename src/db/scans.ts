import { z } from "zod";
import type { ScanRecord } from "../types.js";
import { pool, memoryStore, scanEvents } from "../config.js";
import { intakeSchema } from "../data/intake.js";

function nowIso() { return new Date().toISOString(); }
function makeId() { return globalThis.crypto.randomUUID(); }

export async function createScan(input: z.infer<typeof intakeSchema>): Promise<ScanRecord> {
  const record: ScanRecord = {
    id: makeId(),
    created_at: nowIso(),
    updated_at: nowIso(),
    status: "pending",
    company_name: input.companyName,
    input_json: input,
    procurement_json: null,
    report_markdown: null,
    error_message: null,
    pdf_storage_key: null,
    pdf_storage_url: null,
    pdf_storage_etag: null,
    pdf_storage_updated_at: null
  };

  if (pool) {
    await pool.query(
      `INSERT INTO scans (id, created_at, updated_at, status, company_name, input_json, procurement_json, report_markdown, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        record.id,
        record.created_at,
        record.updated_at,
        record.status,
        record.company_name,
        record.input_json,
        record.procurement_json,
        record.report_markdown,
        record.error_message
      ]
    );
  } else {
    memoryStore.set(record.id, record);
  }

  return record;
}

export async function getScan(id: string): Promise<ScanRecord | null> {
  if (pool) {
    const result = await pool.query(`SELECT * FROM scans WHERE id=$1`, [id]);
    return result.rows[0] || null;
  }

  return memoryStore.get(id) || null;
}

export async function updateScan(id: string, patch: Partial<ScanRecord>) {
  const current = await getScan(id);
  if (!current) return;

  const next = { ...current, ...patch, updated_at: nowIso() };

  if (pool) {
    await pool.query(
      `UPDATE scans
       SET updated_at=$2, status=$3, procurement_json=$4, report_markdown=$5, error_message=$6
       WHERE id=$1`,
      [id, next.updated_at, next.status, next.procurement_json, next.report_markdown, next.error_message]
    );
  } else {
    memoryStore.set(id, next);
  }
}

export async function emitScanStage(id: string, stage: string): Promise<void> {
  if (pool) {
    await pool.query(`UPDATE scans SET progress_stage=$2, updated_at=$3 WHERE id=$1`, [id, stage, nowIso()])
      .catch(() => {});
  } else {
    const s = memoryStore.get(id);
    if (s) memoryStore.set(id, { ...s, progress_stage: stage, updated_at: nowIso() });
  }
  scanEvents.emit(`scan:${id}`, stage);
}

export async function getScansByCompany(companyName: string, excludeId: string): Promise<ScanRecord[]> {
  if (pool) {
    const r = await pool.query<ScanRecord>(
      `SELECT * FROM scans WHERE company_name=$1 AND id!=$2 AND status='completed' ORDER BY created_at DESC LIMIT 10`,
      [companyName, excludeId]
    );
    return r.rows;
  }
  return [...memoryStore.values()]
    .filter(s => s.company_name === companyName && s.id !== excludeId && s.status === "completed")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);
}

export async function updateScanPdfStorage(
  id: string,
  storage: Pick<ScanRecord, "pdf_storage_key" | "pdf_storage_url" | "pdf_storage_etag">
) {
  const updatedAt = nowIso();

  if (pool) {
    await pool.query(
      `UPDATE scans
       SET pdf_storage_key=$2, pdf_storage_url=$3, pdf_storage_etag=$4, pdf_storage_updated_at=$5
       WHERE id=$1`,
      [id, storage.pdf_storage_key, storage.pdf_storage_url, storage.pdf_storage_etag, updatedAt]
    );
    return;
  }

  const current = await getScan(id);
  if (!current) return;

  memoryStore.set(id, {
    ...current,
    ...storage,
    pdf_storage_updated_at: updatedAt
  });
}

export async function listScans(): Promise<ScanRecord[]> {
  if (pool) {
    const result = await pool.query(`SELECT * FROM scans ORDER BY created_at DESC LIMIT 100`);
    return result.rows;
  }

  return Array.from(memoryStore.values()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

export async function deleteScan(id: string) {
  if (pool) {
    await pool.query(`DELETE FROM scans WHERE id=$1`, [id]);
    return;
  }

  memoryStore.delete(id);
}

export async function updateScanCachedField(id: string, field: "capability_statement" | "outreach_emails" | "frameworks_assessment", value: string) {
  if (pool) {
    await pool.query(`UPDATE scans SET ${field}=$2 WHERE id=$1`, [id, value]);
  }
}
