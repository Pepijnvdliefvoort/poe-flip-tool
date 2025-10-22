import type { TradesResponse, ConfigData, TradePair, PairSummary, CacheSummary, CacheStatus, HistoryResponse, DatabaseStats, LatestValuesResponse, StashTabResponse, PortfolioSnapshot, PortfolioHistoryResponse } from './types'

// Backend base resolution priority:
// 1. VITE_API_BASE (legacy env var)
// 2. VITE_BACKEND_URL (new explicit backend URL for Pages/Fly)
// 3. If running on GitHub Pages (hostname includes 'github.io'), use Fly backend
// 4. Fallback to localhost for dev
const BASE =
    import.meta.env.VITE_API_BASE ||
    import.meta.env.VITE_BACKEND_URL ||
    (typeof location !== 'undefined' && location.hostname.endsWith('github.io')
        ? 'https://poe-flip-backend.fly.dev'
        : 'http://localhost:8000'); // vite dev proxy handles /api

// API Key from environment variable
const API_KEY = import.meta.env.VITE_API_KEY || '';

// Helper to get headers with API key
function headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        ...extra
    };
    if (API_KEY) {
        h['X-API-Key'] = API_KEY;
    }
    return h;
}

async function j<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json()
}

export const Api = {
    async getConfig(): Promise<ConfigData> {
        return j(await fetch(`${BASE}/api/config`, { headers: headers() }))
    },
    async putConfig(cfg: ConfigData): Promise<ConfigData> {
        return j(await fetch(`${BASE}/api/config`, {
            method: 'PUT',
            headers: headers(),
            body: JSON.stringify(cfg)
        }))
    },
    async patchLeague(league: string): Promise<ConfigData> {
        return j(await fetch(`${BASE}/api/config/league?league=${encodeURIComponent(league)}`, {
            method: 'PATCH',
            headers: headers()
        }))
    },
    async patchTrades(body: { add?: TradePair[]; remove_indices?: number[] }): Promise<ConfigData> {
        return j(await fetch(`${BASE}/api/config/trades`, {
            method: 'PATCH',
            headers: headers(),
            body: JSON.stringify({ add: body.add || [], remove_indices: body.remove_indices || [] })
        }))
    },
    async patchAccountName(account_name: string): Promise<ConfigData> {
        return j(await fetch(`${BASE}/api/config/account_name`, {
            method: 'PATCH',
            headers: headers(),
            body: JSON.stringify({ account_name })
        }))
    },
    async rateLimitStatus(): Promise<{ blocked: boolean; block_remaining: number; rules: Record<string, { current: number; limit: number; reset_s: number }[]> }> {
        return j(await fetch(`${BASE}/api/rate_limit`, { headers: headers() }))
    },
    async refreshOne(index: number, top_n = 5): Promise<PairSummary> {
        return j(await fetch(`${BASE}/api/trades/refresh_one?index=${index}&top_n=${top_n}`, { method: 'POST', headers: headers() }))
    },
    async cacheStatus(): Promise<CacheStatus> {
        return j(await fetch(`${BASE}/api/cache/status`, { headers: headers() }))
    },
    async cacheSummary(): Promise<CacheSummary> {
        return j(await fetch(`${BASE}/api/cache/summary`, { headers: headers() }))
    },
    async history(have: string, want: string, maxPoints?: number): Promise<HistoryResponse> {
        const qp = maxPoints ? `?max_points=${maxPoints}` : ''
        return j(await fetch(`${BASE}/api/history/${encodeURIComponent(have)}/${encodeURIComponent(want)}${qp}`, { headers: headers() }))
    },
    async databaseStats(): Promise<DatabaseStats> {
        return j(await fetch(`${BASE}/api/database/stats`, { headers: headers() }))
    }
    ,
    async stashTab(tabName: string): Promise<StashTabResponse> {
        return j(await fetch(`${BASE}/api/stash/${encodeURIComponent(tabName)}`, { headers: headers() }))
    },
    async latestValues(): Promise<LatestValuesResponse> {
        return j(await fetch(`${BASE}/api/value/latest`, { headers: headers() }))
    }
    ,
    async portfolioSnapshot(): Promise<PortfolioSnapshot> {
        return j(await fetch(`${BASE}/api/portfolio/snapshot`, { method: 'POST', headers: headers() }))
    },
    async portfolioHistory(limit?: number): Promise<PortfolioHistoryResponse> {
        const qp = limit ? `?limit=${limit}` : ''
        return j(await fetch(`${BASE}/api/portfolio/history${qp}`, { headers: headers() }))
    }
}