

import { useState, useEffect, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import '../spinner.css'
import { PairSummary } from '../types'
import { Api } from '../api'



type TradesTableProps = {
    data: PairSummary[];
    loading?: boolean;
    onReload?: (index: number) => void;
    onRefresh?: () => void;
    accountName?: string | null;
    onDataUpdate?: (newData: PairSummary[]) => void;
    topN: number;
};

interface SparklineProps {
    values: number[]
    width?: number
    height?: number
    stroke?: string
    relativeFirst?: boolean
    globalMaxAbsDelta?: number
    showMinMax?: boolean
    visualCapPct?: number
    adaptive?: boolean
    haveCurrency?: string
    wantCurrency?: string
}
const Sparkline = memo(function Sparkline({ values, width = 70, height = 24, stroke = 'var(--accent)', relativeFirst = false, globalMaxAbsDelta, showMinMax = true, visualCapPct = 50, adaptive = true, haveCurrency, wantCurrency }: SparklineProps) {
    // If values is empty or contains only null/undefined, show a fallback dot (loading state)
    if (!values || values.length === 0 || values.every(v => v == null)) {
        const y = height / 2;
        return (
            <div style={{ position: 'relative', width, height }}>
                <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
                    <circle cx={width / 2} cy={y} r={6} fill="#64748b" stroke="#334155" strokeWidth={2} style={{ opacity: 0.5 }} />
                </svg>
            </div>
        );
    }

    // Special case: single value, render a visually distinct dot with tooltip
    if (values.length === 1) {
        const v = values[0];
        const y = height / 2;
        const [hover, setHover] = useState(false);
        return (
            <div style={{ position: 'relative', width, height }}>
                <svg
                    width={width}
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                    style={{ display: 'block', overflow: 'visible', cursor: 'pointer' }}
                    onMouseEnter={() => setHover(true)}
                    onMouseLeave={() => setHover(false)}
                >
                    <circle
                        cx={width / 2}
                        cy={y}
                        r={7}
                        fill="#38bdf8"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        style={{ filter: 'drop-shadow(0 1px 4px #0ea5e980)' }}
                    />
                </svg>
                {hover && (
                    <div
                        style={{
                            position: 'absolute',
                            left: width / 2 - 40,
                            top: y - 36,
                            background: '#1e293b',
                            color: '#e2e8f0',
                            border: '1px solid #334155',
                            borderRadius: 8,
                            padding: '6px 12px',
                            fontSize: 13,
                            fontWeight: 600,
                            pointerEvents: 'none',
                            zIndex: 10,
                            minWidth: 80,
                            textAlign: 'center',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.18)'
                        }}
                    >
                        Value: {formatNumberEU(v, 4, 4)}
                    </div>
                )}
            </div>
        );
    }
    const max = Math.max(...values)
    const min = Math.min(...values);
    const last = values[values.length - 1]
    const base = values[0]
    const changePct = base !== 0 ? ((last - base) / base) * 100 : 0
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2

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

    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        let closest = 0;
        let dist = Infinity;
        values.forEach((_, i) => {
            const x = i * stepX;
            const d = Math.abs(x - mx);
            if (d < dist) { dist = d; closest = i; }
        });
        setHoverIdx(closest);
    };
    const handleMouseLeave = () => setHoverIdx(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerPos, setContainerPos] = useState<{left: number, top: number} | null>(null);
    useEffect(() => {
        if (hoverIdx !== null && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setContainerPos({ left: rect.left, top: rect.top });
        }
    }, [hoverIdx]);
    return (
        <div ref={containerRef} style={{ position: 'relative', width, height }}>
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                style={{ display: 'block', overflow: 'visible' }}
            >
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
                {/* Render lines between all points */}
                {values.map((v, i) => {
                    if (i === 0) return null;
                    const x1 = (i - 1) * stepX;
                    const y1 = computeY(values[i - 1]);
                    const x2 = i * stepX;
                    const y2 = computeY(v);
                    return (
                        <line
                            key={`line-${i}`}
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={stroke}
                            strokeWidth={1.5}
                        />
                    );
                })}
                {/* Render only min, max, and latest as dots */}
                {values.map((v, i) => {
                    const x = i * stepX;
                    const y = computeY(v);
                    const isMin = i === values.indexOf(min);
                    const isMax = i === values.indexOf(max);
                    const isLast = i === values.length - 1;
                    const isHoverable = isMin || isMax || isLast;
                    if (!isHoverable) return null;
                    const isHover = i === hoverIdx;
                    let fill = isHover ? '#fff' : isMin ? '#10b981' : isMax ? '#ef4444' : 'var(--accent)';
                    let r = isHover ? 4 : 3;
                    let stroke = isHover ? 'var(--accent)' : isMin ? '#10b981' : isMax ? '#ef4444' : '#111827';
                    let strokeWidth = isHover ? 2 : 1;
                    return (
                        <circle
                            key={`dot-${i}`}
                            cx={x}
                            cy={y}
                            r={r}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            style={{ transition: 'r 0.15s, fill 0.15s, stroke 0.15s', cursor: 'pointer' }}
                            onMouseEnter={() => setHoverIdx(i)}
                            onMouseLeave={() => setHoverIdx(null)}
                        />
                    );
                })}
            </svg>
            {hoverIdx !== null && containerPos && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        left: containerPos.left + hoverIdx * stepX - 40,
                        top: containerPos.top + computeY(values[hoverIdx]) - 36,
                        background: '#1e293b',
                        color: '#e2e8f0',
                        border: '1px solid #334155',
                        borderRadius: 6,
                        padding: '6px 12px',
                        fontSize: 13,
                        fontWeight: 600,
                        pointerEvents: 'none',
                        zIndex: 9999,
                        minWidth: 80,
                        textAlign: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.18)'
                    }}
                >
                    {formatRate(values[hoverIdx], haveCurrency, wantCurrency)}
                </div>,
                document.body
            )}
        </div>
    );
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
            var test = `1/${formatNumberEU(rounded)}`
            return test
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
        if (!Number.isFinite(num)) return '—'
        // Whole numbers
        if (num % 1 === 0) return formatNumberEU(num)
        // Always show as 1/N for any 0 < num < 1
        if (num > 0 && num < 1) {
            const denom = Math.round(1 / num)
            return `1/${denom}`
        }
        // Default localized 2 decimals
        return formatNumberEU(num, 2, 2)
}

