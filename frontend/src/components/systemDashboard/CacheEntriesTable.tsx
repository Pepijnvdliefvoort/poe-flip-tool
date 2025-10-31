import React from 'react';
import type { CacheSummary } from '../../types';

export const CacheEntriesTable: React.FC<{ cacheSummary: CacheSummary | null; setSelectedPair: (pair: { have: string; want: string }) => void }> = ({ cacheSummary, setSelectedPair }) => (
  <section className="dashboard-section">
    <h3>Cache Entries</h3>
    {!cacheSummary ? <div>Loading entries…</div> : cacheSummary.trade_cache.entries_detail.length === 0 ? (
      <div className="cache-entries-empty">No cached entries yet.</div>
    ) : (
      <div className="cache-entries-table-container">
        <table className="cache-entries-table">
          <thead>
            <tr>
              <th>Have</th>
              <th>Want</th>
              <th>Listings</th>
              <th>Remaining (s)</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {cacheSummary.trade_cache.entries_detail.map(entry => (
              <tr key={entry.have + '_' + entry.want} style={{ cursor: 'pointer' }} onClick={() => setSelectedPair({ have: entry.have, want: entry.want })}>
                <td>{entry.have}</td>
                <td>{entry.want}</td>
                <td>{entry.listing_count}</td>
                <td className={entry.seconds_remaining < 60 ? 'low-remaining' : 'normal-remaining'}>{entry.seconds_remaining}</td>
                <td>{new Date(entry.expires_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);
