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
}

export type TradesResponse = {
  league: string
  pairs: number
  results: PairSummary[]
}

export type ConfigData = {
  league: string
  trades: TradePair[]
}
