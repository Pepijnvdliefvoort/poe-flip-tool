
from fastapi import APIRouter, Depends, Query
from backend.utils.session import verify_api_key
from backend.persistence import db
from datetime import datetime, timedelta
from typing import Optional

router = APIRouter()

@router.post("/portfolio/snapshot")
def create_portfolio_snapshot(api_key: str = Depends(verify_api_key)):
	# TODO: Replace with real snapshot calculation logic
	now = datetime.utcnow()
	# Example breakdown, replace with real calculation
	breakdown = [
		{"currency": "divine", "quantity": 100, "divine_per_unit": 1, "total_divine": 100, "source_pair": None},
		{"currency": "chaos", "quantity": 500, "divine_per_unit": 0.2, "total_divine": 20, "source_pair": "chaos/divine"}
	]
	total_divines = sum(b["total_divine"] for b in breakdown if b["total_divine"] is not None)
	saved = db.save_portfolio_snapshot(now, total_divines, breakdown)
	return {
		"saved": saved,
		"timestamp": now.isoformat(),
		"total_divines": total_divines,
		"league": "Standard",
		"breakdown": breakdown
	}

@router.get("/portfolio/history")
def get_portfolio_history(limit: Optional[int] = Query(None), hours: Optional[float] = Query(None), api_key: str = Depends(verify_api_key)):
    snapshots = db.load_portfolio_history(limit=limit, hours=hours)
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
