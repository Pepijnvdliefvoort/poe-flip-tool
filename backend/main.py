 
import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("poe-backend")

app = FastAPI(title="PoE Trade Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and register routers from routes
from backend.routes.root import router as root_router
from backend.routes.auth import router as auth_router
from backend.routes.config import router as config_router
from backend.routes.trades import router as trades_router
from backend.routes.cache import router as cache_router


from backend.routes.history import router as history_router
from backend.routes.database import router as database_router
from backend.routes.rate_limit import router as rate_limit_router
from backend.routes.stash import router as stash_router
from backend.routes.portfolio import router as portfolio_router

# Scheduler imports
import threading
import time
from datetime import datetime
from backend.routes import portfolio

SNAPSHOT_INTERVAL_SECONDS = 900  # 15 minutes

def scheduler_loop():
    while True:
        try:
            # Call the snapshot logic directly, using a special API key or bypass auth
            portfolio.create_portfolio_snapshot(api_key="__scheduler__")
        except Exception as e:
            log.error(f"Scheduler snapshot error: {e}")
        time.sleep(SNAPSHOT_INTERVAL_SECONDS)

@app.on_event("startup")
def start_scheduler():
    t = threading.Thread(target=scheduler_loop, daemon=True)
    t.start()

# Register routers with appropriate prefixes
app.include_router(root_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(config_router, prefix="/api")
app.include_router(trades_router, prefix="/api")
app.include_router(cache_router, prefix="/api")

app.include_router(history_router, prefix="/api")
app.include_router(database_router, prefix="/api")
app.include_router(rate_limit_router, prefix="/api")
app.include_router(stash_router, prefix="/api")
app.include_router(portfolio_router, prefix="/api")

