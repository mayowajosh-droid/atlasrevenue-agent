export type { EarlySignal, OnsDataPoint, LandRegistryTransaction } from "./types.js";
export {
  initEarlySignalsTables,
  upsertEarlySignal,
  getLatestEarlySignals,
  getEarlySignalsByDesk,
  upsertOnsCache,
  upsertLandRegistryCache,
} from "./db.js";
export { fetchConstructionOutput, fetchBusinessDemography } from "./ons-fetcher.js";
export { fetchRecentTransactions, fetchDistrictSummary } from "./land-registry-fetcher.js";
export { correlateSignals, generateNarrative } from "./signal-correlator.js";

import { fetchConstructionOutput, fetchBusinessDemography } from "./ons-fetcher.js";
import { correlateSignals } from "./signal-correlator.js";
import { upsertEarlySignal } from "./db.js";
import type { EarlySignal } from "./types.js";

/**
 * Full refresh: fetch ONS + Land Registry data, correlate, persist.
 * Land Registry is skipped here (requires district input) — call separately.
 */
export async function refreshEarlySignals(): Promise<EarlySignal[]> {
  const [constructionOutput, businessDemography] = await Promise.all([
    fetchConstructionOutput(),
    fetchBusinessDemography(),
  ]);

  const signals = correlateSignals({
    constructionOutput,
    businessDemography,
    landRegistryByDistrict: new Map(),
  });

  await Promise.all(signals.map((s) => upsertEarlySignal(s)));

  return signals;
}
