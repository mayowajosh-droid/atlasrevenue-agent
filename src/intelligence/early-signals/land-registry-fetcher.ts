import type { LandRegistryTransaction } from "./types.js";

const LR_BASE = "https://landregistry.data.gov.uk/data/ppi";
const TIMEOUT_MS = 15_000;

function lrAbort(): AbortController {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), TIMEOUT_MS);
  return ac;
}

/**
 * Fetch recent property transactions for a district.
 * Uses the Land Registry Price Paid JSON API.
 */
export async function fetchRecentTransactions(
  district: string,
  months = 6
): Promise<LandRegistryTransaction[]> {
  try {
    const ac = lrAbort();
    const encoded = encodeURIComponent(district.toUpperCase());
    const res = await fetch(
      `${LR_BASE}/transaction-record.json?_page=0&_pageSize=50&propertyAddress.district=${encoded}`,
      { signal: ac.signal }
    );
    if (!res.ok) return [];

    const json = (await res.json()) as {
      result?: {
        items?: Array<{
          transactionId?: string;
          pricePaid?: number;
          transactionDate?: string;
          propertyAddress?: {
            postcode?: string;
            propertyType?: string;
            district?: string;
            county?: string;
          };
        }>;
      };
    };

    const items = json.result?.items;
    if (!items || !Array.isArray(items)) return [];

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    return items
      .filter((item) => {
        if (!item.transactionDate) return false;
        return new Date(item.transactionDate) >= cutoff;
      })
      .map((item) => ({
        id: item.transactionId || crypto.randomUUID(),
        price: item.pricePaid || 0,
        date: item.transactionDate || "",
        postcode: item.propertyAddress?.postcode || "",
        property_type: item.propertyAddress?.propertyType || "",
        district: item.propertyAddress?.district || district,
        county: item.propertyAddress?.county || "",
      }));
  } catch {
    return [];
  }
}

/**
 * Compute a summary for a district from recent transactions.
 */
export async function fetchDistrictSummary(
  district: string
): Promise<{ avgPrice: number; transactionCount: number; period: string }> {
  const txns = await fetchRecentTransactions(district, 6);
  if (txns.length === 0) {
    return { avgPrice: 0, transactionCount: 0, period: "last-6m" };
  }
  const total = txns.reduce((sum, t) => sum + t.price, 0);
  return {
    avgPrice: Math.round(total / txns.length),
    transactionCount: txns.length,
    period: "last-6m",
  };
}
