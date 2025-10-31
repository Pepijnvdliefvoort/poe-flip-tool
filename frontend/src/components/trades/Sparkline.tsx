import { memo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatNumberEU, formatRate } from '../../utils/format';

interface SparklineProps {
    values: number[];
    width?: number;
    height?: number;
    stroke?: string;
    relativeFirst?: boolean;
    globalMaxAbsDelta?: number;
    showMinMax?: boolean;
    visualCapPct?: number;
    adaptive?: boolean;
    haveCurrency?: string;
    wantCurrency?: string;
    // Optionally accept timestamps for each value (for tooltip)
    timestamps?: string[];
}



const Sparkline = memo(function Sparkline({ values, width = 70, height = 24, stroke = 'var(--accent)', relativeFirst = false, globalMaxAbsDelta, showMinMax = true, visualCapPct = 50, adaptive = true, haveCurrency, wantCurrency, timestamps }: SparklineProps) {
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
    const max = Math.max(...values);
    const min = Math.min(...values);
    const last = values[values.length - 1];
    const base = values[0];
    const first = values[0];
    const changePct = base !== 0 ? ((last - base) / base) * 100 : 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const stepX = width / (values.length - 1);
    let d: string;
    if (relativeFirst && globalMaxAbsDelta && globalMaxAbsDelta > 0) {
        const deltasPct = values.map(v => base !== 0 ? ((v - base) / base) * 100 : 0);
        const seriesMaxAbsPct = Math.max(...deltasPct.map(Math.abs)) || 0;
        let denom = adaptive ? seriesMaxAbsPct : globalMaxAbsDelta;
        if (visualCapPct > 0) {
            denom = Math.min(denom, visualCapPct);
        }
        if (denom < 2) denom = 2;
        d = deltasPct.map((dp, i) => {
            const x = i * stepX;
            const y = (height / 2) - (dp / denom) * (height / 2);
            const cy = Math.min(height, Math.max(0, y));
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${cy.toFixed(2)}`;
        }).join(' ');
    } else {
        const range = max - min || 1;
        d = values.map((v, i) => {
            const x = i * stepX;
            const y = height - ((v - min) / range) * height;
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        }).join(' ');
    }
    const computeY = (v: number) => {
        if (relativeFirst && globalMaxAbsDelta && globalMaxAbsDelta > 0) {
            const dp = base !== 0 ? ((v - base) / base) * 100 : 0;
            const seriesMaxAbsPct = Math.max(...values.map(val => base !== 0 ? Math.abs(((val - base) / base) * 100) : 0)) || 0;
            let denom = adaptive ? seriesMaxAbsPct : globalMaxAbsDelta;
            if (visualCapPct > 0) denom = Math.min(denom, visualCapPct);
            if (denom < 2) denom = 2;
            const y = (height / 2) - (dp / denom) * (height / 2);
            return Math.min(height, Math.max(0, y));
        } else {
            const range = max - min || 1;
            return height - ((v - min) / range) * height;
        }
    };
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
    function formatDDMMHHMM(dateStr: string | undefined) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return (
        <div ref={containerRef} style={{ position: 'relative', width, height }}>
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                style={{ display: 'block', overflow: 'visible' }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
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
                {values.map((v, i) => {
                    const x = i * stepX;
                    const y = computeY(v);
                    const isMin = i === values.indexOf(min);
                    const isMax = i === values.indexOf(max);
                    const isLast = i === values.length - 1;
                    const isFirst = i === 0;
                    const isHoverable = isMin || isMax || isLast || isFirst;
                    if (!isHoverable) return null;
                    const isHover = i === hoverIdx;
                    let fill = isHover ? '#fff' : isFirst ? '#f59e42' : isMin ? '#10b981' : isMax ? '#ef4444' : 'var(--accent)';
                    let r = isHover ? 4 : 3;
                    let strokeColor = isHover ? 'var(--accent)' : isFirst ? '#f59e42' : isMin ? '#10b981' : isMax ? '#ef4444' : '#111827';
                    let strokeWidth = isHover ? 2 : 1;
                    return (
                        <circle
                            key={`dot-${i}`}
                            cx={x}
                            cy={y}
                            r={r}
                            fill={fill}
                            stroke={strokeColor}
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
                    {timestamps && timestamps[hoverIdx] && (
                        <div style={{ fontSize: 11, color: '#f59e42', fontWeight: 400, marginTop: 2 }}>
                            {formatDDMMHHMM(timestamps[hoverIdx])}
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
});

export default Sparkline;
