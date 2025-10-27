import React from 'react';
import { Stat } from '../dashboard/Stat';
import { formatBytes } from '../../utils/formatBytes';
import type { DatabaseStats } from '../../types';

export const DatabaseStatsSection: React.FC<{ dbStats: DatabaseStats | null }> = ({ dbStats }) => (
  <section className="dashboard-section">
    <h3>Database Persistence</h3>
    {!dbStats ? <div>Loading database stats…</div> : (
      <div>
        <div className="db-stats-grid">
          <Stat label="DB Size" value={formatBytes(dbStats.database_size_bytes)} />
          <Stat label="Cache Entries" value={dbStats.cache_entries} />
          <Stat label="Price Snapshots" value={dbStats.price_snapshots} />
        </div>
        <div className="db-stats-meta">
          <div><strong>File:</strong> {dbStats.database_file}</div>
          {dbStats.oldest_snapshot && <div><strong>Oldest:</strong> {new Date(dbStats.oldest_snapshot).toLocaleString()}</div>}
          {dbStats.newest_snapshot && <div><strong>Newest:</strong> {new Date(dbStats.newest_snapshot).toLocaleString()}</div>}
        </div>
      </div>
    )}
  </section>
);
