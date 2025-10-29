
import React from 'react';
import type { HistoryResponse } from '../../types';

export const HistoryViewer: React.FC<{
  history: HistoryResponse | null;
  selectedPair: { have: string; want: string } | null;
  loading: boolean;
  pairs: { get: string; pay: string }[];
  setSelectedPair: (pair: { have: string; want: string }) => void;
}> = ({ history, selectedPair, loading, pairs, setSelectedPair }) => {
  if (!selectedPair) return null;
  return (
    <section className="dashboard-section">
      <div className="history-header">
        <h3 style={{ margin: 0 }}>History</h3>
        <select
          id="history-pair-select"
          name="historyPair"
          value={selectedPair ? `${selectedPair.have}|${selectedPair.want}` : ''}
          onChange={e => {
            const [have, want] = e.target.value.split('|');
            setSelectedPair({ have, want });
          }}
          className="history-select"
        >
          {pairs.map((p, i) => (
            <option key={i} value={`${p.pay}|${p.get}`}>{p.pay} → {p.get}</option>
          ))}
        </select>
        {loading && <span className="history-loading">Loading…</span>}
      </div>
      {!history ? (
        <div className="history-empty">Select a pair to view history.</div>
      ) : history.history.length === 0 ? (
        <div className="history-none">No snapshots yet.</div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div className="history-meta">
            {history.history.length} points | Change: {history.trend.change_percent > 0 ? '+' : ''}{history.trend.change_percent.toFixed(2)}% ({history.trend.direction})
          </div>
          {/* Chart can be added here if needed */}
          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Median</th>
                  <th>Avg</th>
                  <th>Listings</th>
                </tr>
              </thead>
              <tbody>
                {history.history.slice().reverse().map((h, i) => (
                  <tr key={i}>
                    <td>{new Date(h.timestamp).toLocaleTimeString()}</td>
                    <td>{h.median_rate.toFixed(4)}</td>
                    <td>{h.avg_rate.toFixed(4)}</td>
                    <td>{h.listing_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
