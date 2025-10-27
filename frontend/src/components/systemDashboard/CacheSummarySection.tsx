import React from 'react';
import type { CacheSummary } from '../../types';
import { Stat } from '../dashboard/Stat';

export const CacheSummarySection: React.FC<{ cacheSummary: CacheSummary | null }> = ({ cacheSummary }) => (
  <section className="dashboard-section">
    <h3>Cache Summary</h3>
    {!cacheSummary ? <div>Loading summary…</div> : (
      <div className="cache-summary-grid">
        <Stat label="TTL (s)" value={cacheSummary.trade_cache.ttl_seconds} />
        <Stat label="Cache Entries" value={cacheSummary.trade_cache.entries} />
        <Stat label="Pairs Tracked" value={cacheSummary.historical.pairs_tracked} />
        <Stat label="Snapshots" value={cacheSummary.historical.total_snapshots} />
        <Stat label="Retention (h)" value={cacheSummary.historical.retention_hours} />
        <Stat label="Max/Pair" value={cacheSummary.historical.max_points_per_pair} />
      </div>
    )}
    {cacheSummary?.trade_cache.soonest_expiry && (
      <div className="cache-summary-expiry">
        Soonest expiry: {new Date(cacheSummary.trade_cache.soonest_expiry).toLocaleTimeString()}
      </div>
    )}
  </section>
);
