export type TradePair = { get: string; pay: string; hot?: boolean }

export type ListingSummary = {
  rate: number
  have_currency: string
  have_amount: number
  want_currency: string
  want_amount: number
  stock?: number | null
  account_name?: string | null
  whisper?: string | null
  indexed?: string | null
}

export type PriceTrend = {
  direction: 'up' | 'down' | 'neutral'
  change_percent: number
  data_points: number
  oldest?: string | null
  newest?: string | null
  sparkline?: number[]
}

export type PairSummary = {
  index: number
  get: string
  pay: string
  hot?: boolean
  status: 'ok' | 'error' | 'invalid' | 'loading' | 'rate_limited'
  listings: ListingSummary[]
  best_rate?: number | null
  count_returned: number
  trend?: PriceTrend | null
  fetched_at?: string | null
}

export type TradesResponse = {
  league: string
  pairs: number
  results: PairSummary[]
}

export type ConfigData = {
  league: string
  trades: TradePair[]
  account_name?: string | null
}

// Cache status (lightweight per pair)
export type CacheStatus = {
  pairs: {
    index: number
    have: string
    want: string
    cached: boolean
    expired: boolean
    seconds_remaining: number
  }[]
}

// Detailed cache + historical summary
export type CacheSummary = {
  league: string
  trade_cache: {
    ttl_seconds: number
    entries: number
    soonest_expiry: string | null
    entries_detail: {
      league: string
      have: string
      want: string
      expires_at: string
      seconds_remaining: number
      expired: boolean
      listing_count: number
    }[]
  }
  historical: {
    pairs_tracked: number
    total_snapshots: number
    retention_hours: number
    max_points_per_pair: number
    oldest_timestamp: string | null
    newest_timestamp: string | null
    age_seconds: number
  }
}

export type HistoryResponse = {
  league: string
  have: string
  want: string
  history: { timestamp: string; best_rate: number; avg_rate: number; listing_count: number }[]
  trend: PriceTrend
}

export type DatabaseStats = {
  status: string
  database_file: string
  database_size_bytes: number
  cache_entries: number
  price_snapshots: number
  oldest_cache_entry: string | null
  oldest_snapshot: string | null
  newest_snapshot: string | null
}
