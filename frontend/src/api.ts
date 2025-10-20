import type { TradesResponse, ConfigData, TradePair } from './types'

const BASE = import.meta.env.VITE_API_BASE || '' // vite dev proxy handles /api

async function j<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json()
}

export const Api = {
    async getTrades(top_n = 5): Promise<TradesResponse> {
        return j(await fetch(`${BASE}/api/trades?top_n=${top_n}`))
    },
    async refreshTrades(top_n = 5): Promise<TradesResponse> {
        return j(await fetch(`${BASE}/api/trades/refresh?top_n=${top_n}`, { method: 'POST' }))
    },
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
        return j(await fetch(`${BASE}/api/config/league?league=${encodeURIComponent(league)}`))
    },
    async patchTrades(body: { add?: TradePair[]; remove_indices?: number[] }): Promise<ConfigData> {
        return j(await fetch(`${BASE}/api/config/trades`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ add: body.add || [], remove_indices: body.remove_indices || [] })
        }))
    }
}