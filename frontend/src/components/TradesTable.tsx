import { useState, useEffect, useRef, memo } from 'react'
import '../spinner.css'
import { PairSummary } from '../types'

// Tiny sparkline component using SVG with optional baseline alignment
interface SparklineProps {
    values: number[]
    width?: number
    height?: number
    stroke?: string
    relativeFirst?: boolean
    globalMaxAbsDelta?: number
    showMinMax?: boolean
}
const Sparkline = memo(function Sparkline({ values, width = 70, height = 24, stroke = 'var(--accent)', relativeFirst = false, globalMaxAbsDelta, showMinMax = true }: SparklineProps) {
    if (!values || values.length < 2) return null

    // Stats
    const min = Math.min(...values)
    const max = Math.max(...values)
    const last = values[values.length - 1]
    const base = values[0]
    const changePct = base !== 0 ? ((last - base) / base) * 100 : 0

    const stepX = width / (values.length - 1)

    // Build path using relative mode (baseline mid)
    let d: string
    if (relativeFirst && globalMaxAbsDelta && globalMaxAbsDelta > 0) {
        const deltas = values.map(v => v - base)
        d = deltas.map((dv, i) => {
            const x = i * stepX
            const y = (height / 2) - (dv / globalMaxAbsDelta) * (height / 2)
            const cy = Math.min(height, Math.max(0, y))
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${cy.toFixed(2)}`
        }).join(' ')
    } else {
        const range = max - min || 1
        d = values.map((v, i) => {
            const x = i * stepX
            const y = height - ((v - min) / range) * height
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
        }).join(' ')
    }

    // Compute Y coordinates for markers
    const computeY = (v: number) => {
        if (relativeFirst && globalMaxAbsDelta && globalMaxAbsDelta > 0) {
            const dv = v - base
            const y = (height / 2) - (dv / globalMaxAbsDelta) * (height / 2)
            return Math.min(height, Math.max(0, y))
        } else {
            const range = max - min || 1
            return height - ((v - min) / range) * height
        }
    }
    const minIndex = values.indexOf(min)
    const maxIndex = values.indexOf(max)
    const lastIndex = values.length - 1

    const tooltip = `Min: ${min.toFixed(4)}\nMax: ${max.toFixed(4)}\nStart: ${base.toFixed(4)}\nLast: ${last.toFixed(4)}\nChange: ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`

    return (
        <div
            style={{ position: 'relative', width, height }}
            title={tooltip}
        >
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
                {relativeFirst && globalMaxAbsDelta && globalMaxAbsDelta > 0 && (
                    <line
                        x1={0}
                        x2={width}
                        y1={height / 2}
                        y2={height / 2}
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth={1}
                        strokeDasharray="2 2"
                    />
                )}
                <path
                    d={d}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                />
                {showMinMax && (
                    <>
                        <circle cx={minIndex * stepX} cy={computeY(min)} r={1.8} fill="#10b981" />
                        <circle cx={maxIndex * stepX} cy={computeY(max)} r={1.8} fill="#ef4444" />
                    </>
                )}
                {/* Last point highlight */}
                <circle cx={lastIndex * stepX} cy={computeY(last)} r={2} fill="var(--accent)" stroke="#111827" strokeWidth={1} />
            </svg>
        </div>
    )
})
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

function CollapsiblePair({ pair, defaultExpanded, loading, onReload, globalMaxAbsDelta, accountName }: { pair: PairSummary; defaultExpanded: boolean; loading: boolean; onReload: (index: number) => void; globalMaxAbsDelta: number; accountName?: string | null }) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded)
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
    const timeoutRef = useRef<number | null>(null)

    useEffect(() => {
        setIsExpanded(defaultExpanded)
    }, [defaultExpanded])
    
    const copyWhisper = (whisper: string, index: number) => {
        // Clear any existing timeout
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current)
        }
        
        navigator.clipboard.writeText(whisper)
        setCopiedIndex(index)
        
        // Set new timeout
        timeoutRef.current = window.setTimeout(() => {
            setCopiedIndex(null)
            timeoutRef.current = null
        }, 1250)
    }

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current)
            }
        }
    }, [])

    const avgRate = pair.listings.length > 0
        ? pair.listings.reduce((sum, l) => sum + l.rate, 0) / pair.listings.length
        : null

    const totalStock = pair.listings.reduce((sum, l) => sum + (l.stock || 0), 0)

    // Rate limited status (removed countdown as rate_limit_remaining field was unused)
    const isRateLimited = pair.status === 'rate_limited'


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
                    <div className="collapsed-summary" style={{ display: 'grid', gridAutoFlow: 'column', alignItems: 'center', gap: 4 }}>
                        {loading && pair.listings.length === 0 ? (
                            <>
                                <span className="row-spinner"><span className="spinner small"></span></span>
                                <span className="blurred-line" style={{ width: 40 }}></span>
                                <span className="blurred-line" style={{ width: 30 }}></span>
                                <span className="blurred-line" style={{ width: 24 }}></span>
                            </>
                        ) : <>
                            {/* Fixed-width columns to align sparkline start across rows */}
                            <span className="summary-item" style={{ width: 120, display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                                {pair.best_rate ? (
                                    <>
                                        <span className="summary-label" style={{ fontWeight: 600 }}>Best:</span>
                                        <span className="summary-value" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '15px' }}>{formatRate(pair.best_rate, pair.pay, pair.get)}</span>
                                    </>
                                ) : null}
                            </span>
                            <span className="summary-item" style={{ width: 140, display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-start' }}>
                                {pair.trend && pair.trend.sparkline && pair.trend.sparkline.length >= 2 ? (
                                    <>
                                        <Sparkline values={pair.trend.sparkline} width={70} relativeFirst={true} globalMaxAbsDelta={globalMaxAbsDelta} />
                                        <span style={{ fontSize: '11px', minWidth: 10, textAlign: 'right', color: pair.trend.direction === 'up' ? '#ef4444' : pair.trend.direction === 'down' ? '#10b981' : '#6b7280', whiteSpace: 'nowrap' }}>
                                            {pair.trend.change_percent > 0 ? '+' : ''}{pair.trend.change_percent.toFixed(1)}%
                                        </span>
                                    </>
                                ) : null}
                            </span>
                            <span className="summary-item" style={{ width: 90, display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                                {avgRate ? (
                                    <>
                                        <span className="summary-label">Avg:</span>
                                        <span className="summary-value">{formatRate(avgRate, pair.pay, pair.get)}</span>
                                    </>
                                ) : null}
                            </span>
                            <span className="summary-item" style={{ width: 95, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                <span className="summary-label">Listings:</span>
                                <span className="summary-value">{pair.listings.length}</span>
                            </span>
                            <span className="summary-item" style={{ width: 80, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                {totalStock > 0 ? (
                                    <>
                                        <span className="summary-label">Stock:</span>
                                        <span className="summary-value">{totalStock}</span>
                                    </>
                                ) : null}
                            </span>
                        </>}
                    </div>
                </div>

                <div className="pair-controls">
                    <div className="pair-status">
                        {pair.status === 'ok' && <span className="status-badge ok">✓ Online</span>}
                        {pair.status === 'loading' && <span className="status-badge loading">Loading...</span>}
                        {pair.status === 'error' && <span className="status-badge error">Error</span>}
                        {pair.status === 'invalid' && <span className="status-badge error">Invalid</span>}
                        {pair.status === 'rate_limited' && <span className="status-badge blocked">Rate Limited</span>}
                        {pair.fetched_at && (
                            <span style={{ fontSize: '11px', opacity: 0.5, marginLeft: 8 }}>
                                {new Date(pair.fetched_at).toLocaleTimeString()}
                            </span>
                        )}
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
                            <div className="listings-header">Temporarily rate limited – listings unavailable.</div>
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
                                    {pair.listings.map((l, i) => {
                                        // Support multiple names from runtime config (comma-separated). Fallback to env only if prop not provided.
                                        const sourceNames = accountName && accountName.length > 0 ? accountName : (import.meta.env.VITE_ACCOUNT_NAME || '')
                                        const rawNames: string[] = sourceNames
                                            .split(',')
                                            .map((s: string) => s.trim())
                                            .filter((val: string) => !!val)
                                        // Normalize: remove optional #discriminator suffix (e.g., Name#1234) for comparison
                                        const normalize = (name?: string | null) => (name || '').replace(/#\d{3,5}$/,'').toLowerCase()
                                        const normalizedListing = normalize(l.account_name)
                                        const isMyTrade = rawNames.some((envName: string) => {
                                            const nEnv: string = normalize(envName)
                                            return nEnv && nEnv === normalizedListing
                                        })
                                        return (
                                        <div 
                                            key={i} 
                                            className="listing-card compact"
                                            style={{
                                                background: isMyTrade ? 'rgba(59, 130, 246, 0.12)' : undefined,
                                                border: isMyTrade ? '1px solid rgba(59, 130, 246, 0.35)' : undefined,
                                                boxShadow: isMyTrade ? '0 0 8px rgba(59, 130, 246, 0.2)' : undefined
                                            }}
                                        >
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
                                            <span className="listing-info" style={{ width: '180px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span className="meta-label">Account:</span>
                                                <span className="meta-value" style={{ fontWeight: isMyTrade ? 600 : undefined }}>{l.account_name || 'Unknown'}</span>
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
                                                        background: copiedIndex === i ? 'rgba(16, 185, 129, 0.3)' : 'rgba(100, 100, 100, 0.1)',
                                                        color: copiedIndex === i ? 'rgba(255, 255, 255, 0.5)' : 'rgba(156, 163, 175, 0.7)',
                                                        border: '1px solid',
                                                        borderColor: copiedIndex === i ? 'rgba(16, 185, 129, 0.9)' : 'rgba(156, 163, 175, 0.3)',
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
                                    )})}
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

export function TradesTable({ data, loading, onReload, onRefresh, accountName }: { data: PairSummary[]; loading: boolean; onReload: (index: number) => void; onRefresh?: () => void; accountName?: string | null }) {
    const [allExpanded, setAllExpanded] = useState(false)

    // Compute global max absolute delta for baseline-aligned sparklines
    const globalMaxAbsDelta = (() => {
        let maxAbs = 0
        for (const p of data) {
            const s = p.trend?.sparkline
            if (s && s.length > 1) {
                const base = s[0]
                for (const v of s) {
                    const delta = Math.abs(v - base)
                    if (delta > maxAbs) maxAbs = delta
                }
            }
        }
        return maxAbs || 0
    })()

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
                    {onRefresh && (
                        <button
                            className={`btn ${loading ? 'ghost' : 'primary'}`}
                            onClick={() => onRefresh()}
                            disabled={loading}
                            style={{ padding: '6px 14px', fontSize: '13px' }}
                            title="Refresh all trades"
                        >
                            {loading ? 'Loading…' : 'Refresh'}
                        </button>
                    )}
                </div>
            </div>

            <div className="pairs-grid">
                {data.map((p, i) => (
                    <CollapsiblePair 
                        key={p.index} 
                        pair={p} 
                        defaultExpanded={allExpanded} 
                        loading={loading && i === loadingIndex} 
                        onReload={onReload} 
                        globalMaxAbsDelta={globalMaxAbsDelta}
                        accountName={accountName}
                    />
                ))}
            </div>
        </div>
    )
}
