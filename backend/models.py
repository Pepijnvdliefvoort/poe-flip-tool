from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class TradePair(BaseModel):
    get: str
    pay: str
    hot: bool = Field(default=False)


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
    account_name: Optional[str] = None
    whisper: Optional[str] = None
    indexed: Optional[str] = None


class PriceTrend(BaseModel):
    """Trend information for sparkline visualization"""
    direction: str  # "up" | "down" | "neutral"
    change_percent: float
    data_points: int
    oldest: Optional[str] = None
    newest: Optional[str] = None
    sparkline: Optional[List[float]] = None  # Down-sampled best_rate history for inline chart


class PairSummary(BaseModel):
    index: int
    get: str
    pay: str
    hot: bool = Field(default=False)
    status: str  # "ok" | "error" | "invalid" | "rate_limited"
    listings: List[ListingSummary] = Field(default_factory=list)
    best_rate: Optional[float] = None
    count_returned: int = 0
    trend: Optional[PriceTrend] = None  # Price trend for sparkline


class TradesResponse(BaseModel):
    league: str
    pairs: int
    results: List[PairSummary]

class TradesPatch(BaseModel):
    add: List[TradePair] = Field(default_factory=list)
    remove_indices: List[int] = Field(default_factory=list)