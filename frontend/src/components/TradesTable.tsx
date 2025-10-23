import { useState, useEffect, useRef, memo } from 'react'
import '../spinner.css'
import { PairSummary } from '../types'
import { Api } from '../api'
// (Reverted) Removed cache watch specific imports/logic

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

    const tooltip = `Min: ${formatNumberEU(min, 4, 4)}\nMax: ${formatNumberEU(max, 4, 4)}\nStart: ${formatNumberEU(base, 4, 4)}\nLast: ${formatNumberEU(last, 4, 4)}\nChange: ${changePct >= 0 ? '+' : ''}${formatNumberEU(changePct, 2, 2)}%`

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

// European formatting helper: thousands separator '.' and decimal comma ','
function formatNumberEU(value: number, minDecimals = 0, maxDecimals = minDecimals): string {
    return value.toLocaleString('nl-NL', {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
    })
}

// Format rate: show as integer if whole, otherwise as fraction if < 0.01, else 2 decimals (EU style)
function formatRate(num: number, have?: string, want?: string): string {
    if (!Number.isFinite(num)) return '—'
    // Whole numbers
    if (num % 1 === 0) return formatNumberEU(num)
    // Fraction style for any 0 < num < 1 when we have currency context
    if (num > 0 && num < 1 && have && want) {
        const denom = 1 / num
        const rounded = Math.round(denom)
        // If denom is very close to an integer, prefer the clean integer
        if (Math.abs(denom - rounded) < 0.0005) {
            return `1/${formatNumberEU(rounded)}`
        }
        // Choose decimals based on magnitude for readability
        let decimals: number
        if (denom < 10) decimals = 2
        else if (denom < 100) decimals = 1
        else decimals = 0
        let denomStr = formatNumberEU(denom, decimals, decimals)
        // Trim trailing zero decimals if any remain (e.g., ,10 -> ,1)
        denomStr = denomStr.replace(/,(\d*?[1-9])0+$/, ',$1').replace(/,00$/, '')
        return `1/${denomStr}`
    }
    // Default localized 2 decimals
    return formatNumberEU(num, 2, 2)
}

