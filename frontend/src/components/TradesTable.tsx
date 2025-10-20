import { useState, useEffect } from 'react'
import '../spinner.css'
import { PairSummary } from '../types'
import { CurrencyIcon } from './CurrencyIcon'

// Format number: show up to 2 decimals only if not a whole number
function formatRate(num: number): string {
    return num % 1 === 0 ? num.toString() : num.toFixed(2)
}

function CollapsiblePair({ pair, defaultExpanded, loading }: { pair: PairSummary; defaultExpanded: boolean; loading: boolean }) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded)

    useEffect(() => {
        setIsExpanded(defaultExpanded)
    }, [defaultExpanded])

    const avgRate = pair.listings.length > 0
        ? pair.listings.reduce((sum, l) => sum + l.rate, 0) / pair.listings.length
        : null

    const totalStock = pair.listings.reduce((sum, l) => sum + (l.stock || 0), 0)

    return (
        <div className="pair-card">
            <div 
                className="pair-header collapsible" 
                onClick={() => setIsExpanded(!isExpanded)}
                style={{ cursor: 'pointer' }}
            >
                <div className="pair-info">
                    <span className="pair-index">#{pair.index}</span>
                    <span className="pair-badge">
                        <CurrencyIcon currency={pair.pay} size={20} />
                        <span style={{ margin: '0 8px', color: 'var(--muted)' }}>→</span>
                        <CurrencyIcon currency={pair.get} size={20} />
                    </span>

                    {/* Collapsed Summary */}
                    {!isExpanded && (
                        <div className="collapsed-summary">
                            {loading && pair.listings.length === 0 ? (
                                <>
                                    <span className="row-spinner"><span className="spinner small"></span></span>
                                    <span className="blurred-line" style={{width: 40}}></span>
                                    <span className="blurred-line" style={{width: 30}}></span>
                                    <span className="blurred-line" style={{width: 24}}></span>
                                </>
                            ) : <>
                                {pair.best_rate && (
                                    <span className="summary-item">
                                        <span className="summary-label">Best:</span>
                                        <span className="summary-value">{formatRate(pair.best_rate)}</span>
                                    </span>
                                )}
                                {avgRate && (
                                    <span className="summary-item">
                                        <span className="summary-label">Avg:</span>
                                        <span className="summary-value">{formatRate(avgRate)}</span>
                                    </span>
                                )}
                                <span className="summary-item">
                                    <span className="summary-label">Listings:</span>
                                    <span className="summary-value">{pair.listings.length}</span>
                                </span>
                                {totalStock > 0 && (
                                    <span className="summary-item">
                                        <span className="summary-label">Stock:</span>
                                        <span className="summary-value">{totalStock}</span>
                                    </span>
                                )}
                            </>}
                        </div>
                    )}
                </div>
                
                <div className="pair-controls">
                    <div className="pair-status">
                        {pair.status === 'ok' ? (
                            <span className="status-badge ok">✓ Online</span>
                        ) : pair.status === 'loading' ? (
                            <span className="status-badge loading">Loading...</span>
                        ) : (
                            <span className="status-badge error">{pair.status}</span>
                        )}
                    </div>
                    <button className="collapse-btn" onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded) }}>
                        {isExpanded ? '▼' : '▶'}
                    </button>
                </div>
            </div>

            {isExpanded && (
                <>
                    {loading && pair.listings.length === 0 ? (
                        <div className="listings-section">
                            <div className="listings-header">Loading…</div>
                            <div className="listings-list">
                                <div className="listing-card compact">
                                    <span className="row-spinner"><span className="spinner small"></span></span>
                                    <span className="blurred-line" style={{width: 50}}></span>
                                    <span className="blurred-line" style={{width: 40}}></span>
                                    <span className="blurred-line" style={{width: 60}}></span>
                                    <span className="blurred-line" style={{width: 80}}></span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {pair.best_rate && (
                                <div className="best-rate">
                                    <div>
                                        <span className="label">Best Rate:</span>
                                        <span className="value">{formatRate(pair.best_rate)}</span>
                                    </div>
                                    {avgRate && (
                                        <div>
                                            <span className="label">Average:</span>
                                            <span className="value">{formatRate(avgRate)}</span>
                                        </div>
                                    )}
                                    {totalStock > 0 && (
                                        <div>
                                            <span className="label">Total Stock:</span>
                                            <span className="value">{totalStock}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="listings-section">
                                <div className="listings-header">
                                    {pair.listings.length} Listing{pair.listings.length !== 1 ? 's' : ''}
                                </div>
                                <div className="listings-list">
                                    {pair.listings.map((l, i) => (
                                        <div key={i} className="listing-card compact">
                                            <span className="listing-rank">#{i + 1}</span>
                                            <span className="rate-value">{formatRate(l.rate)}</span>
                                            <span className="rate-currencies">
                                                <CurrencyIcon currency={l.have_currency} size={14} />
                                                <span>/</span>
                                                <CurrencyIcon currency={l.want_currency} size={14} />
                                            </span>
                                            <span className="listing-info">
                                                <span className="meta-label">Stock:</span>
                                                <span className="meta-value">{l.stock ?? '∞'}</span>
                                            </span>
                                            <span className="listing-info">
                                                <span className="meta-label">Seller:</span>
                                                <span className="meta-value">{l.seller ?? 'Unknown'}</span>
                                            </span>
                                            {l.indexed && (
                                                <span className="listing-time">
                                                    {new Date(l.indexed).toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    )
}

export function TradesTable({ data, loading }: { data: PairSummary[]; loading: boolean }) {
    const [allExpanded, setAllExpanded] = useState(false)

    // Find the index currently loading (first with empty listings)
    const loadingIndex = loading ? data.findIndex(p => p.listings.length === 0) : -1

    return (
        <div className="trades-container">
            <div className="section-header">
                <h2>Market Listings</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button 
                        className="btn ghost" 
                        onClick={() => setAllExpanded(!allExpanded)}
                        style={{ padding: '6px 12px', fontSize: '13px' }}
                    >
                        {allExpanded ? 'Collapse All' : 'Expand All'}
                    </button>
                </div>
            </div>

            <div className="pairs-grid">
                {data.map((p, i) => (
                    <CollapsiblePair key={p.index} pair={p} defaultExpanded={allExpanded} loading={loading && i === loadingIndex} />
                ))}
            </div>
        </div>
    )
}
