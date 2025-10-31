

import { useState, useEffect, useRef } from 'react';
import '../spinner.css';
import { formatNumberEU, formatRate } from '../utils/format';
import { PairSummary } from '../types';
import { Api } from '../api';
import { gcd, toReducedFraction, getFractionUndercut } from '../utils/tradePriceUtils';
import { TradesTableHeaders } from './trades/tradesTable/TradesTableHeaders';
import { TradesTableControls } from './trades/tradesTable/TradesTableControls';
import { PairsGrid } from './trades/tradesTable/PairsGrid';
import { useTradeSort } from './trades/tradesTable/useTradeSort';



type TradesTableProps = {
    data: PairSummary[];
    loading?: boolean;
    onReload?: (index: number, newPrice?: string) => Promise<any> | void;
    onRefresh?: () => void;
    accountName?: string | null;
    onDataUpdate?: (newData: PairSummary[]) => void;
    topN: number;
};

// Sparkline is now a separate component
import { CurrencyIcon } from './CurrencyIcon';
import Sparkline from './trades/Sparkline';

export function TradesTable(props: TradesTableProps) {
    const { data, loading, onReload, onRefresh, accountName, onDataUpdate, topN } = props;
    const [allExpanded, setAllExpanded] = useState(false);

    // Use refs to always get latest topN and onDataUpdate in the interval
    const topNRef = useRef(topN);
    const onDataUpdateRef = useRef(onDataUpdate);
    useEffect(() => { topNRef.current = topN; }, [topN]);
    useEffect(() => { onDataUpdateRef.current = onDataUpdate; }, [onDataUpdate]);

    useEffect(() => {
        let cancelled = false;
        let intervalRef: number | null = null;
        let fetching = false;

        const fetchLatestCached = async () => {
            if (cancelled || fetching) return;
            fetching = true;
            try {
                console.log('[TradesTable] 30s refresh triggered');
                const response = await Api.latestCached(topNRef.current);
                if (!cancelled && response.results && onDataUpdateRef.current) {
                    onDataUpdateRef.current(response.results);
                }
            } catch (error) {
                if (!cancelled) {
                    console.error('[TradesTable] Failed to fetch latest cached data:', error);
                }
            } finally {
                fetching = false;
            }
        };

        // Fetch immediately on mount if no data
        if (!data || data.length === 0) {
            fetchLatestCached();
        }
        // Set up interval for polling every 30s
        intervalRef = window.setInterval(fetchLatestCached, 30000);

        return () => {
            cancelled = true;
            if (intervalRef !== null) clearInterval(intervalRef);
        };
    }, [data]);

    // Always display all metrics
    const selectedMetrics = ['spread', 'median', 'profit'] as const

    // Sort state and handler
    const { sortBy, sortDirection, handleSort } = useTradeSort();

    // Compute global max absolute delta for baseline-aligned sparklines
    const globalMaxAbsDelta = (() => {
        // Find maximum absolute percent change relative to first point among all sparklines
        let maxAbsPct = 0
        for (const p of data) {
            const s = p.trend?.sparkline
            if (s && s.length > 1) {
                const base = s[0]
                if (base === 0) continue
                for (const v of s) {
                    const pct = Math.abs(((v - base) / base) * 100)
                    if (pct > maxAbsPct) maxAbsPct = pct
                }
            }
        }
        return maxAbsPct || 0
    })()

    // Sort data based on selected sort key
    const sortedData = (() => {
        if (sortBy === 'none' || sortDirection === 'none') return data;
        const sorted = [...data].sort((a, b) => {
            let aVal: number | null = null;
            let bVal: number | null = null;
            switch (sortBy) {
                case 'change':
                    aVal = a.trend?.change_percent ?? null;
                    bVal = b.trend?.change_percent ?? null;
                    break;
                case 'spread':
                    if (a.listings.length >= 2) {
                        const rates = a.listings.map(l => l.rate);
                        const min = Math.min(...rates);
                        const max = Math.max(...rates);
                        aVal = min !== 0 ? ((max - min) / min) * 100 : null;
                    }
                    if (b.listings.length >= 2) {
                        const rates = b.listings.map(l => l.rate);
                        const min = Math.min(...rates);
                        const max = Math.max(...rates);
                        bVal = min !== 0 ? ((max - min) / min) * 100 : null;
                    }
                    break;
                case 'median':
                    if (a.listings.length > 0) {
                        const rates = a.listings.map(l => l.rate);
                        const sorted = [...rates].sort((x, y) => x - y);
                        const mid = Math.floor(sorted.length / 2);
                        aVal = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
                    }
                    if (b.listings.length > 0) {
                        const rates = b.listings.map(l => l.rate);
                        const sorted = [...rates].sort((x, y) => x - y);
                        const mid = Math.floor(sorted.length / 2);
                        bVal = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
                    }
                    break;
                case 'profit':
                    aVal = a.profit_margin_pct ?? null;
                    bVal = b.profit_margin_pct ?? null;
                    break;
            }
            if (aVal === null && bVal === null) return 0;
            if (aVal === null) return 1;
            if (bVal === null) return -1;
            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });
        return sorted;
    })();

    // Find the index currently loading (first with empty listings)
    const loadingIndex = loading ? sortedData.findIndex(p => p.listings.length === 0) : -1

    // (Reverted) Removed cache watch polling logic – handled by legacy 60s auto-refresh in App.

    return (
        <>
            <div className="trades-container">
                <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
                    <TradesTableControls allExpanded={allExpanded} setAllExpanded={setAllExpanded} onRefresh={onRefresh} loading={loading} />
                </div>
                <div style={{
                    display: 'grid',
                    gridAutoFlow: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '8px 24px 8px 0px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    marginBottom: '6px'
                }}>
                    <TradesTableHeaders sortBy={sortBy} sortDirection={sortDirection} handleSort={handleSort} />
                </div>
                <PairsGrid
                    data={sortedData}
                    loading={!!loading}
                    loadingIndex={loadingIndex}
                    onReload={onReload ? onReload : () => {}}
                    globalMaxAbsDelta={globalMaxAbsDelta}
                    accountName={accountName}
                    selectedMetrics={selectedMetrics}
                    allExpanded={allExpanded}
                />
            </div>
        </>
    );
}