function CollapsiblePair({ pair, defaultExpanded, loading, onReload, globalMaxAbsDelta, accountName, selectedMetrics }: { pair: PairSummary; defaultExpanded: boolean; loading: boolean; onReload: (index: number) => void; globalMaxAbsDelta: number; accountName?: string | null; selectedMetrics: readonly string[] }) {
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
        const sorted = [...rates].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
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
            value: spreadPct !== null ? <span className="summary-value">{formatNumberEU(spreadPct, 1, 1)}%</span> : null,
            tooltip: 'Spread: (highest rate - lowest rate) / lowest rate. Indicates dispersion; higher spread may mean opportunity.'
        },
        median: {
            label: 'Median',
            value: medianRate !== null ? <span className="summary-value">{formatRate(medianRate, pair.pay, pair.get)}</span> : null,
            tooltip: 'Median: Middle value of sorted listing rates. More robust than average against outliers.'
        },
        profit: {
            label: 'Profit',
            value: pair.profit_margin_pct !== null && pair.profit_margin_pct !== undefined ? (
                <span className="summary-value" style={{
                    color: pair.profit_margin_pct > 0 ? '#10b981' : pair.profit_margin_pct < 0 ? '#ef4444' : undefined,
                    fontWeight: pair.profit_margin_pct !== 0 ? 600 : undefined
                }}>
                    {pair.profit_margin_pct > 0 ? '+' : ''}{formatNumberEU(pair.profit_margin_pct, 1, 1)}%
                </span>
            ) : null,
            tooltip: `Profit margin: ${pair.profit_margin_pct !== null && pair.profit_margin_pct !== undefined ? formatNumberEU(pair.profit_margin_pct, 2, 2) : 'N/A'}% (${pair.profit_margin_raw !== null && pair.profit_margin_raw !== undefined ? (pair.profit_margin_raw > 0 ? '+' : '') + formatNumberEU(pair.profit_margin_raw, 2, 2) + ' ' + pair.get : 'N/A'})`
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
                                <span className="summary-item" style={{ width: 120, display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap', paddingRight: 8 }}>
                                    {pair.best_rate ? (
                                        <>
                                            <span className="summary-label" style={{ fontWeight: 600 }}>Best:</span>
                                            <span className="summary-value" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '14px', display: 'inline-block', paddingRight: 4 }}>{formatRate(pair.best_rate, pair.pay, pair.get)}</span>
                                        </>
                                    ) : null}
                                </span>
                                <span className="summary-item" style={{ width: 130, display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-start' }}>
                                    {pair.trend && pair.trend.sparkline && pair.trend.sparkline.length >= 2 ? (
                                        <>
                                            <Sparkline values={pair.trend.sparkline} width={70} relativeFirst={true} globalMaxAbsDelta={globalMaxAbsDelta} adaptive={true} visualCapPct={40} />
                                            <span style={{ fontSize: '11px', minWidth: 10, textAlign: 'right', color: pair.trend.direction === 'up' ? '#ef4444' : pair.trend.direction === 'down' ? '#10b981' : '#6b7280', whiteSpace: 'nowrap' }}>
                                                {pair.trend.change_percent > 0 ? '+' : ''}{formatNumberEU(pair.trend.change_percent, 1, 1)}%
                                            </span>
                                        </>
                                    ) : null}
                                </span>
                                {/* Selected metrics (max 3) - always 3 equal columns */}
                                <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 390, border: 'none', height: 20 }}>
                                    <tbody>
                                        <tr>
                                            {Array.from({ length: 3 }).map((_, idx) => {
                                                const key = selectedMetrics[idx]
                                                if (!key) return <td key={idx} style={{ width: 130, border: 'none', height: 20, padding: 0 }}></td>
                                                const def = metricRenderers[key]
                                                if (!def || !def.value) return <td key={idx} style={{ width: 130, border: 'none', height: 20, padding: 0 }}></td>
                                                return (
                                                    <td key={idx} style={{ width: 130, border: 'none', height: 20, padding: 0 }} title={def.tooltip}>
                                                        <span className="summary-item" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap', fontSize: '12px' }}>
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
                                            const normalize = (name?: string | null) => (name || '').replace(/#\d{3,5}$/, '').toLowerCase()
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
                                            )
                                        })}
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

export function TradesTable({ 
    data, 
    loading, 
    onReload, 
    onRefresh, 
    accountName,
    onDataUpdate 
}: { 
    data: PairSummary[]; 
    loading: boolean; 
    onReload: (index: number) => void; 
    onRefresh?: () => void; 
    accountName?: string | null;
    onDataUpdate?: (newData: PairSummary[]) => void;
}) {
    const [allExpanded, setAllExpanded] = useState(false)

    // Page-specific 30s refresh timer - updates to latest cached data
    useEffect(() => {
        if (!onDataUpdate) return
        
        console.log('[TradesTable] Starting 30s refresh timer')
        
        let cancelled = false
        let timer: number | null = null
        
        const fetchLatestCached = async () => {
            if (cancelled) return
            try {
                console.log('[TradesTable] Fetching latest cached data (30s timer)...')
                const response = await Api.latestCached(5)
                if (!cancelled && response.results) {
                    console.log('[TradesTable] Received cached data with timestamps:', 
                        response.results.map(r => `${r.get}/${r.pay}: ${r.fetched_at}`))
                    onDataUpdate(response.results)
                }
            } catch (error) {
                console.error('[TradesTable] Failed to fetch latest cached data:', error)
            }
        }
        
        const schedule = () => {
            if (cancelled) return
            timer = window.setTimeout(() => {
                fetchLatestCached().then(schedule)
            }, 30000) // 30s
        }
        
        // Start the timer immediately
        schedule()
        
        return () => {
            console.log('[TradesTable] Stopping 30s refresh timer')
            cancelled = true
            if (timer !== null) clearTimeout(timer)
        }
    }, [onDataUpdate])

    // Always display all metrics
    const selectedMetrics = ['spread', 'median', 'profit'] as const

    // Sort state - three states: descending, ascending, neutral (none)
    type SortKey = 'none' | 'change' | 'spread' | 'median' | 'profit'
    type SortDirection = 'desc' | 'asc' | 'none'
    const [sortBy, setSortBy] = useState<SortKey>('none')
    const [sortDirection, setSortDirection] = useState<SortDirection>('none')

    const handleSort = (key: SortKey) => {
        if (sortBy === key) {
            // Cycle through: desc -> asc -> none
            if (sortDirection === 'desc') {
                setSortDirection('asc')
            } else if (sortDirection === 'asc') {
                setSortDirection('none')
                setSortBy('none')
            }
        } else {
            // Start with descending on first click
            setSortBy(key)
            setSortDirection('desc')
        }
    }

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

    // Sort data based on selected sort key
    const sortedData = (() => {
        if (sortBy === 'none' || sortDirection === 'none') return data

        const sorted = [...data].sort((a, b) => {
            let aVal: number | null = null
            let bVal: number | null = null

            switch (sortBy) {
                case 'change':
                    aVal = a.trend?.change_percent ?? null
                    bVal = b.trend?.change_percent ?? null
                    break
                case 'spread':
                    if (a.listings.length >= 2) {
                        const rates = a.listings.map(l => l.rate)
                        const min = Math.min(...rates)
                        const max = Math.max(...rates)
                        aVal = min !== 0 ? ((max - min) / min) * 100 : null
                    }
                    if (b.listings.length >= 2) {
                        const rates = b.listings.map(l => l.rate)
                        const min = Math.min(...rates)
                        const max = Math.max(...rates)
                        bVal = min !== 0 ? ((max - min) / min) * 100 : null
                    }
                    break
                case 'median':
                    if (a.listings.length > 0) {
                        const rates = a.listings.map(l => l.rate)
                        const sorted = [...rates].sort((x, y) => x - y)
                        const mid = Math.floor(sorted.length / 2)
                        aVal = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
                    }
                    if (b.listings.length > 0) {
                        const rates = b.listings.map(l => l.rate)
                        const sorted = [...rates].sort((x, y) => x - y)
                        const mid = Math.floor(sorted.length / 2)
                        bVal = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
                    }
                    break
                case 'profit':
                    aVal = a.profit_margin_pct ?? null
                    bVal = b.profit_margin_pct ?? null
                    break
            }

            // Handle null values (push to end)
            if (aVal === null && bVal === null) return 0
            if (aVal === null) return 1
            if (bVal === null) return -1

            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        })

        return sorted
    })()

    // Find the index currently loading (first with empty listings)
    const loadingIndex = loading ? sortedData.findIndex(p => p.listings.length === 0) : -1

    // (Reverted) Removed cache watch polling logic – handled by legacy 60s auto-refresh in App.

    return (
        <>
            <div className="trades-container">
                <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
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

                {/* Column Headers - matches data row structure exactly */}
                <div style={{
                    display: 'grid',
                    gridAutoFlow: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '8px 24px 8px 0px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    marginBottom: '6px'
                }}>
                    {/* Spacer for Best column */}
                    <div style={{ width: '170px' }}></div>

                    {/* Change column header */}
                    <div
                        style={{
                            width: '0px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            cursor: 'pointer',
                            userSelect: 'none',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: sortBy === 'change' ? 'var(--accent)' : 'var(--muted)',
                            transition: 'color 0.2s'
                        }}
                        onClick={() => handleSort('change')}
                        title="Sort by price change percentage"
                    >
                        <span style={{ textTransform: 'capitalize' }}>change</span>
                        {sortBy === 'change' && sortDirection !== 'none' && (
                            <span style={{ fontSize: '10px' }}>
                                {sortDirection === 'asc' ? '▲' : '▼'}
                            </span>
                        )}
                    </div>

                    {/* Metrics table headers */}
                    <div style={{ width: '540px', display: 'flex', gap: 0 }}>
                        <div
                            style={{
                                width: '130px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                                userSelect: 'none',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: sortBy === 'spread' ? 'var(--accent)' : 'var(--muted)',
                                transition: 'color 0.2s'
                            }}
                            onClick={() => handleSort('spread')}
                            title="Sort by spread"
                        >
                            <span style={{ textTransform: 'capitalize' }}>spread</span>
                            {sortBy === 'spread' && sortDirection !== 'none' && (
                                <span style={{ fontSize: '10px' }}>
                                    {sortDirection === 'asc' ? '▲' : '▼'}
                                </span>
                            )}
                        </div>
                        <div
                            style={{
                                width: '130px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                                userSelect: 'none',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: sortBy === 'median' ? 'var(--accent)' : 'var(--muted)',
                                transition: 'color 0.2s'
                            }}
                            onClick={() => handleSort('median')}
                            title="Sort by median rate"
                        >
                            <span style={{ textTransform: 'capitalize' }}>median</span>
                            {sortBy === 'median' && sortDirection !== 'none' && (
                                <span style={{ fontSize: '10px' }}>
                                    {sortDirection === 'asc' ? '▲' : '▼'}
                                </span>
                            )}
                        </div>
                        <div
                            style={{
                                width: '310px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                                userSelect: 'none',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: sortBy === 'profit' ? 'var(--accent)' : 'var(--muted)',
                                transition: 'color 0.2s'
                            }}
                            onClick={() => handleSort('profit')}
                            title="Sort by profit margin"
                        >
                            <span style={{ textTransform: 'capitalize' }}>profit</span>
                            {sortBy === 'profit' && sortDirection !== 'none' && (
                                <span style={{ fontSize: '10px' }}>
                                    {sortDirection === 'asc' ? '▲' : '▼'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pairs-grid">
                    {sortedData.map((p, i) => (
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
        </>
    )
}
