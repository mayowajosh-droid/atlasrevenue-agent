import type { BuyerProfile } from "./types.js";
import { getBuyerEntityById, getBuyerOfficers, getBuyerHistory, searchBuyerEntities, getTopBuyerEntities } from "./db.js";

export async function buildBuyerProfile(entityId: string): Promise<BuyerProfile | null> {
  const entity = await getBuyerEntityById(entityId);
  if (!entity) return null;

  const [officers, history] = await Promise.all([
    getBuyerOfficers(entityId),
    getBuyerHistory(entityId, 100),
  ]);

  const categoryMap = new Map<string, { count: number; value: number }>();
  const supplierMap = new Map<string, { count: number; value: number }>();
  let totalValue = 0;

  for (const h of history) {
    const val = Number(h.awarded_value || h.value_high || h.value_low || 0);
    totalValue += val;

    if (h.category) {
      const cat = categoryMap.get(h.category) || { count: 0, value: 0 };
      cat.count++;
      cat.value += val;
      categoryMap.set(h.category, cat);
    }

    if (h.awarded_supplier && h.awarded_supplier.length > 2) {
      const sup = supplierMap.get(h.awarded_supplier) || { count: 0, value: 0 };
      sup.count++;
      sup.value += val;
      supplierMap.set(h.awarded_supplier, sup);
    }
  }

  const topCategories = [...categoryMap.entries()]
    .map(([category, { count, value }]) => ({ category, count, value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topSuppliers = [...supplierMap.entries()]
    .map(([name, { count, value }]) => ({ name, count, value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const frequency: BuyerProfile["stats"]["procurementFrequency"] =
    history.length >= 20 ? "high" : history.length >= 5 ? "medium" : "low";

  const lastActivity = history.length > 0
    ? (history[0].published_date || history[0].awarded_date || null)
    : null;

  return {
    entity,
    officers,
    history,
    stats: {
      totalContracts: history.length,
      totalValue,
      avgContractValue: history.length > 0 ? Math.round(totalValue / history.length) : 0,
      topCategories,
      topSuppliers,
      procurementFrequency: frequency,
      lastActivity,
    },
  };
}

export async function findBuyersByName(query: string) {
  return searchBuyerEntities(query, 10);
}

export async function getTopBuyers(limit = 20) {
  return getTopBuyerEntities(limit);
}
