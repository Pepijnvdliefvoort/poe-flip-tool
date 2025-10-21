import { useState, useEffect, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import '../spinner.css'
import { PairSummary } from '../types'

// Tiny sparkline component using SVG with optional baseline alignment
interface SparklineProps {
    values: number[]
    width?: number
    height?: number
    stroke?: string
    relativeFirst?: boolean
    globalMaxAbsDelta?: number // treated as max absolute percent change for baseline-centering across all series
    showMinMax?: boolean
    visualCapPct?: number // clamp global scaling to at most this percent for visibility (e.g. 50)
    adaptive?: boolean // if true, use per-series max instead of global for finer detail (still centered)
}
const Sparkline = memo(function Sparkline({ values, width = 70, height = 24, stroke = 'var(--accent)', relativeFirst = false, globalMaxAbsDelta, showMinMax = true, visualCapPct = 50, adaptive = true }: SparklineProps) {
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
        // Percent-based deltas relative to base.
        const deltasPct = values.map(v => base !== 0 ? ((v - base) / base) * 100 : 0)
        const seriesMaxAbsPct = Math.max(...deltasPct.map(Math.abs)) || 0
        // Determine scaling denominator: adaptive per-series or global, then clamp by visualCapPct.
        let denom = adaptive ? seriesMaxAbsPct : globalMaxAbsDelta
        if (visualCapPct > 0) {
            denom = Math.min(denom, visualCapPct)
        }
        // If denom is extremely small, enlarge so tiny movements still show: enforce a minimum visual range of 2%.
        if (denom < 2) denom = 2
        d = deltasPct.map((dp, i) => {
            const x = i * stepX
            const y = (height / 2) - (dp / denom) * (height / 2)
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
            const dp = base !== 0 ? ((v - base) / base) * 100 : 0
            const seriesMaxAbsPct = Math.max(...values.map(val => base !== 0 ? Math.abs(((val - base) / base) * 100) : 0)) || 0
            let denom = adaptive ? seriesMaxAbsPct : globalMaxAbsDelta
            if (visualCapPct > 0) denom = Math.min(denom, visualCapPct)
            if (denom < 2) denom = 2
            const y = (height / 2) - (dp / denom) * (height / 2)
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

function CollapsiblePair({ pair, defaultExpanded, loading, onReload, globalMaxAbsDelta, accountName, selectedMetrics }: { pair: PairSummary; defaultExpanded: boolean; loading: boolean; onReload: (index: number) => void; globalMaxAbsDelta: number; accountName?: string | null; selectedMetrics: string[] }) {
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

    // Metric calculations for relevant metrics
    const rates = pair.listings.map(l => l.rate)
    const medianRate = (() => {
        if (!rates.length) return null
        const sorted = [...rates].sort((a,b)=>a-b)
        const mid = Math.floor(sorted.length/2)
        return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2
    })()
    const spreadPct = (() => {
        if (rates.length < 2) return null
        const min = Math.min(...rates)
        const max = Math.max(...rates)
        return min !== 0 ? ((max - min) / min) * 100 : null
    })()

    // Metric render map (only relevant metrics for stable/permanent leagues)
    const metricRenderers: Record<string, { label: string; value: JSX.Element | null; tooltip: string }> = {
        spread: {
            label: 'Spread',
            value: spreadPct !== null ? <span className="summary-value">{spreadPct.toFixed(1)}%</span> : null,
            tooltip: 'Spread: (highest rate - lowest rate) / lowest rate. Indicates dispersion; higher spread may mean opportunity.'
        },
        median: {
            label: 'Median',
            value: medianRate !== null ? <span className="summary-value">{formatRate(medianRate, pair.pay, pair.get)}</span> : null,
            tooltip: 'Median: Middle value of sorted listing rates. More robust than average against outliers.'
        }
    }

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
                                        <Sparkline values={pair.trend.sparkline} width={70} relativeFirst={true} globalMaxAbsDelta={globalMaxAbsDelta} adaptive={true} visualCapPct={40} />
                                        <span style={{ fontSize: '11px', minWidth: 10, textAlign: 'right', color: pair.trend.direction === 'up' ? '#ef4444' : pair.trend.direction === 'down' ? '#10b981' : '#6b7280', whiteSpace: 'nowrap' }}>
                                            {pair.trend.change_percent > 0 ? '+' : ''}{pair.trend.change_percent.toFixed(1)}%
                                        </span>
                                    </>
                                ) : null}
                            </span>
                            {/* Selected metrics (max 2) - always 2 equal columns */}
                            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 240, border: 'none', height: 20 }}>
                                <tbody>
                                    <tr>
                                        {Array.from({ length: 2 }).map((_, idx) => {
                                            const key = selectedMetrics[idx]
                                            if (!key) return <td key={idx} style={{ width: 120, border: 'none', height: 20, padding: 0 }}></td>
                                            const def = metricRenderers[key]
                                            if (!def || !def.value) return <td key={idx} style={{ width: 120, border: 'none', height: 20, padding: 0 }}></td>
                                            return (
                                                <td key={idx} style={{ width: 120, border: 'none', height: 20, padding: 0 }} title={def.tooltip}>
                                                    <span className="summary-item" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                                                        <span className="summary-label">{def.label}:</span>
                                                        {def.value}
                                                    </span>
                                                </td>
                                            )
                                        })}
                                    </tr>
                                </tbody>
                            </table>
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
    const METRIC_KEYS = ['spread','median'] as const
    type MetricKey = typeof METRIC_KEYS[number]
    const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(() => {
        try {
            const raw = localStorage.getItem('selectedMetrics')
            if (raw) {
                const arr = JSON.parse(raw)
                if (Array.isArray(arr)) {
                    return arr.filter(k => METRIC_KEYS.includes(k)) as MetricKey[]
                }
            }
        } catch {}
        return []
    })
    useEffect(() => {
        localStorage.setItem('selectedMetrics', JSON.stringify(selectedMetrics))
    }, [selectedMetrics])
    const toggleMetric = (key: MetricKey) => {
        setSelectedMetrics(prev => {
            const has = prev.includes(key)
            if (has) return prev.filter(k => k !== key)
            if (prev.length >= 2) return prev // enforce max 2
            const updated = [...prev, key]
            if (updated.length === 2) {
                // Auto close when hitting max selection for quicker UX
                setTimeout(() => setMetricsOpen(false), 0)
            }
            return updated
        })
    }
    const metricsButtonRef = useRef<HTMLButtonElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const [metricsOpen, setMetricsOpen] = useState(false)
    const [menuPos, setMenuPos] = useState<{top:number;left:number}>({top:0,left:0})
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const btn = metricsButtonRef.current
            const menuEl = menuRef.current
            if (!btn) return
            if (btn.contains(e.target as Node)) return
            if (menuEl && menuEl.contains(e.target as Node)) return
            setMetricsOpen(false)
        }
        if (metricsOpen) {
            // compute position
            const rect = metricsButtonRef.current?.getBoundingClientRect()
            if (rect) {
                setMenuPos({ top: rect.bottom + 6, left: rect.left })
            }
            document.addEventListener('mousedown', handler)
            window.addEventListener('resize', () => setMetricsOpen(false), { once: true })
            window.addEventListener('scroll', () => setMetricsOpen(false), { once: true })
        }
        return () => { document.removeEventListener('mousedown', handler) }
    }, [metricsOpen])

    // Compute global max absolute delta for baseline-aligned sparklines
    const globalMaxAbsDelta = (() => {
        // Find maximum absolute percent change relative to first point among all sparklines
        let maxAbsPct = 0
        for (const p of data) {
            const s = p.trend?.sparkline
            if (s && s.length > 1) {
                const base = s[0]
                if (base === 0) continue
                for (const v of s) {
                    const pct = Math.abs(((v - base) / base) * 100)
                    if (pct > maxAbsPct) maxAbsPct = pct
                }
            }
        }
        return maxAbsPct || 0
    })()

    // Find the index currently loading (first with empty listings)
    const loadingIndex = loading ? data.findIndex(p => p.listings.length === 0) : -1

    return (
        <>
            <div className="trades-container">
                <div className="section-header">
                    <h2>Market Listings</h2>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                            ref={metricsButtonRef}
                            className="btn ghost"
                            style={{ padding: '6px 10px', fontSize: '13px', display:'inline-flex', alignItems:'center', gap:5 }}
                            onClick={() => setMetricsOpen(o => !o)}
                            title="Select up to 2 metrics to display"
                        >
                            <span style={{fontSize:14}}>⚙</span>
                            <span>Metrics{selectedMetrics.length ? ` (${selectedMetrics.length})` : ''}</span>
                        </button>
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
                            selectedMetrics={selectedMetrics}
                        />
                    ))}
                </div>
            </div>
            {metricsOpen && createPortal(
                <div ref={menuRef} style={{ position:'fixed', top:menuPos.top, left:menuPos.left, background:'#1f2937', border:'1px solid #374151', borderRadius:8, padding:'10px 12px 8px', zIndex: 9999, width:180, boxShadow:'0 8px 24px rgba(0,0,0,0.3)' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                        <div style={{ fontSize: 12, color: '#9ca3af', fontWeight:500 }}>Select metrics (max 2)</div>
                        <button onClick={() => setMetricsOpen(false)} style={{ background:'none', border:'none', color:'#9ca3af', cursor:'pointer', fontSize:13, padding:0, lineHeight:1 }}>✕</button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr', columnGap:8, rowGap:3, marginBottom:6 }}>
                        {METRIC_KEYS.map(k => {
                            const checked = selectedMetrics.includes(k)
                            const disabled = !checked && selectedMetrics.length >= 2
                            const labels: Record<MetricKey,string> = { spread:'Spread', median:'Median' }
                            const tooltips: Record<MetricKey,string> = {
                                spread: 'Dispersion between highest and lowest rate',
                                median: 'Middle rate (robust to outliers)'
                            }
                            return (
                                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer', background: checked ? 'rgba(59,130,246,0.12)' : 'transparent', padding: '4px 6px', borderRadius:4, transition:'background 0.15s ease' }} title={tooltips[k]}>
                                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleMetric(k)} style={{ cursor: disabled ? 'not-allowed' : 'pointer', margin:0, width:14, height:14, flexShrink:0 }} />
                                    <span style={{ lineHeight:1 }}>{labels[k]}</span>
                                </label>
                            )
                        })}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <button onClick={() => setSelectedMetrics([])} style={{ background:'none', border:'none', color:'#60a5fa', fontSize:11, cursor:'pointer', padding:0, fontWeight:500 }}>Clear all</button>
                        {selectedMetrics.length >= 2 && <div style={{ fontSize: 11, color:'#fbbf24', fontWeight:500 }}>Max 2 selected</div>}
                    </div>
                </div>, document.body)}
        </>
    )
}
