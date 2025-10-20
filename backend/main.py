import json
import time
import logging
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, Query, HTTPException
from fastapi import Body
from fastapi.middleware.cors import CORSMiddleware

from models import ConfigData, TradePair, PairSummary, TradesResponse, TradesPatch
from trade_logic import fetch_listings_with_cache

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("poe-backend")

app = FastAPI(title="PoE Trade Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CONFIG_PATH = Path("config.json")


def _load_config() -> ConfigData:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"config.json not found at {CONFIG_PATH.resolve()}")
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return ConfigData(**data)


def _save_config(cfg: ConfigData) -> None:
    with CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump(cfg.dict(), f, indent=2)


@app.get("/")
def root():
    return {"status": "ok", "message": "PoE Trade Backend running"}


@app.get("/api/config", response_model=ConfigData)
def get_config():
    return _load_config()


@app.put("/api/config", response_model=ConfigData)
def put_config(cfg: ConfigData):
    _save_config(cfg)
    return cfg


@app.patch("/api/config/league", response_model=ConfigData)
def patch_league(league: str):
    cfg = _load_config()
    cfg.league = league
    _save_config(cfg)
    return cfg


@app.patch("/api/config/trades", response_model=ConfigData)
def patch_trades(patch: TradesPatch = Body(...)):
    """
    Edit the trades list via JSON body.

    Body shape:
    {
      "add": [{"get":"divine","pay":"chaos"}, {"get":"chaos","pay":"divine"}],
      "remove_indices": [2, 5]
    }
    """
    cfg = _load_config()

    # remove by indices (remove highest first)
    for idx in sorted(patch.remove_indices, reverse=True):
        if 0 <= idx < len(cfg.trades):
            del cfg.trades[idx]

    # add new pairs
    for pair in patch.add:
        cfg.trades.append(pair)

    _save_config(cfg)
    return cfg

@app.post("/api/trades/refresh", response_model=TradesResponse)
def refresh_trades(
    delay_s: float = Query(0.6, ge=0.0, le=5.0),
    top_n: int = Query(5, ge=1, le=20),
):
    """
    Force a fresh fetch for every pair (ignores cache by using a unique top_n key trick).
    You can also just bump top_n by +0 temporarily to bypass cache; here we simply fetch and overwrite cache.
    """
    cfg = _load_config()
    results: List[PairSummary] = []

    for idx, t in enumerate(cfg.trades):
        listings = fetch_listings_with_cache(league=cfg.league, have=t.pay, want=t.get, top_n=top_n)
        if listings is None:
            summary = PairSummary(index=idx, get=t.get, pay=t.pay, status="error", listings=[], best_rate=None, count_returned=0)
        else:
            summary = PairSummary(
                index=idx,
                get=t.get,
                pay=t.pay,
                status="ok",
                listings=listings,
                best_rate=(listings[0].rate if listings else None),
                count_returned=len(listings),
            )
        results.append(summary)
        if delay_s:
            time.sleep(delay_s)

        # mirror concise logs
        log.info(f"[{idx}] {t.pay}->{t.get}: status={summary.status} best_rate={summary.best_rate} count={summary.count_returned}")

    return TradesResponse(league=cfg.league, pairs=len(cfg.trades), results=results)


@app.get("/api/trades", response_model=TradesResponse)
def trades_summary(
    delay_s: float = Query(0.0, ge=0.0, le=5.0),
    top_n: int = Query(5, ge=1, le=20),
):
    """
    Cached summary endpoint (fast). Uses per-pair TTL cache to avoid hammering the PoE API.
    """
    cfg = _load_config()
    results: List[PairSummary] = []

    for idx, t in enumerate(cfg.trades):
        listings = fetch_listings_with_cache(league=cfg.league, have=t.pay, want=t.get, top_n=top_n)
        if listings is None:
            summary = PairSummary(index=idx, get=t.get, pay=t.pay, status="error", listings=[], best_rate=None, count_returned=0)
        else:
            summary = PairSummary(
                index=idx,
                get=t.get,
                pay=t.pay,
                status="ok",
                listings=listings,
                best_rate=(listings[0].rate if listings else None),
                count_returned=len(listings),
            )
        results.append(summary)
        if delay_s:
            time.sleep(delay_s)

        log.info(f"[{idx}] {t.pay}->{t.get}: status={summary.status} best_rate={summary.best_rate} count={summary.count_returned}")

    return TradesResponse(league=cfg.league, pairs=len(cfg.trades), results=results)
