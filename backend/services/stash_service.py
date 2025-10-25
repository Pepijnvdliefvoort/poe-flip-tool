import requests
from ..trade_logic import HEADERS, COOKIES
from ..rate_limiter import rate_limiter
from backend.utils.config import load_config
from fastapi import HTTPException

def get_stash_tab_service(tab_name: str):
    cfg = load_config()
    if not cfg.account_name:
        raise HTTPException(status_code=400, detail="No account_name configured in backend config.json")
    league = cfg.league
    account = cfg.account_name
    base_url = "https://www.pathofexile.com/character-window/get-stash-items"
    def _request(params):
        try:
            rate_limiter.wait_before_request()
            resp = requests.get(base_url, headers=HEADERS, cookies=COOKIES, params=params, timeout=20)
            rate_limiter.on_response(resp.headers)
            if resp.status_code == 429:
                return None, 429
            if resp.status_code != 200:
                return None, resp.status_code
            return resp.json(), 200
        except Exception as e:
            return None, 502
    # 1. Fetch tabs metadata
    params = {"league": league, "accountName": account, "tabs": 1, "tabIndex": 0}
    data, status = _request(params)
    if status != 200 or not data or "tabs" not in data:
        raise HTTPException(status_code=502, detail="Failed to fetch stash tabs metadata")
    tab_index = None
    for tab in data["tabs"]:
        if tab.get("n") == tab_name:
            tab_index = tab.get("i")
            break
    if tab_index is None:
        raise HTTPException(status_code=404, detail="Stash tab not found")
    # 2. Fetch items for that tab index
    params = {"league": league, "accountName": account, "tabs": 0, "tabIndex": tab_index}
    data, status = _request(params)
    if status != 200 or not data:
        raise HTTPException(status_code=502, detail="Failed to fetch stash tab items")
    return data
