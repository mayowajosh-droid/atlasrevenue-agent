import type { OnsDataPoint } from "./types.js";

const ONS_BASE = "https://api.ons.gov.uk";
const TIMEOUT_MS = 15_000;

function onsAbort(): AbortController {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), TIMEOUT_MS);
  return ac;
}

/**
 * Fetch last 12 months of construction output index (series K2N3).
 * Returns monthly data points sorted oldest-first.
 */
export async function fetchConstructionOutput(): Promise<OnsDataPoint[]> {
  try {
    const ac = onsAbort();
    const res = await fetch(
      `${ONS_BASE}/economy/constructionindustry/timeseries/K2N3/data`,
      { signal: ac.signal }
    );
    if (!res.ok) return [];

    const json = (await res.json()) as {
      months?: Array<{ date: string; value: string; label: string }>;
    };

    if (!json.months || !Array.isArray(json.months)) return [];

    const points: OnsDataPoint[] = json.months
      .slice(-12)
      .map((m) => ({
        date: m.date,
        value: parseFloat(m.value),
        label: m.label,
      }))
      .filter((p) => !isNaN(p.value));

    return points;
  } catch {
    return [];
  }
}

/**
 * Fetch latest business demography data (birth/death rates).
 * Uses the business demography timeseries endpoint.
 */
export async function fetchBusinessDemography(): Promise<OnsDataPoint[]> {
  try {
    const ac = onsAbort();
    // Business births timeseries — annual data
    const res = await fetch(
      `${ONS_BASE}/businessindustryandtrade/business/activitysizeandlocation/timeseries/JA2I/data`,
      { signal: ac.signal }
    );
    if (!res.ok) return [];

    const json = (await res.json()) as {
      years?: Array<{ date: string; value: string; label: string }>;
    };

    if (!json.years || !Array.isArray(json.years)) return [];

    const points: OnsDataPoint[] = json.years
      .slice(-5)
      .map((y) => ({
        date: y.date,
        value: parseFloat(y.value),
        label: y.label,
      }))
      .filter((p) => !isNaN(p.value));

    return points;
  } catch {
    return [];
  }
}
