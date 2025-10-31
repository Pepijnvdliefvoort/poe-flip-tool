from ..persistence import db
import logging

def database_stats_service():
    try:
        stats = db.get_database_stats()
        return {"status": "ok", **stats}
    except Exception as e:
        logging.getLogger("poe-backend").error(f"Failed to get database stats: {e}")
        return {"status": "error", "detail": str(e)}
