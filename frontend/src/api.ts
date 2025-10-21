import type { TradesResponse, ConfigData, TradePair, PairSummary, CacheSummary, CacheStatus, HistoryResponse, DatabaseStats, LatestValuesResponse, StashTabResponse, PortfolioSnapshot, PortfolioHistoryResponse } from './types'

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000' // vite dev proxy handles /api

async function j<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json()
}

export const Api = {
    async getConfig(): Promise<ConfigData> {
        return j(await fetch(`${BASE}/api/config`))
    },
    async putConfig(cfg: ConfigData): Promise<ConfigData> {
        return j(await fetch(`${BASE}/api/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg)
        }))
    },
    async patchLeague(league: string): Promise<ConfigData> {
        return j(await fetch(`${BASE}/api/config/league?league=${encodeURIComponent(league)}`, {
            method: 'PATCH'
        }))
    },
    async patchTrades(body: { add?: TradePair[]; remove_indices?: number[] }): Promise<ConfigData> {
        return j(await fetch(`${BASE}/api/config/trades`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ add: body.add || [], remove_indices: body.remove_indices || [] })
        }))
    },
    async patchAccountName(account_name: string): Promise<ConfigData> {
        return j(await fetch(`${BASE}/api/config/account_name`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_name })
        }))
    },
    async rateLimitStatus(): Promise<{ blocked: boolean; block_remaining: number; rules: Record<string, { current: number; limit: number; reset_s: number }[]> }> {
        return j(await fetch(`${BASE}/api/rate_limit`))
    },
    async refreshOne(index: number, top_n = 5): Promise<PairSummary> {
        return j(await fetch(`${BASE}/api/trades/refresh_one?index=${index}&top_n=${top_n}`, { method: 'POST' }))
    },
    async cacheStatus(): Promise<CacheStatus> {
        return j(await fetch(`${BASE}/api/cache/status`))
    },
    async cacheSummary(): Promise<CacheSummary> {
        return j(await fetch(`${BASE}/api/cache/summary`))
    },
    async history(have: string, want: string, maxPoints?: number): Promise<HistoryResponse> {
        const qp = maxPoints ? `?max_points=${maxPoints}` : ''
        return j(await fetch(`${BASE}/api/history/${encodeURIComponent(have)}/${encodeURIComponent(want)}${qp}`))
    },
    async databaseStats(): Promise<DatabaseStats> {
        return j(await fetch(`${BASE}/api/database/stats`))
    }
    ,
    async stashTab(tabName: string): Promise<StashTabResponse> {
        return j(await fetch(`${BASE}/api/stash/${encodeURIComponent(tabName)}`))
    },
    async latestValues(): Promise<LatestValuesResponse> {
        return j(await fetch(`${BASE}/api/value/latest`))
    }
    ,
    async portfolioSnapshot(): Promise<PortfolioSnapshot> {
        return j(await fetch(`${BASE}/api/portfolio/snapshot`, { method: 'POST' }))
    },
    async portfolioHistory(limit?: number): Promise<PortfolioHistoryResponse> {
        const qp = limit ? `?limit=${limit}` : ''
        return j(await fetch(`${BASE}/api/portfolio/history${qp}`))
    }
}