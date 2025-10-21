import { useState, useEffect } from 'react'
import '../spinner.css'
import { PairSummary } from '../types'
import { CurrencyIcon } from './CurrencyIcon'

// Format rate: show as integer if whole, otherwise as fraction if < 0.01, else 2 decimals
function formatRate(num: number, have?: string, want?: string): string {
    if (num % 1 === 0) return num.toString();
    if (num > 0 && num < 1 && have && want) {
        // Try to show as 1/x with up to 2 decimals
        const denom = 1 / num;
        return `1/${denom.toFixed(2).replace(/\.?0+$/, '')}`;
    }
    return num.toFixed(2);
}

function CollapsiblePair({ pair, defaultExpanded, loading, onReload }: { pair: PairSummary; defaultExpanded: boolean; loading: boolean; onReload: (index: number) => void }) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded)
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

    useEffect(() => {
        setIsExpanded(defaultExpanded)
    }, [defaultExpanded])
    
    const copyWhisper = (whisper: string, index: number) => {
        navigator.clipboard.writeText(whisper)
        setCopiedIndex(index)
        setTimeout(() => setCopiedIndex(null), 1250) // Faster timeout
    }

    const avgRate = pair.listings.length > 0
        ? pair.listings.reduce((sum, l) => sum + l.rate, 0) / pair.listings.length
        : null

    const totalStock = pair.listings.reduce((sum, l) => sum + (l.stock || 0), 0)

    // Countdown for rate limit remaining (local decrement to give user feedback)
    const [remaining, setRemaining] = useState<number | null>(pair.rate_limit_remaining ?? null)
    useEffect(() => { setRemaining(pair.rate_limit_remaining ?? null) }, [pair.rate_limit_remaining])
    useEffect(() => {
        if (pair.status !== 'rate_limited' || remaining === null) return
        const id = setInterval(() => {
            setRemaining(r => (r === null ? null : Math.max(0, r - 1)))
        }, 1000)
        return () => clearInterval(id)
    }, [pair.status, remaining])

    return (
        <div style={{ position: 'relative', maxWidth: '100%', overflow: 'hidden' }}>
            <div 
                className="pair-card" 
                style={{
                    border: pair.hot ? '2px solid var(--warning)' : '1px solid var(--border)',
                    background: pair.hot ? 'rgba(245, 158, 11, 0.05)' : undefined,
                    width: '100%',
                    boxSizing: 'border-box'
                }}
            >
                <div
                    className="pair-header collapsible"
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="pair-info">
                        <span className="pair-badge">
                            <CurrencyIcon currency={pair.pay} size={20} />
                            <span style={{ margin: '0 8px', color: 'var(--muted)' }}>→</span>
                            <CurrencyIcon currency={pair.get} size={20} />
                        </span>

                    {/* Summary - always shown in header row */}
                    <div className="collapsed-summary">
                        {loading && pair.listings.length === 0 ? (
                            <>
                                <span className="row-spinner"><span className="spinner small"></span></span>
                                <span className="blurred-line" style={{ width: 40 }}></span>
                                <span className="blurred-line" style={{ width: 30 }}></span>
                                <span className="blurred-line" style={{ width: 24 }}></span>
                            </>
                        ) : <>
                            {pair.best_rate && (
                                <span className="summary-item">
                                    <span className="summary-label" style={{ fontWeight: 600 }}>Best:</span>
                                    <span className="summary-value" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '15px' }}>{formatRate(pair.best_rate, pair.pay, pair.get)}</span>
                                </span>
                            )}
                            {pair.trend && pair.trend.data_points >= 2 && (
                                <span className="summary-item" title={`${pair.trend.change_percent > 0 ? '+' : ''}${pair.trend.change_percent.toFixed(1)}% (${pair.trend.data_points} data points)`}>
                                    {pair.trend.direction === 'up' && <span style={{ color: '#ef4444', fontSize: '14px' }}>📈</span>}
                                    {pair.trend.direction === 'down' && <span style={{ color: '#10b981', fontSize: '14px' }}>📉</span>}
                                    {pair.trend.direction === 'neutral' && <span style={{ color: '#6b7280', fontSize: '14px' }}>➡️</span>}
                                </span>
                            )}
                            {avgRate && (
                                <span className="summary-item">
                                    <span className="summary-label">Avg:</span>
                                    <span className="summary-value">{formatRate(avgRate, pair.pay, pair.get)}</span>
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
                </div>

                <div className="pair-controls">
                    <div className="pair-status">
                        {pair.status === 'ok' && <span className="status-badge ok">✓ Online</span>}
                        {pair.status === 'loading' && <span className="status-badge loading">Loading...</span>}
                        {pair.status === 'error' && <span className="status-badge error">Error</span>}
                        {pair.status === 'invalid' && <span className="status-badge error">Invalid</span>}
                        {pair.status === 'rate_limited' && <span className="status-badge blocked">Rate Limited{remaining !== null ? ` (${remaining.toFixed(0)}s)` : ''}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button className="collapse-btn" onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded) }}>
                            {isExpanded ? '▼' : '▶'}
                        </button>
                        <button
                            className="collapse-btn"
                            disabled={pair.status === 'loading'}
                            onClick={(e) => { e.stopPropagation(); onReload(pair.index) }}
                            style={{ fontSize: '14px' }}
                            title="Refresh this trade"
                        >⟳</button>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <>
                    {pair.status === 'rate_limited' ? (
                        <div className="listings-section">
                            <div className="listings-header">Temporarily rate limited – listings unavailable.{remaining !== null ? ` Retry after ~${remaining.toFixed(0)}s.` : ''}</div>
                        </div>
                    ) : loading && pair.listings.length === 0 ? (
                        <div className="listings-section">
                            <div className="listings-header">Loading…</div>
                            <div className="listings-list">
                                <div className="listing-card compact">
                                    <span className="row-spinner"><span className="spinner small"></span></span>
                                    <span className="blurred-line" style={{ width: 50 }}></span>
                                    <span className="blurred-line" style={{ width: 40 }}></span>
                                    <span className="blurred-line" style={{ width: 60 }}></span>
                                    <span className="blurred-line" style={{ width: 80 }}></span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="listings-section">
                                <div className="listings-header">
                                    {pair.listings.length} Listing{pair.listings.length !== 1 ? 's' : ''}
                                </div>
                                <div className="listings-list">
                                    {pair.listings.map((l, i) => (
                                        <div key={i} className="listing-card compact">
                                            <span className="listing-rank" style={{ width: '40px', flexShrink: 0 }}>#{i + 1}</span>
                                            <span className="rate-value" style={{ color: 'var(--accent)', fontWeight: 500, width: '60px', flexShrink: 0 }}>{formatRate(l.rate, l.have_currency, l.want_currency)}</span>
                                            <span className="rate-currencies" style={{ width: '50px', flexShrink: 0 }}>
                                                <CurrencyIcon currency={l.have_currency} size={14} />
                                                <span>/</span>
                                                <CurrencyIcon currency={l.want_currency} size={14} />
                                            </span>
                                            <span className="listing-info" style={{ width: '80px', flexShrink: 0 }}>
                                                <span className="meta-label">Stock:</span>
                                                <span className="meta-value">{l.stock ?? '∞'}</span>
                                            </span>
                                            <span className="listing-info" style={{ width: '180px', flexShrink: 0 }}>
                                                <span className="meta-label">Account:</span>
                                                <span className="meta-value">{l.account_name || 'Unknown'}</span>
                                            </span>
                                            {l.whisper && (
                                                <span
                                                    className="whisper-message"
                                                    onClick={() => copyWhisper(l.whisper!, i)}
                                                    style={{
                                                        flex: '1 1 auto',
                                                        minWidth: 0,
                                                        padding: '4px 8px',
                                                        fontSize: '11px',
                                                        background: copiedIndex === i ? '#10b981' : 'rgba(100, 100, 100, 0.1)',
                                                        color: copiedIndex === i ? 'white' : 'rgba(156, 163, 175, 0.7)',
                                                        border: '1px solid',
                                                        borderColor: copiedIndex === i ? '#10b981' : 'rgba(156, 163, 175, 0.3)',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontFamily: 'monospace',
                                                        transition: 'all 0.3s ease-in-out',
                                                        userSelect: 'none',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        alignSelf: 'center',
                                                        textAlign: 'center'
                                                    }}
                                                    title={copiedIndex === i ? 'Copied!' : `Click to copy: ${l.whisper}`}
                                                >
                                                    {copiedIndex === i ? '✓ Copied!' : l.whisper}
                                                </span>
                                            )}
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
        </div>
    )
}

export function TradesTable({ data, loading, onReload }: { data: PairSummary[]; loading: boolean; onReload: (index: number) => void }) {
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
                    <CollapsiblePair key={p.index} pair={p} defaultExpanded={allExpanded} loading={loading && i === loadingIndex} onReload={onReload} />
                ))}
            </div>
        </div>
    )
}
