import type { PairSummary } from '../types'

// Helper function to calculate profit margins for linked pairs
export function calculateProfitMargins(pairs: PairSummary[]): PairSummary[] {
  const result = pairs.map(p => ({ ...p })); // Clone to avoid mutation
  for (let i = 0; i < result.length; i++) {
    const pairA = result[i];
    // Skip if already calculated or no valid median_rate
    if (pairA.linked_pair_index != null || pairA.median_rate == null) {
      continue;
    }
    // Find the reverse pair
    for (let j = 0; j < result.length; j++) {
      if (i === j) continue;
      const pairB = result[j];
      // Check if this is the reverse pair (get/pay swapped)
      if (pairA.get === pairB.pay && pairA.pay === pairB.get) {
        if (pairB.median_rate != null && pairB.median_rate > 0) {
          // Link them together
          pairA.linked_pair_index = j;
          pairB.linked_pair_index = i;
          // Calculate profit margin using median_rate
          // pairA: pay X to get Y (rate = Y/X)
          // pairB: pay Y to get X (rate = X/Y)
          // Amount of pairA.get currency we receive per 1 pairA.pay
          const receivePerCycle = pairA.median_rate;
          // Amount of pairA.get currency we need to spend to get back 1 pairA.pay
          const spendToGetBack = 1.0 / pairB.median_rate;
          // Raw profit in pairA.get currency per 1 pairA.pay spent
          const rawProfit = receivePerCycle - spendToGetBack;
          // Percentage profit margin
          const profitPct = spendToGetBack > 0 ? (rawProfit / spendToGetBack * 100) : 0;
          pairA.profit_margin_raw = Math.round(rawProfit * 10000) / 10000;
          pairA.profit_margin_pct = Math.round(profitPct * 100) / 100;
          pairB.profit_margin_raw = Math.round(rawProfit * 10000) / 10000;
          pairB.profit_margin_pct = Math.round(profitPct * 100) / 100;
        }
        break;
      }
    }
  }
  return result;
}
