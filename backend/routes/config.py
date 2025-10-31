from fastapi import APIRouter, Depends, Body, HTTPException
from ..models import ConfigData, TradesPatch
from backend.utils.config import load_config, save_config
from backend.utils.session import verify_api_key

router = APIRouter()

@router.get("/config", response_model=ConfigData)
def get_config(league: str = None, api_key: str = Depends(verify_api_key)):
    return load_config(league)

@router.put("/config", response_model=ConfigData)
def put_config(cfg: ConfigData, api_key: str = Depends(verify_api_key)):
    save_config(cfg)
    return cfg

@router.patch("/config/league", response_model=ConfigData)
def patch_league(league: str, api_key: str = Depends(verify_api_key)):
    # Load or create config for the new league
    cfg = load_config(league)
    cfg.league = league
    save_config(cfg)
    return cfg

@router.patch("/config/account_name", response_model=ConfigData)
def patch_account_name(account_name: str = Body(..., embed=True), league: str = None, api_key: str = Depends(verify_api_key)):
    cfg = load_config(league)
    cfg.account_name = account_name.strip() or None
    save_config(cfg)
    return cfg

@router.patch("/config/trades", response_model=ConfigData)
def patch_trades(patch: TradesPatch = Body(...), league: str = None, api_key: str = Depends(verify_api_key)):
    cfg = load_config(league)
    for idx in sorted(patch.remove_indices, reverse=True):
        if 0 <= idx < len(cfg.trades):
            del cfg.trades[idx]
    for pair in patch.add:
        cfg.trades.append(pair)
    save_config(cfg)
    return cfg
