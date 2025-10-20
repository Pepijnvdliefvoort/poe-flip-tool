export type TradePair = { get: string; pay: string }

export type ListingSummary = {
  rate: number
  have_currency: string
  have_amount: number
  want_currency: string
  want_amount: number
  stock?: number | null
  seller?: string | null
  indexed?: string | null
}

export type PairSummary = {
  index: number
  get: string
  pay: string
  status: 'ok' | 'error' | 'invalid' | 'loading'
  listings: ListingSummary[]
  best_rate?: number | null
  count_returned: number
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
