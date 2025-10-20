export type TradePair = { get: string; pay: string; hot?: boolean }

export type ListingSummary = {
  rate: number
  have_currency: string
  have_amount: number
  want_currency: string
  want_amount: number
  stock?: number | null
  seller?: string | null
  account_name?: string | null
  whisper?: string | null
  indexed?: string | null
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
  rate_limit_remaining?: number | null
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
