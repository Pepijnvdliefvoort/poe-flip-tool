from typing import List, Optional
from pydantic import BaseModel, Field


class TradePair(BaseModel):
    get: str
    pay: str


class ConfigData(BaseModel):
    league: str = Field(default="Standard")
    trades: List[TradePair] = Field(default_factory=list)


class ListingSummary(BaseModel):
    rate: float
    have_currency: str
    have_amount: float
    want_currency: str
    want_amount: float
    stock: Optional[int] = None
    seller: Optional[str] = None
    indexed: Optional[str] = None


class PairSummary(BaseModel):
    index: int
    get: str
    pay: str
    status: str  # "ok" | "error" | "invalid" | "rate_limited"
    listings: List[ListingSummary] = Field(default_factory=list)
    best_rate: Optional[float] = None
    count_returned: int = 0
    rate_limit_remaining: Optional[float] = None  # seconds until next attempt when rate_limited


class TradesResponse(BaseModel):
    league: str
    pairs: int
    results: List[PairSummary]

class TradesPatch(BaseModel):
    add: List[TradePair] = Field(default_factory=list)
    remove_indices: List[int] = Field(default_factory=list)