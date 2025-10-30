"""
SQLite persistence layer for trade cache and historical price data.
Ensures data survives application restarts.
"""
import sqlite3
import json
import logging
import os
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional, Any
from pathlib import Path
from contextlib import contextmanager

log = logging.getLogger("poe-backend")


class DatabasePersistence:
    # ============================================================================
    # Last Selected League Operations
    # ============================================================================

    def save_last_selected_league(self, league: str) -> bool:
        """Save the last selected league to the database."""
        try:
            with self._transaction() as cursor:
                cursor.execute('''
                    INSERT INTO last_selected_league (id, league)
                    VALUES (1, ?)
                    ON CONFLICT(id) DO UPDATE SET league=excluded.league
                ''', (league,))
            log.debug(f"Saved last selected league: {league}")
            return True
        except Exception as e:
            log.error(f"Failed to save last selected league: {e}")
            return False

    def load_last_selected_league(self) -> str:
        """Load the last selected league from the database. Returns league or None."""
        try:
            cursor = self.conn.cursor()
            cursor.execute('SELECT league FROM last_selected_league WHERE id=1')
            row = cursor.fetchone()
            if not row:
                log.info("No last selected league found in database.")
                return None
            league = row['league']
            log.debug(f"Loaded last selected league: {league}")
            return league
        except Exception as e:
            log.error(f"Failed to load last selected league: {e}")
            return None
    # ============================================================================
    # Config Table Operations
    # ============================================================================

    def save_config_db(self, league: str, trades: list, account_name: str = None, thread_id: str = None) -> bool:
        """Save config data to the database for a specific league."""
        try:
            trades_json = json.dumps(trades)
            with self._transaction() as cursor:
                cursor.execute('''
                    INSERT INTO config (league, trades_json, account_name, thread_id)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(league) DO UPDATE SET trades_json=excluded.trades_json, account_name=excluded.account_name, thread_id=excluded.thread_id
                ''', (league, trades_json, account_name, thread_id))
            log.debug(f"Saved config to database: league={league}, trades={trades}, account_name={account_name}, thread_id={thread_id}")
            return True
        except Exception as e:
            log.error(f"Failed to save config to database: {e}")
            return False

    def load_config_db(self, league: str) -> dict:
        """Load config data for a specific league from the database. Returns dict or None."""
        try:
            cursor = self.conn.cursor()
            cursor.execute('SELECT league, trades_json, account_name, thread_id FROM config WHERE league=?', (league,))
            row = cursor.fetchone()
            if not row:
                log.info(f"No config found in database for league {league}.")
                return None
            trades = json.loads(row['trades_json'])
            config = {
                'league': row['league'],
                'trades': trades,
                'account_name': row['account_name'],
                'thread_id': row['thread_id']
            }
            log.debug(f"Loaded config from database: {config}")
            return config
        except Exception as e:
            log.error(f"Failed to load config from database: {e}")
            return None
    """Handles SQLite persistence for cache entries and price snapshots."""
    
    def __init__(self, db_path: str = "poe_cache.db"):
        self.db_path = Path(db_path)
        self.conn: Optional[sqlite3.Connection] = None
        self._init_database()
    
    def _init_database(self):
        """Initialize database connection and create schema if needed."""
        try:
            self.conn = sqlite3.connect(
                str(self.db_path),
                check_same_thread=False,  # Allow access from multiple threads
                isolation_level=None  # Autocommit mode for better concurrency
            )
            self.conn.row_factory = sqlite3.Row  # Enable column access by name
            self._create_schema()
            log.info(f"SQLite database initialized at {self.db_path}")
        except Exception as e:
            log.error(f"Failed to initialize database: {e}")
            raise
    
    def _create_schema(self):
        """Create tables if they don't exist."""
        try:
            self.conn.executescript('''
                CREATE TABLE IF NOT EXISTS cache_entries (
                    league TEXT NOT NULL,
                    have TEXT NOT NULL,
                    want TEXT NOT NULL,
                    listings_json TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (league, have, want)
                );

                CREATE INDEX IF NOT EXISTS idx_cache_expiry 
                ON cache_entries(expires_at);

                CREATE TABLE IF NOT EXISTS price_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    league TEXT NOT NULL,
                    have TEXT NOT NULL,
                    want TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    best_rate REAL NOT NULL,
                    avg_rate REAL NOT NULL,
                    median_rate REAL NOT NULL,
                    listing_count INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_snapshots_pair 
                ON price_snapshots(league, have, want, timestamp);

                CREATE INDEX IF NOT EXISTS idx_snapshots_time 
                ON price_snapshots(timestamp);

                CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    league TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    total_divines REAL NOT NULL,
                    breakdown_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_portfolio_time
                ON portfolio_snapshots(timestamp);

                -- Config table: one row per league
                CREATE TABLE IF NOT EXISTS config (
                    league TEXT PRIMARY KEY,
                    trades_json TEXT NOT NULL,
                    account_name TEXT,
                    thread_id TEXT
                );

                -- Table to store last selected league
                CREATE TABLE IF NOT EXISTS last_selected_league (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    league TEXT NOT NULL
                );
            ''')
            log.debug("Database schema created/verified")
        except Exception as e:
            log.error(f"Failed to create schema: {e}")
            raise
    
    @contextmanager
    def _transaction(self):
        """Context manager for transactions with automatic rollback on error."""
        cursor = self.conn.cursor()
        try:
            cursor.execute("BEGIN")
            yield cursor
            cursor.execute("COMMIT")
        except Exception as e:
            cursor.execute("ROLLBACK")
            log.error(f"Transaction rolled back: {e}")
            raise
        finally:
            cursor.close()
    
    # ============================================================================
    # Cache Entry Operations
    # ============================================================================
    
    def save_cache_entry(
        self,
        league: str,
        have: str,
        want: str,
        listings: List[Any],
        expires_at: datetime
    ) -> bool:
        """Save a cache entry to the database."""
        try:
            # Serialize listings to JSON
            listings_json = json.dumps([
                {
                    'rate': l.rate,
                    'have_currency': l.have_currency,
                    'have_amount': l.have_amount,
                    'want_currency': l.want_currency,
                    'want_amount': l.want_amount,
                    'stock': l.stock,
                    'account_name': l.account_name,
                    'whisper': l.whisper,
                    'indexed': l.indexed
                }
                for l in listings
            ])
            
            with self._transaction() as cursor:
                cursor.execute('''
                    INSERT OR REPLACE INTO cache_entries 
                    (league, have, want, listings_json, expires_at, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    league, have, want, listings_json,
                    expires_at.isoformat(),
                    datetime.utcnow().isoformat()
                ))
            
            log.debug(f"Saved cache entry: {have}->{want} (expires {expires_at.isoformat()})")
            return True
        except Exception as e:
            log.error(f"Failed to save cache entry {have}->{want}: {e}")
            return False
    
    def load_cache_entries(self) -> Dict[Tuple[str, str, str], Tuple[List[Dict], datetime]]:
        """Load all non-expired cache entries from database."""
        try:
            now = datetime.utcnow()
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT league, have, want, listings_json, expires_at, created_at
                FROM cache_entries
                WHERE expires_at > ?
                ORDER BY expires_at ASC
            ''', (now.isoformat(),))

            entries = {}
            for row in cursor.fetchall():
                key = (row['league'], row['have'], row['want'])
                listings = json.loads(row['listings_json'])
                expires_at = datetime.fromisoformat(row['expires_at'])
                entries[key] = (listings, expires_at)

            log.info(f"Loaded {len(entries)} cache entries from database")
            return entries
        except Exception as e:
            log.error(f"Failed to load cache entries: {e}")
            return {}
    
    def cleanup_expired_cache(self) -> int:
        """Remove expired cache entries. Returns number of deleted rows."""
        try:
            now = datetime.utcnow()
            with self._transaction() as cursor:
                cursor.execute('''
                    DELETE FROM cache_entries
                    WHERE expires_at <= ?
                ''', (now.isoformat(),))
                deleted = cursor.rowcount
            
            if deleted > 0:
                log.info(f"Cleaned up {deleted} expired cache entries")
            return deleted
        except Exception as e:
            log.error(f"Failed to cleanup expired cache: {e}")
            return 0
    
    # ============================================================================
    # Price Snapshot Operations
    # ============================================================================
    
    def save_snapshot(
        self,
        league: str,
        have: str,
        want: str,
        timestamp: datetime,
        best_rate: float,
        avg_rate: float,
        median_rate: float,
        listing_count: int
    ) -> bool:
        """Save a price snapshot to the database, avoiding duplicates."""
        try:
            # Check for duplicate: same median_rate within 1 minute
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT timestamp, median_rate FROM price_snapshots
                WHERE league = ? AND have = ? AND want = ?
                ORDER BY timestamp DESC LIMIT 1
            ''', (league, have, want))
            row = cursor.fetchone()
            if row:
                last_ts = datetime.fromisoformat(row['timestamp'])
                last_median = row['median_rate']
                time_diff = abs((timestamp - last_ts).total_seconds())
                median_diff = abs(last_median - median_rate)
                if time_diff < 60 and median_diff < 1e-6:
                    log.debug(f"Skipped DB duplicate snapshot for {have}->{want}: median unchanged ({median_rate:.6f})")
                    cursor.close()
                    return False
            cursor.close()
            with self._transaction() as cursor:
                cursor.execute('''
                    INSERT INTO price_snapshots 
                    (league, have, want, timestamp, best_rate, avg_rate, median_rate, listing_count)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    league, have, want,
                    timestamp.isoformat(),
                    best_rate, avg_rate, median_rate, listing_count
                ))
            log.debug(f"Saved snapshot: {have}->{want} @ {timestamp.isoformat()}")
            return True
        except Exception as e:
            log.error(f"Failed to save snapshot {have}->{want}: {e}")
            return False
    
    def load_snapshots(
        self,
        league: str,
        have: str,
        want: str,
        since: Optional[datetime] = None,
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Load price snapshots for a specific pair."""
        try:
            query = '''
                SELECT timestamp, best_rate, avg_rate, median_rate, listing_count
                FROM price_snapshots
                WHERE league = ? AND have = ? AND want = ?
            '''
            params = [league, have, want]
            
            if since:
                query += ' AND timestamp > ?'
                params.append(since.isoformat())
            
            query += ' ORDER BY timestamp ASC'
            
            if limit:
                query += f' LIMIT {limit}'
            
            cursor = self.conn.cursor()
            cursor.execute(query, params)
            
            snapshots = []
            for row in cursor.fetchall():
                snapshots.append({
                    'timestamp': datetime.fromisoformat(row['timestamp']),
                    'best_rate': row['best_rate'],
                    'avg_rate': row['avg_rate'],
                    'median_rate': row['median_rate'],
                    'listing_count': row['listing_count']
                })
            
            log.debug(f"Loaded {len(snapshots)} snapshots for {have}->{want}")
            return snapshots
        except Exception as e:
            log.error(f"Failed to load snapshots for {have}->{want}: {e}")
            return []
    
    def load_all_snapshots(self, retention_hours: int) -> Dict[Tuple[str, str, str], List[Dict]]:
        """Load all snapshots within retention period, grouped by pair."""
        try:
            cutoff = datetime.utcnow() - timedelta(hours=retention_hours)
            cursor = self.conn.cursor()
            cursor.execute('''
                SELECT league, have, want, timestamp, best_rate, avg_rate, median_rate, listing_count
                FROM price_snapshots
                WHERE timestamp > ?
                ORDER BY league, have, want, timestamp ASC
            ''', (cutoff.isoformat(),))
            
            snapshots_by_pair = {}
            for row in cursor.fetchall():
                key = (row['league'], row['have'], row['want'])
                if key not in snapshots_by_pair:
                    snapshots_by_pair[key] = []
                
                # Handle timestamp - it might be string or datetime
                ts = row['timestamp']
                if isinstance(ts, str):
                    ts = datetime.fromisoformat(ts)
                elif not isinstance(ts, datetime):
                    log.warning(f"Unexpected timestamp type: {type(ts)}")
                    continue
                
                snapshots_by_pair[key].append({
                    'timestamp': ts,
                    'best_rate': row['best_rate'],
                    'avg_rate': row['avg_rate'],
                    'median_rate': row['median_rate'],
                    'listing_count': row['listing_count']
                })
            
            total = sum(len(v) for v in snapshots_by_pair.values())
            log.info(f"Loaded {total} snapshots across {len(snapshots_by_pair)} pairs from database")
            return snapshots_by_pair
        except Exception as e:
            log.error(f"Failed to load all snapshots: {e}")
            return {}
    
    def cleanup_old_snapshots(self, retention_hours: int) -> int:
        """Remove snapshots older than retention period. Returns number deleted."""
        try:
            cutoff = datetime.utcnow() - timedelta(hours=retention_hours)
            with self._transaction() as cursor:
                cursor.execute('''
                    DELETE FROM price_snapshots
                    WHERE timestamp <= ?
                ''', (cutoff.isoformat(),))
                deleted = cursor.rowcount
            
            if deleted > 0:
                log.info(f"Cleaned up {deleted} old snapshots (older than {retention_hours}h)")
            return deleted
        except Exception as e:
            log.error(f"Failed to cleanup old snapshots: {e}")
            return 0
    
    def get_database_stats(self) -> Dict[str, Any]:
        """Get statistics about the database."""
        try:
            cursor = self.conn.cursor()
            
            # Cache entries count
            cursor.execute('SELECT COUNT(*) as count FROM cache_entries')
            cache_count = cursor.fetchone()['count']
            
            # Snapshots count
            cursor.execute('SELECT COUNT(*) as count FROM price_snapshots')
            snapshot_count = cursor.fetchone()['count']

            # Portfolio snapshots count
            cursor.execute('SELECT COUNT(*) as count FROM portfolio_snapshots')
            portfolio_count = cursor.fetchone()['count']
            
            # Oldest and newest snapshots
            cursor.execute('SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM price_snapshots')
            row = cursor.fetchone()
            oldest_snapshot = row['oldest'] if row['oldest'] else None
            newest_snapshot = row['newest'] if row['newest'] else None

            # Newest portfolio snapshot
            cursor.execute('SELECT MAX(timestamp) as newest FROM portfolio_snapshots')
            newest_portfolio_snapshot = cursor.fetchone()['newest']
            
            # Oldest cache entry
            cursor.execute('SELECT MIN(expires_at) as oldest FROM cache_entries')
            oldest_cache = cursor.fetchone()['oldest']
            
            # Database file size
            file_size = self.db_path.stat().st_size if self.db_path.exists() else 0
            
            return {
                'database_file': str(self.db_path),
                'database_size_bytes': file_size,
                'cache_entries': cache_count,
                'price_snapshots': snapshot_count,
                'portfolio_snapshots': portfolio_count,
                'oldest_cache_entry': oldest_cache,
                'oldest_snapshot': oldest_snapshot,
                'newest_snapshot': newest_snapshot,
                'newest_portfolio_snapshot': newest_portfolio_snapshot,
            }
        except Exception as e:
            log.error(f"Failed to get database stats: {e}")
            return {
                'database_file': str(self.db_path),
                'database_size_bytes': 0,
                'cache_entries': 0,
                'price_snapshots': 0,
                'portfolio_snapshots': 0,
                'oldest_cache_entry': None,
                'oldest_snapshot': None,
                'newest_snapshot': None,
                'newest_portfolio_snapshot': None,
            }
    
    def close(self):
        """Close the database connection."""
        if self.conn:
            self.conn.close()
            log.info("Database connection closed")

    # ============================================================================
    # Portfolio Snapshot Operations
    # ============================================================================

    def save_portfolio_snapshot(self, league: str, timestamp: datetime, total_divines: float, breakdown: List[Dict[str, Any]]) -> bool:
        """Persist a portfolio snapshot with total value and breakdown list, per league."""
        try:
            payload = json.dumps(breakdown)
            with self._transaction() as cursor:
                cursor.execute('''
                    INSERT INTO portfolio_snapshots (league, timestamp, total_divines, breakdown_json)
                    VALUES (?, ?, ?, ?)
                ''', (league, timestamp.isoformat(), total_divines, payload))
            log.debug(f"Saved portfolio snapshot for league={league} total={total_divines:.3f} @ {timestamp.isoformat()}")
            return True
        except Exception as e:
            log.error(f"Failed to save portfolio snapshot: {e}")
            return False

    def load_portfolio_history(self, league: str, limit: Optional[int] = None, hours: Optional[float] = None) -> List[Dict[str, Any]]:
        """Return chronological portfolio snapshots (oldest -> newest) for a league.
        Args:
            league: League to filter by
            limit: Maximum number of snapshots to return (most recent N)
            hours: Only return snapshots from the last N hours
        """
        try:
            # Build query with optional time filter
            where_clauses = ["league = ?"]
            params = [league]
            if hours is not None:
                cutoff = datetime.utcnow() - timedelta(hours=hours)
                where_clauses.append("timestamp >= ?")
                params.append(cutoff.isoformat())
            where_clause = "WHERE " + " AND ".join(where_clauses)
            if limit:
                query = f'SELECT timestamp, total_divines, breakdown_json FROM portfolio_snapshots {where_clause} ORDER BY timestamp DESC LIMIT {int(limit)}'
            else:
                query = f'SELECT timestamp, total_divines, breakdown_json FROM portfolio_snapshots {where_clause} ORDER BY timestamp ASC'
            cursor = self.conn.cursor()
            cursor.execute(query, params)
            rows = []
            for r in cursor.fetchall():
                try:
                    ts = r['timestamp']
                    if isinstance(ts, str):
                        ts_dt = datetime.fromisoformat(ts)
                    else:
                        ts_dt = ts
                    breakdown = json.loads(r['breakdown_json'])
                    rows.append({
                        'timestamp': ts_dt.isoformat(),
                        'total_divines': r['total_divines'],
                        'breakdown': breakdown,
                    })
                except Exception as e:
                    log.warning(f"Skipping invalid portfolio snapshot row: {e}")
                    continue
            if limit:
                rows.reverse()
            return rows
        except Exception as e:
            log.error(f"Failed to load portfolio history: {e}")
            return []


# Global persistence instance
def _resolve_db_path() -> str:
    # Allow overriding database location via environment variable (e.g. for container volume mounts)
    return os.getenv("DB_PATH", "poe_cache.db")


db = DatabasePersistence(_resolve_db_path())
