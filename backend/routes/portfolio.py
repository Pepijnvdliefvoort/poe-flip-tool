
from fastapi import APIRouter, Depends, Query
from backend.utils.session import verify_api_key
from backend.persistence import db
from datetime import datetime, timedelta
from typing import Optional

router = APIRouter()

@router.post("/portfolio/snapshot")

def create_portfolio_snapshot(league: str = None, api_key: str = Depends(verify_api_key)):
	# Allow scheduler to bypass API key check
	if api_key == "__scheduler__":
		pass
	from backend.services.stash_service import get_stash_tab_service
	from backend.utils.config import load_config
	from backend.trade_logic import cache
	now = datetime.utcnow()
	cfg = load_config(league)
	league = cfg.league
	top_n = getattr(cfg, 'top_n', 5) if hasattr(cfg, 'top_n') else cfg.__dict__.get('topN', 5) if hasattr(cfg, '__dict__') else 5
	# Fetch items from both tabs
	tab_names = ["currency", "trades"]
	# Map PoE item names to config currency keys
	currency_normalize = {
		"divine orb": "divine",
		"exalted orb": "exalted",
		"chaos orb": "chaos",
		"mirror of kalandra": "mirror",
		"exalt": "exalted",
		"divine": "divine",
		"mirror": "mirror",
		"chaos": "chaos",
		"mirror shard": "mirror-shard",
		"hinekoras lock": "hinekoras-lock",
		"hinekora's lock": "hinekoras-lock",
	}
	currency_counts = {}
	for tab_name in tab_names:
		try:
			tab_data = get_stash_tab_service(tab_name)
			for item in tab_data.get("items", []):
				raw_currency = item.get("typeLine") or item.get("currencyTypeName")
				if not raw_currency:
					continue
				currency = currency_normalize.get(raw_currency.strip().lower(), raw_currency.strip().lower())
				stack_size = item.get("stackSize") or item.get("stackSizeOverride") or item.get("quantity") or 0
				if stack_size:
					currency_counts[currency] = currency_counts.get(currency, 0) + stack_size
		except Exception as e:
			continue
	# Get all unique currencies from trade pairs
	trade_currencies = set()
	for t in cfg.trades:
		trade_currencies.add(t.get.lower())
		trade_currencies.add(t.pay.lower())
	breakdown = []
	total_divines = 0.0
	for currency in sorted(trade_currencies):
		quantity = currency_counts.get(currency, 0)
		display_name = next((k.title() for k, v in currency_normalize.items() if v == currency), currency)
		if currency in ["divine orb", "divine"]:
			divine_per_unit = 1.0
			total_divine = quantity
			source_pair = None
		else:
			# Try direct cache (divine->currency)
			key_direct = (league, "divine", currency)
			entry = cache._store.get(key_direct)
			median_rate = None
			if entry and hasattr(entry, "data") and entry.data:
				rates = [l.rate for l in entry.data[:top_n] if hasattr(l, "rate")]
				if rates:
					import statistics
					median_rate = statistics.median(rates)
					source_pair = f"divine/{currency}"
			# If not in cache, try DB for direct pair
			if not median_rate or median_rate <= 0:
				snapshots = db.load_snapshots(league, "divine", currency, limit=1)
				if snapshots:
					median_rate = snapshots[-1]["median_rate"]
					source_pair = f"divine/{currency}"
			# If still not found, try indirect via chaos
			if (not median_rate or median_rate <= 0) and currency != "chaos":
				# divine->chaos
				key_divine_chaos = (league, "divine", "chaos")
				entry_divine_chaos = cache._store.get(key_divine_chaos)
				median_divine_chaos = None
				if entry_divine_chaos and hasattr(entry_divine_chaos, "data") and entry_divine_chaos.data:
					rates = [l.rate for l in entry_divine_chaos.data[:top_n] if hasattr(l, "rate")]
					if rates:
						import statistics
						median_divine_chaos = statistics.median(rates)
				if not median_divine_chaos or median_divine_chaos <= 0:
					snapshots = db.load_snapshots(league, "divine", "chaos", limit=1)
					if snapshots:
						median_divine_chaos = snapshots[-1]["median_rate"]
				# chaos->currency
				key_chaos_cur = (league, "chaos", currency)
				entry_chaos_cur = cache._store.get(key_chaos_cur)
				median_chaos_cur = None
				if entry_chaos_cur and hasattr(entry_chaos_cur, "data") and entry_chaos_cur.data:
					rates = [l.rate for l in entry_chaos_cur.data[:top_n] if hasattr(l, "rate")]
					if rates:
						import statistics
						median_chaos_cur = statistics.median(rates)
				if not median_chaos_cur or median_chaos_cur <= 0:
					snapshots = db.load_snapshots(league, "chaos", currency, limit=1)
					if snapshots:
						median_chaos_cur = snapshots[-1]["median_rate"]
				if median_divine_chaos and median_chaos_cur and median_divine_chaos > 0 and median_chaos_cur > 0:
					# divine->chaos->currency
					median_rate = median_divine_chaos * median_chaos_cur
					source_pair = f"divine/chaos/{currency}"
			if median_rate and median_rate > 0:
				divine_per_unit = median_rate
			else:
				divine_per_unit = 0.0
				source_pair = None
			total_divine = quantity * divine_per_unit
		breakdown.append({
			"currency": display_name,
			"quantity": quantity,
			"divine_per_unit": divine_per_unit,
			"total_divine": total_divine,
			"source_pair": source_pair
		})
		total_divines += total_divine
	saved = db.save_portfolio_snapshot(league, now, total_divines, breakdown)
	return {
		"saved": saved,
		"timestamp": now.isoformat(),
		"total_divines": total_divines,
		"league": league,
		"breakdown": breakdown
	}

@router.get("/portfolio/history")
def get_portfolio_history(league: str = None, limit: Optional[int] = Query(None), hours: Optional[float] = Query(None), api_key: str = Depends(verify_api_key)):
	from backend.utils.config import load_config
	if not league:
		cfg = load_config()
		league = cfg.league
	snapshots = db.load_portfolio_history(league, limit=limit, hours=hours)
	return {"count": len(snapshots), "snapshots": snapshots}

@router.get("/portfolio/scheduler_status")
def get_scheduler_status(api_key: str = Depends(verify_api_key)):
	# Dummy implementation: replace with real scheduler status logic
	return {
		"enabled": True,
		"interval_seconds": 900,
		"last_success": datetime.utcnow().isoformat(),
		"last_error": None,
		"last_total_divines": 123.45,
		"runs": 42
	}
