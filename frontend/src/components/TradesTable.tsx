import { PairSummary } from '../types'

export function TradesTable({ data, loading }: { data: PairSummary[]; loading: boolean }) {
    return (
        <div className="trades-container">
            <div className="section-header">
                <h2>Market Listings</h2>
                {loading && <span className="pill loading-pill">Loading…</span>}
            </div>

            <div className="pairs-grid">
                {data.map((p) => (
                    <div key={p.index} className="pair-card">
                        <div className="pair-header">
                            <div className="pair-info">
                                <span className="pair-index">#{p.index}</span>
                                <span className="pair-badge">{p.pay} → {p.get}</span>
                            </div>
                            <div className="pair-status">
                                {p.status === 'ok' ? (
                                    <span className="status-badge ok">✓ Online</span>
                                ) : (
                                    <span className="status-badge error">{p.status}</span>
                                )}
                            </div>
                        </div>

                        {p.best_rate && (
                            <div className="best-rate">
                                <span className="label">Best Rate:</span>
                                <span className="value">{p.best_rate}</span>
                            </div>
                        )}

                        <div className="listings-section">
                            <div className="listings-header">
                                Top {p.listings.length} Listing{p.listings.length !== 1 ? 's' : ''}
                            </div>
                            <div className="listings-list">
                                {p.listings.map((l, i) => (
                                    <div key={i} className="listing-card">
                                        <div className="listing-rank">#{i + 1}</div>
                                        <div className="listing-details">
                                            <div className="listing-rate">
                                                <span className="rate-value">{l.rate}</span>
                                                <span className="rate-currencies">{l.have_currency}/{l.want_currency}</span>
                                            </div>
                                            <div className="listing-meta">
                                                <div className="meta-item">
                                                    <span className="meta-label">Stock:</span>
                                                    <span className="meta-value">{l.stock ?? '∞'}</span>
                                                </div>
                                                <div className="meta-item">
                                                    <span className="meta-label">Seller:</span>
                                                    <span className="meta-value">{l.seller ?? 'Unknown'}</span>
                                                </div>
                                            </div>
                                            {l.indexed && (
                                                <div className="listing-time">
                                                    {new Date(l.indexed).toLocaleString()}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
