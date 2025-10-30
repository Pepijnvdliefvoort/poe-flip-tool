import { Api } from '../api'
import { calculateProfitMargins } from './profit'
import type { TradesResponse, PairSummary } from '../types'

export function reloadPair(index: number, data: TradesResponse | null, setData: Function, topN: number, updateRateLimit: Function, league?: string) {
  if (!data) return;
  setData((prev: TradesResponse | null) => {
    if (!prev) return prev;
    const results = [...prev.results];
    const p = results[index];
    if (p) {
      results[index] = { ...p, status: 'loading', listings: [], best_rate: null, count_returned: 0 };
    }
    return { ...prev, results };
  });
  Api.refreshOne(index, topN, league)
    .then(() => Api.latestCached(topN))
    .then((latest) => {
      setData((prev: TradesResponse | null) => {
        if (!prev) return prev;
        return { ...prev, results: calculateProfitMargins(latest.results) };
      });
    })
    .catch(() => {
      setData((prev: TradesResponse | null) => {
        if (!prev) return prev;
        const results = [...prev.results];
        const p = results[index];
        if (p) {
          results[index] = { ...p, status: 'error' };
        }
        return { ...prev, results };
      });
    })
    .finally(() => updateRateLimit());
}

export function addNewPair(get: string, pay: string, data: TradesResponse | null, setData: Function, topN: number, updateRateLimit: Function, league?: string) {
  if (!data) return;
  const newIndex = data.results.length;
  setData((prev: TradesResponse | null) => {
    if (!prev) return prev;
    const results = [...prev.results, {
      index: newIndex,
      get,
      pay,
      hot: false,
      status: 'loading' as const,
      listings: [],
      best_rate: null,
      count_returned: 0
    }];
    return { ...prev, pairs: results.length, results };
  });
  Api.refreshOne(newIndex, topN, league)
    .then((refreshed) => {
      setData((prev: TradesResponse | null) => {
        if (!prev) return prev;
        const results = [...prev.results];
        results[newIndex] = refreshed;
        const updatedResults = calculateProfitMargins(results);
        return { ...prev, results: updatedResults };
      });
    })
    .catch(() => {
      setData((prev: TradesResponse | null) => {
        if (!prev) return prev;
        const results = [...prev.results];
        results[newIndex] = { ...results[newIndex], status: 'error' };
        return { ...prev, results };
      });
    })
    .finally(() => updateRateLimit());
}

export function removePair(index: number, setData: Function) {
  setData((prev: TradesResponse | null) => {
    if (!prev) return prev;
    const results = prev.results.filter((_, i) => i !== index);
    const reindexed = results.map((r, i) => ({ ...r, index: i }));
    return { ...prev, pairs: reindexed.length, results: reindexed };
  });
}

export function updateHotStatus(index: number, hot: boolean, setData: Function) {
  setData((prev: TradesResponse | null) => {
    if (!prev) return prev;
    const results = [...prev.results];
    if (results[index]) {
      results[index] = { ...results[index], hot };
    }
    return { ...prev, results };
  });
}

export function handleTradeDataUpdate(newResults: PairSummary[], setData: Function) {
  const updatedResults = calculateProfitMargins(newResults.map(r => ({ ...r })));
  setData((prev: TradesResponse | null) => {
    const newData = prev ? {
      league: prev.league,
      pairs: prev.pairs,
      results: updatedResults
    } : null;
    return newData;
  });
}