function CollapsiblePair({ pair, defaultExpanded, loading, onReload, globalMaxAbsDelta, accountName, selectedMetrics }: { pair: PairSummary; defaultExpanded: boolean; loading: boolean; onReload: (index: number) => void; globalMaxAbsDelta: number; accountName?: string | null; selectedMetrics: readonly string[] }) {

    // Timer state for undercut refresh countdown
    const [refreshCountdown, setRefreshCountdown] = useState(0);

    const [undercutDialogOpen, setUndercutDialogOpen] = useState(false);
    // Improved undercut logic: if user is best, undercut next best; else undercut best
    // Use the displayed best rate (fraction string) as the base for undercutting if available
    let bestRate = pair.best_rate ?? 1;
    let bestRateFraction = '';
    if (pair.best_rate && pair.pay && pair.get) {
        const display = formatRate(pair.best_rate, pair.pay, pair.get);
        const m = display.match(/^1\/(\d+)$/);
        if (m) {
            bestRateFraction = display;
            // Use the denominator to suggest the next best fraction
            const denom = parseInt(m[1], 10);
            if (denom > 1) {
                bestRate = 1 / denom;
            }
        }
    }
    // Helper: reduce a fraction
    function gcd(a: number, b: number): number {
        return b === 0 ? a : gcd(b, a % b);
    }
    function toReducedFraction(x: number, maxDen: number = 100): { num: number, den: number } | null {
        let bestNum = 1, bestDen = 1, bestError = Math.abs(x - 1);
        for (let den = 1; den <= maxDen; den++) {
            let num = Math.round(x * den);
            let error = Math.abs(x - num / den);
            if (error < bestError) {
                bestNum = num;
                bestDen = den;
                bestError = error;
            }
            if (error < 1e-6) break;
        }
        const d = gcd(bestNum, bestDen);
        return { num: bestNum / d, den: bestDen / d };
    }
    function getFractionUndercut(rate: number): { value: string, display: string } | null {
        // If we have a bestRateFraction, use its denominator
        if (bestRateFraction) {
            const m = bestRateFraction.match(/^1\/(\d+)$/);
            if (m) {
                const denom = parseInt(m[1], 10);
                return { value: `1/${denom + 1}`, display: `1/${denom + 1}` };
            }
        }
        // For rates > 1 and not whole, suggest closest reduced fraction
        if (rate > 1 && rate % 1 !== 0) {
            const frac = toReducedFraction(rate, 100);
            if (frac && frac.den !== 1) {
                return { value: `${frac.num}/${frac.den}`, display: `${frac.num}/${frac.den}` };
            }
        }
        for (let N = 2; N <= 10000; N++) {
            if (Math.abs(rate - 1 / N) < 1e-8) {
                // Suggest 1/(N+1) as the undercut
                return { value: `1/${N + 1}`, display: `1/${N + 1}` };
            }
        }
        return null;
    }
    // Find user's own listing index and rate
    let myIndex = -1;
    let myRate = null;
    let nextBestRate = null;
    if (pair.listings && pair.listings.length > 0) {
        const sourceNames = accountName && accountName.length > 0 ? accountName : (import.meta.env.VITE_ACCOUNT_NAME || '');
    const rawNames = sourceNames.split(',').map((s: string) => s.trim()).filter((val: string) => !!val);
    const normalize = (name: string | undefined | null) => (name || '').replace(/#\d{3,5}$/, '').toLowerCase();
        for (let i = 0; i < pair.listings.length; i++) {
            const l = pair.listings[i];
            const normalizedListing = normalize(l.account_name);
            if (rawNames.some((envName: string) => normalize(envName) === normalizedListing)) {
                myIndex = i;
                myRate = l.rate;
                break;
            }
        }
        // If user is best (first listing), find next best after them
        if (myIndex === 0 && pair.listings.length > 1) {
            nextBestRate = pair.listings[1].rate;
        }
    }
    // If the best rate is a fraction and the user is the best with that rate, do not suggest a better rate
    let defaultNewPrice = String(bestRate);
    let defaultFraction = '';
    const bestFractionMatch = bestRateFraction.match(/^1\/(\d+)$/);
    if (bestFractionMatch && myIndex === 0 && typeof myRate === 'number') {
        const denom = parseInt(bestFractionMatch[1], 10);
        if (Math.abs(myRate - (1 / denom)) < 1e-8) {
            defaultNewPrice = `1/${denom}`;
            defaultFraction = `1/${denom}`;
        } else {
            defaultNewPrice = `1/${denom + 1}`;
            defaultFraction = `1/${denom + 1}`;
        }
    } else if (bestFractionMatch) {
        const denom = parseInt(bestFractionMatch[1], 10);
        defaultNewPrice = `1/${denom + 1}`;
        defaultFraction = `1/${denom + 1}`;
    } else if (myIndex === 0 && nextBestRate != null && Number.isFinite(nextBestRate)) {
        // User is best, undercut next best
        if (nextBestRate > 1 && nextBestRate % 1 !== 0) {
            const frac = getFractionUndercut(nextBestRate);
            if (frac) {
                defaultNewPrice = frac.value;
                defaultFraction = frac.display;
            } else {
                defaultNewPrice = String(Math.floor(nextBestRate));
                defaultFraction = '';
            }
        } else if (nextBestRate > 1) {
            defaultNewPrice = String(nextBestRate - 1);
            defaultFraction = '';
        } else if (nextBestRate > 0.01 && nextBestRate % 1 !== 0) {
            const frac = getFractionUndercut(nextBestRate);
            if (frac) {
                defaultNewPrice = frac.value;
                defaultFraction = frac.display;
            } else {
                defaultNewPrice = '';
                defaultFraction = '';
            }
        } else {
            defaultNewPrice = String(nextBestRate);
            defaultFraction = '';
        }
    } else if (myIndex === -1) {
        // User is not present in listings, undercut best
        if (Number.isFinite(bestRate) && bestRate > 1 && bestRate % 1 !== 0) {
            const frac = getFractionUndercut(bestRate);
            if (frac) {
                defaultNewPrice = frac.value;
                defaultFraction = frac.display;
            } else {
                defaultNewPrice = String(Math.floor(bestRate));
                defaultFraction = '';
            }
        } else if (Number.isFinite(bestRate) && bestRate > 1) {
            defaultNewPrice = String(bestRate - 1);
            defaultFraction = '';
        } else if (Number.isFinite(bestRate) && bestRate > 0.01 && bestRate % 1 !== 0) {
            const frac = getFractionUndercut(bestRate);
            if (frac) {
                defaultNewPrice = frac.value;
                defaultFraction = frac.display;
            } else {
                defaultNewPrice = '';
                defaultFraction = '';
            }
        }
    } else if (myIndex > 0) {
        // User is present but not the best, undercut best
        if (Number.isFinite(bestRate) && bestRate > 1 && bestRate % 1 !== 0) {
            const frac = getFractionUndercut(bestRate);
            if (frac) {
                defaultNewPrice = frac.value;
                defaultFraction = frac.display;
            } else {
                defaultNewPrice = String(Math.floor(bestRate));
                defaultFraction = '';
            }
        } else if (Number.isFinite(bestRate) && bestRate > 1) {
            defaultNewPrice = String(bestRate - 1);
            defaultFraction = '';
        } else if (Number.isFinite(bestRate) && bestRate > 0.01 && bestRate % 1 !== 0) {
            const frac = getFractionUndercut(bestRate);
            if (frac) {
                defaultNewPrice = frac.value;
                defaultFraction = frac.display;
            } else {
                defaultNewPrice = '';
                defaultFraction = '';
            }
        }
    }

    // Always use string for newPrice so it can be a fraction or decimal
    const [newPrice, setNewPrice] = useState(String(defaultNewPrice));
    const [fraction, setFraction] = useState(defaultFraction);

    // Reset newPrice and fraction to defaults every time the dialog is opened
    useEffect(() => {
        if (undercutDialogOpen) {
            setNewPrice(String(defaultNewPrice));
            setFraction(defaultFraction);
        }
    }, [undercutDialogOpen, defaultNewPrice, defaultFraction]);
    const [undercutLoading, setUndercutLoading] = useState(false);
    const [undercutResult, setUndercutResult] = useState<string|null>(null);
    const [undercutMenuPos, setUndercutMenuPos] = useState<{top: number, left: number} | null>(null);
    const undercutBtnRef = useRef<HTMLButtonElement | null>(null);

    // Close undercut menu on outside click
    useEffect(() => {
        if (!undercutDialogOpen) return;
        function handleClick(event: MouseEvent) {
            const menu = document.getElementById('undercut-menu');
            const btn = undercutBtnRef.current;
            if (menu && !menu.contains(event.target as Node) && btn && !btn.contains(event.target as Node)) {
                setUndercutDialogOpen(false);
                setUndercutResult(null);
                setUndercutMenuPos(null);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [undercutDialogOpen]);

    useEffect(() => {
        if (!undercutDialogOpen && undercutMenuPos !== null) {
            setUndercutMenuPos(null);
        }
    }, [undercutDialogOpen]);
    
    // Reset menu position when dialog closes
    useEffect(() => {
        if (!undercutDialogOpen && undercutMenuPos !== null) {
            setUndercutMenuPos(null);
        }
    }, [undercutDialogOpen]);

    // Reset menu position when dialog closes
    useEffect(() => {
        if (!undercutDialogOpen && undercutMenuPos !== null) {
            setUndercutMenuPos(null);
        }
    }, [undercutDialogOpen]);
    
    const [isExpanded, setIsExpanded] = useState(defaultExpanded)
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
    const [copiedAccountIndex, setCopiedAccountIndex] = useState<number | null>(null);
    const timeoutRef = useRef<number | null>(null)
    const accountTimeoutRef = useRef<number | null>(null);
    const copyAccountName = (name: string, index: number) => {
        if (accountTimeoutRef.current !== null) {
            clearTimeout(accountTimeoutRef.current);
        }
        navigator.clipboard.writeText(name);
        setCopiedAccountIndex(index);
        accountTimeoutRef.current = window.setTimeout(() => {
            setCopiedAccountIndex(null);
            accountTimeoutRef.current = null;
        }, 1250);
    };

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

    // Profit metric: use backend-provided profit_margin_pct and profit_margin_raw (median-based)
    const profitMarginRaw = pair.profit_margin_raw ?? null;
    const profitMarginPct = pair.profit_margin_pct ?? null;

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
            value: profitMarginPct !== null && profitMarginPct !== undefined ? (
                <span className="summary-value" style={{
                    color: profitMarginPct > 0 ? '#10b981' : profitMarginPct < 0 ? '#ef4444' : undefined,
                    fontWeight: profitMarginPct !== 0 ? 600 : undefined
                }}>
                    {profitMarginPct > 0 ? '+' : ''}{formatNumberEU(profitMarginPct, 1, 1)}%
                </span>
            ) : null,
            tooltip: `Profit margin (median): ${profitMarginPct !== null && profitMarginPct !== undefined ? formatNumberEU(profitMarginPct, 2, 2) : 'N/A'}% (${profitMarginRaw !== null && profitMarginRaw !== undefined ? (profitMarginRaw > 0 ? '+' : '') + formatNumberEU(profitMarginRaw, 2, 2) + ' ' + pair.get : 'N/A'})`
        }
    }

    // Rate limited status (removed countdown as rate_limit_remaining field was unused)
    const isRateLimited = pair.status === 'rate_limited'


    // Handler for row click: only toggle if not clicking a button inside controls
    const handleHeaderClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // If the click target is a button or inside a button, do nothing
        const target = e.target as HTMLElement;
        if (target.closest('.pair-controls button')) return;
        setIsExpanded(v => !v);
    };

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
                    style={{ cursor: 'pointer' }}
                    onClick={handleHeaderClick}
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
                                            <Sparkline values={pair.trend.sparkline} width={70} relativeFirst={true} globalMaxAbsDelta={globalMaxAbsDelta} adaptive={true} visualCapPct={40} haveCurrency={pair.pay} wantCurrency={pair.get} />
                                            <span style={{ fontSize: '11px', minWidth: 10, textAlign: 'right', color: pair.trend.direction === 'up' ? '#ef4444' : pair.trend.direction === 'down' ? '#10b981' : '#6b7280', whiteSpace: 'nowrap', marginLeft: 4 }}>
                                                {pair.trend.change_percent > 0 ? '+' : ''}{formatNumberEU(pair.trend.change_percent, 1, 1)}%
                                            </span>
                                            {typeof pair.trend.lowest_median === 'number' && typeof pair.trend.highest_median === 'number' ? (
                                                <span style={{ fontSize: '10px', color: '#6b7280', marginLeft: 8 }}>
                                                    <span style={{ color: '#10b981', fontWeight: 600 }}>Low:</span> {formatRate(pair.trend.lowest_median, pair.pay, pair.get)}
                                                    {' '}
                                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>High:</span> {formatRate(pair.trend.highest_median, pair.pay, pair.get)}
                                                </span>
                                            ) : null}
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
                            <button
                                className="collapse-btn"
                                ref={undercutBtnRef}
                                disabled={undercutLoading || pair.status !== 'ok'}
                                title="Undercut best rate by 1 (or custom)"
                                onClick={e => {
                                    e.stopPropagation();
                                    if (undercutBtnRef.current) {
                                        const rect = undercutBtnRef.current.getBoundingClientRect();
                                        setUndercutMenuPos({
                                            top: rect.bottom + 8,
                                            left: rect.left
                                        });
                                    }
                                    setUndercutDialogOpen(true);
                                }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}
                            >
                                {/* Dollar icon SVG */}
                                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                                    <circle cx="10" cy="10" r="8" stroke="#f59e42" strokeWidth="2" fill="none" />
                                    <path d="M10 5v10" stroke="#f59e42" strokeWidth="1.5" strokeLinecap="round"/>
                                    <path d="M13 7.5c0-1.1-1.3-2-3-2s-3 .9-3 2c0 1.1 1.3 2 3 2s3 .9 3 2-1.3 2-3 2-3-.9-3-2" stroke="#f59e42" strokeWidth="1.5" fill="none"/>
                                </svg>
                            </button>
                            <button className="collapse-btn" onClick={e => { e.stopPropagation(); setIsExpanded(!isExpanded); }}>
                                {isExpanded ? '▼' : '▶'}
                            </button>
                            <button
                                className="collapse-btn"
                                disabled={pair.status === 'loading'}
                                onClick={e => { e.stopPropagation(); onReload(pair.index); }}
                                style={{ fontSize: '14px' }}
                                title="Refresh this trade"
                            >⟳</button>
                        </div>
                    </div>
                </div>

                {/* Undercut dialog is always available, not gated by isExpanded */}
                {undercutDialogOpen && undercutMenuPos && createPortal(
                    <div
                        id="undercut-menu"
                        style={{
                            position: 'fixed',
                            top: undercutMenuPos.top,
                            left: undercutMenuPos.left,
                            zIndex: 9999,
                            background: '#222',
                            border: '1px solid #f59e42',
                            borderRadius: 8,
                            padding: 16,
                            minWidth: 260,
                            boxShadow: '0 2px 16px #000a',
                            color: '#fff'
                        }}
                    >
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>
                            New price
                            <input
                                type="text"
                                value={(() => {
                                    // If the value is a decimal, convert to fraction for display
                                    const val = fraction || newPrice;
                                    if (/^\d+\/\d+$/.test(val)) return val;
                                    const num = Number(val);
                                    if (!isNaN(num) && num > 0 && num < 1) {
                                        const denom = Math.round(1 / num);
                                        return `1/${denom}`;
                                    }
                                    return val;
                                })()}
                                onChange={e => {
                                    setFraction(e.target.value);
                                    setNewPrice(e.target.value);
                                }}
                                style={{ width: 80, fontSize: 14, marginLeft: 8, marginRight: 4 }}
                            />
                            {pair.pay}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <button
                                disabled={
                                    refreshCountdown > 0 ||
                                    undercutLoading ||
                                    (
                                        // If myRate is a fraction and matches the new fraction, disable
                                        typeof myRate === 'number' &&
                                        /^1\/\d+$/.test(newPrice) &&
                                        (() => {
                                            const m = newPrice.match(/^1\/(\d+)$/);
                                            if (m) {
                                                const denom = parseInt(m[1], 10);
                                                return Math.abs(myRate - (1 / denom)) < 1e-8;
                                            }
                                            return false;
                                        })()
                                    ) ||
                                    (
                                        typeof myRate === 'number' &&
                                        !isNaN(Number(newPrice)) &&
                                        Math.abs(Number(newPrice) - myRate) < 1e-6 &&
                                        !/^\d+\/\d+$/.test(newPrice)
                                    )
                                }
                                style={{
                                    background: '#f59e42',
                                    color: '#222',
                                    border: 'none',
                                    borderRadius: 4,
                                    padding: '4px 12px',
                                    fontWeight: 600,
                                    cursor: (refreshCountdown > 0 || undercutLoading || (
                                        typeof myRate === 'number' &&
                                        /^1\/\d+$/.test(newPrice) &&
                                        (() => {
                                            const m = newPrice.match(/^1\/(\d+)$/);
                                            if (m) {
                                                const denom = parseInt(m[1], 10);
                                                return Math.abs(myRate - (1 / denom)) < 1e-8;
                                            }
                                            return false;
                                        })()
                                    ) || (
                                        typeof myRate === 'number' &&
                                        !isNaN(Number(newPrice)) &&
                                        Math.abs(Number(newPrice) - myRate) < 1e-6 &&
                                        !/^\d+\/\d+$/.test(newPrice)
                                    )) ? 'not-allowed' : 'pointer',
                                    opacity: (refreshCountdown > 0 || undercutLoading || (
                                        typeof myRate === 'number' &&
                                        /^1\/\d+$/.test(newPrice) &&
                                        (() => {
                                            const m = newPrice.match(/^1\/(\d+)$/);
                                            if (m) {
                                                const denom = parseInt(m[1], 10);
                                                return Math.abs(myRate - (1 / denom)) < 1e-8;
                                            }
                                            return false;
                                        })()
                                    ) || (
                                        typeof myRate === 'number' &&
                                        !isNaN(Number(newPrice)) &&
                                        Math.abs(Number(newPrice) - myRate) < 1e-6 &&
                                        !/^\d+\/\d+$/.test(newPrice)
                                    )) ? 0.5 : 1,
                                    pointerEvents: 'auto', // Always allow pointer events so cursor style works
                                }}
                                onClick={async () => {
                                    setUndercutLoading(true);
                                    setUndercutResult(null);
                                    setRefreshCountdown(10);
                                    let timer: NodeJS.Timeout | null = null;
                                    try {
                                        // Always send the fraction string if present, otherwise the decimal
                                        const rateToSend = (fraction && fraction !== '1' && fraction !== '1/1') ? fraction : newPrice.toString();
                                        const res = await Api.undercut(pair.index, rateToSend);
                                        setUndercutResult(`Success! New rate: ${res.new_rate}`);
                                        // Start countdown
                                        timer = setInterval(() => {
                                            setRefreshCountdown(prev => {
                                                if (prev <= 1) {
                                                    clearInterval(timer!);
                                                    return 0;
                                                }
                                                return prev - 1;
                                            });
                                        }, 1000);
                                        setTimeout(() => {
                                            setUndercutDialogOpen(false);
                                            setUndercutMenuPos(null);
                                            setUndercutResult(null);
                                            setRefreshCountdown(0);
                                            // Simulate manual refresh (call onReload only)
                                            if (onReload) onReload(pair.index);
                                        }, 10000);
                                    } catch (err: any) {
                                        setUndercutResult('Failed: ' + (err?.message || 'Unknown error'));
                                        setRefreshCountdown(0);
                                    } finally {
                                        setUndercutLoading(false);
                                    }
                                }}>
                                {refreshCountdown > 0 ? `Refreshing (${refreshCountdown})` : 'Confirm'}
                            </button>
                            <button disabled={undercutLoading} style={{ background: '#444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontWeight: 600, cursor: 'pointer' }}
                                onClick={() => { setUndercutDialogOpen(false); setUndercutResult(null); setUndercutMenuPos(null); }}>
                                Cancel
                            </button>
                        </div>
                        {undercutResult && <div style={{ marginTop: 6, color: undercutResult.startsWith('Success') ? '#10b981' : '#ef4444', fontWeight: 500 }}>{undercutResult}</div>}
                    </div>,
                    document.body
                )}
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
                                                        <span
                                                            className="meta-value"
                                                            title={copiedAccountIndex === i ? 'Copied!' : (l.account_name || 'Unknown')}
                                                            onClick={() => l.account_name && copyAccountName(l.account_name, i)}
                                                            style={{
                                                                fontWeight: isMyTrade ? 600 : undefined,
                                                                width: '100px',
                                                                minWidth: '120px',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                                display: 'block',
                                                                verticalAlign: 'bottom',
                                                                border: '1px solid',
                                                                borderColor: copiedAccountIndex === i ? 'rgba(16, 185, 129, 0.9)' : 'rgba(156, 163, 175, 0.3)',
                                                                background: copiedAccountIndex === i ? 'rgba(16, 185, 129, 0.3)' : 'rgba(100, 100, 100, 0.1)',
                                                                color: copiedAccountIndex === i ? 'rgba(255, 255, 255, 0.5)' : 'rgba(156, 163, 175, 0.7)',
                                                                borderRadius: '4px',
                                                                cursor: l.account_name ? 'pointer' : 'default',
                                                                padding: '4px 6px',
                                                                fontSize: '11px',
                                                                fontFamily: 'monospace',
                                                                opacity: 0.95,
                                                                transition: 'all 0.3s ease-in-out',
                                                                userSelect: 'none',
                                                                textAlign: 'left',
                                                            }}
                                                        >
                                                            {copiedAccountIndex === i ? '✓ Copied!' : (l.account_name || 'Unknown')}
                                                        </span>
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


export function TradesTable(props: TradesTableProps) {
    const { data, loading, onReload, onRefresh, accountName, onDataUpdate, topN } = props;
    const [allExpanded, setAllExpanded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let timer: number | null = null;

        const fetchLatestCached = async () => {
            if (cancelled) return;
            try {
                console.log('[TradesTable] Fetching latest cached data (30s timer)...');
                const response = await Api.latestCached(topN);
                if (!cancelled && response.results && onDataUpdate) {
                    console.log('[TradesTable] Received cached data with timestamps:',
                        response.results.map(r => `${r.get}/${r.pay}: ${r.fetched_at}`));
                    onDataUpdate(response.results);
                }
            } catch (error) {
                console.error('[TradesTable] Failed to fetch latest cached data:', error);
            }
        };

        const schedule = () => {
            if (cancelled) return;
            timer = window.setTimeout(() => {
                fetchLatestCached().then(schedule);
            }, 30000); // 30s
        };

        // Fetch immediately on mount, then start the timer
        fetchLatestCached().then(schedule);

        return () => {
            console.log('[TradesTable] Stopping 30s refresh timer');
            cancelled = true;
            if (timer !== null) clearTimeout(timer);
        };
    }, [onDataUpdate, topN]);

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
                            key={`${p.pay}->${p.get}`}
                            pair={p}
                            defaultExpanded={allExpanded}
                            loading={!!loading && i === loadingIndex}
                            onReload={onReload ? onReload : () => {}}
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
