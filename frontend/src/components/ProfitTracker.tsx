import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Api } from '../api';
import type { PortfolioSnapshot, PortfolioHistoryResponse } from '../types';

// Format numbers with thousand/million separators and fixed decimals
function formatNumber(value: number | null | undefined, decimals = 2) {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const ProfitTracker: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [history, setHistory] = useState<PortfolioHistoryResponse | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [donutHoverIdx, setDonutHoverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState<number>(800);

  useEffect(() => {
    function handleResize() {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        setChartWidth(Math.max(600, w - 40));
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  async function takeSnapshot() {
    setLoading(true); setError(null);
    try {
      const snap = await Api.portfolioSnapshot();
      setSnapshot(snap);
      setHistory(h => {
        if (!h) return h;
        if (h.snapshots.find(s => s.timestamp === snap.timestamp)) return h;
        return { ...h, snapshots: [...h.snapshots, { timestamp: snap.timestamp, total_divines: snap.total_divines, breakdown: snap.breakdown }] };
      });
    } catch (e: any) {
      setError(e.message || 'Failed to create snapshot');
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(limit = 120) {
    setHistoryLoading(true); setError(null);
    try {
      const h = await Api.portfolioHistory(limit);
      setHistory(h);
    } catch (e: any) {
      setError(e.message || 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => { loadHistory(); }, []);

  useEffect(() => {
    takeSnapshot();
    const intervalId = setInterval(() => {
      takeSnapshot();
    }, 15 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  const grandTotal = snapshot?.total_divines ?? null;

  const { chartPath, points, minVal, maxVal } = useMemo(() => {
    if (!history || history.snapshots.length < 2) return { chartPath: '', points: [], minVal: 0, maxVal: 0 };
    const h = 280, padX = 70, padY = 60, w = chartWidth;
    const values = history.snapshots.map(s => s.total_divines);
    const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1;
    const pts = history.snapshots.map((s, i) => {
      const x = padX + (i / (history.snapshots.length - 1)) * (w - padX * 2);
      const y = h - padY - ((s.total_divines - min) / range) * (h - padY * 2);
      return { x, y, v: s.total_divines, ts: s.timestamp };
    });
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    return { chartPath: path, points: pts, minVal: min, maxVal: max };
  }, [history, chartWidth]);

  const profitStats = useMemo(() => {
    if (!history || history.snapshots.length < 2) return null;
    const firstValue = history.snapshots[0].total_divines;
    const lastValue = history.snapshots[history.snapshots.length - 1].total_divines;
    const absoluteChange = lastValue - firstValue;
    const percentChange = ((lastValue - firstValue) / firstValue) * 100;
    return { absoluteChange, percentChange, isPositive: absoluteChange >= 0 };
  }, [history]);

  const yAxisTicks = useMemo(() => {
    if (!history || history.snapshots.length < 2) return [];
    const ticks: { value: number; y: number }[] = [];
    const range = maxVal - minVal || 1;
    for (let i = 0; i <= 5; i++) {
      const value = minVal + (range * i / 5);
      const y = 220 - (i * 160 / 5);
      ticks.push({ value, y });
    }
    return ticks;
  }, [minVal, maxVal, history]);

  const xAxisTicks = useMemo(() => {
    if (!points.length) return [];
    const ticks: { x: number; label: string }[] = [];
    const indices = [0, Math.floor(points.length / 2), points.length - 1];
    indices.forEach(idx => {
      if (points[idx]) {
        const date = new Date(points[idx].ts);
        const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        ticks.push({ x: points[idx].x, label });
      }
    });
    return ticks;
  }, [points]);

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!points.length) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let closest = 0;
    let dist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - mx);
      if (d < dist) { dist = d; closest = i; }
    });
    setHoverIdx(closest);
  }
  function clearHover() { setHoverIdx(null); }

  function iconFor(currency: string) { return `/currency/${currency}.webp`; }

  const donut = useMemo(() => {
    if (!snapshot) return [];
    const entries = snapshot.breakdown.filter(b => b.total_divine != null && b.total_divine! > 0);
    const total = entries.reduce((a, b) => a + (b.total_divine || 0), 0) || 1;
    return entries.map(e => ({
      currency: e.currency,
      value: e.total_divine!,
      pct: (e.total_divine! / total),
    })).sort((a, b) => b.value - a.value);
  }, [snapshot]);

  const palette = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316','#6366f1','#14b8a6','#a855f7'];

  const donutSvg = useMemo(() => {
    if (!donut.length) return null;
    const size = 400; const r = 140; const innerR = 80; const cx = size/2; const cy = size/2;
    let startAngle = -Math.PI/2;
    const segments = donut.map((d,i) => {
      const angle = d.pct * Math.PI * 2;
      const endAngle = startAngle + angle;
      const largeArc = angle > Math.PI ? 1 : 0;
      const x1 = cx + r * Math.cos(startAngle); const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle); const y2 = cy + r * Math.sin(endAngle);
      const path = `M${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} L${cx + innerR*Math.cos(endAngle)},${cy + innerR*Math.sin(endAngle)} A${innerR},${innerR} 0 ${largeArc} 0 ${cx + innerR*Math.cos(startAngle)},${cy + innerR*Math.sin(startAngle)} Z`;
      const midAngle = startAngle + angle/2;
      const lx = cx + (r+25)*Math.cos(midAngle); const ly = cy + (r+25)*Math.sin(midAngle);
      startAngle = endAngle;
      return { path, color: palette[i % palette.length], labelPos: { x: lx, y: ly }, data: d };
    });
    return { size, segments, cx, cy, total: donut.reduce((a,b)=>a+b.value,0) };
  }, [donut]);

  return (
    <div ref={containerRef} style={{ padding: '10px 14px 60px' }}>
      <h2 style={{ marginTop: 0 }}>Profit Tracker</h2>
      <p style={{ margin: '4px 0 20px', fontSize: 14, opacity: 0.85 }}>
        Automatic snapshots of your portfolio every 15 minutes. Track your total divine value and currency composition over time.
      </p>
      {error && <div style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>}

      {history && history.snapshots.length > 0 && (
        <div style={{ marginBottom: 34 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12, maxWidth: chartWidth }}>
            <h3 style={{ margin: 0, fontSize: 16, display:'flex', alignItems:'center', gap:12, flexWrap: 'wrap', flex: 1 }}>
              Total Divine Value Over Time
              <span style={{ fontSize:12, opacity:0.6 }}>Range: {formatNumber(minVal, 2)} – {formatNumber(maxVal, 2)} Div</span>
            </h3>
            {profitStats && (
              <div style={{
                background: profitStats.isPositive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${profitStats.isPositive ? '#10b981' : '#ef4444'}`,
                borderRadius: 6,
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: 9, opacity: 0.7, fontWeight: 500, marginBottom: 1 }}>Overall</div>
                  <div style={{ 
                    fontSize: 15, 
                    fontWeight: 700, 
                    color: profitStats.isPositive ? '#10b981' : '#ef4444',
                    letterSpacing: 0.3
                  }}>
                    {profitStats.isPositive ? '+' : ''}{profitStats.percentChange.toFixed(2)}%
                  </div>
                </div>
                <div style={{ 
                  fontSize: 12, 
                  fontWeight: 600,
                  color: profitStats.isPositive ? '#10b981' : '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3
                }}>
                  <span style={{ fontSize: 16 }}>{profitStats.isPositive ? '▲' : '▼'}</span>
                  {profitStats.isPositive ? '+' : ''}{formatNumber(profitStats.absoluteChange, 2)}
                </div>
              </div>
            )}
          </div>
          <svg
            width={chartWidth}
            height={300}
            style={{ background: 'linear-gradient(180deg,#0f172a,#0d1320)', border: '1px solid #334155', borderRadius: 8, boxShadow:'0 2px 6px rgba(0,0,0,0.4)' }}
            onMouseMove={onMouseMove}
            onMouseLeave={clearHover}
          >
            <defs>
              <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            {Array.from({ length: 6 }).map((_,i) => (
              <line key={i} x1={70} x2={chartWidth-70} y1={60 + i*(160/5)} y2={60 + i*(160/5)} stroke="#1e293b" strokeDasharray="2 4" />
            ))}
            <line x1={70} x2={70} y1={60} y2={220} stroke="#334155" strokeWidth={1.5} />
            {yAxisTicks.map((tick, i) => (
              <g key={i}>
                <line x1={65} x2={70} y1={tick.y} y2={tick.y} stroke="#334155" strokeWidth={1.5} />
                <text x={60} y={tick.y + 4} fontSize={10} fill="#94a3b8" textAnchor="end">{formatNumber(tick.value, 1)}</text>
              </g>
            ))}
            <line x1={70} x2={chartWidth-70} y1={220} y2={220} stroke="#334155" strokeWidth={1.5} />
            {xAxisTicks.map((tick, i) => (
              <g key={i}>
                <line x1={tick.x} x2={tick.x} y1={220} y2={225} stroke="#334155" strokeWidth={1.5} />
                <text x={tick.x} y={237} fontSize={10} fill="#94a3b8" textAnchor="middle" fontWeight={600}>{tick.label}</text>
              </g>
            ))}
            <text x={20} y={140} fontSize={11} fill="#cbd5e1" textAnchor="middle" transform={`rotate(-90, 20, 140)`}>Divine Orbs</text>
            <text x={chartWidth/2} y={278} fontSize={11} fill="#cbd5e1" textAnchor="middle">Time</text>
            <path d={chartPath} stroke="#3b82f6" strokeWidth={2.5} fill="none" />
            {points.map((p,i)=>(
              <circle key={i} cx={p.x} cy={p.y} r={hoverIdx===i?5:3} fill={hoverIdx===i?"#fff":"#3b82f6"} style={{ transition:'r 0.15s, fill 0.15s' }} />
            ))}
            {hoverIdx!=null && points[hoverIdx] && (
              <g>
                <line x1={points[hoverIdx].x} x2={points[hoverIdx].x} y1={60} y2={220} stroke="#3b82f6" strokeDasharray="3 3" />
                <rect x={points[hoverIdx].x - 70} y={points[hoverIdx].y - 48} width={140} height={42} rx={6} fill="#1e293b" stroke="#3b82f6" />
                <text x={points[hoverIdx].x} y={points[hoverIdx].y - 28} fontSize={12} fill="#e2e8f0" textAnchor="middle">{new Date(points[hoverIdx].ts).toLocaleTimeString()}</text>
                <text x={points[hoverIdx].x} y={points[hoverIdx].y - 12} fontSize={15} fill="#3b82f6" fontWeight={700} textAnchor="middle" style={{letterSpacing:0.5}}>{formatNumber(points[hoverIdx].v, 2)} Div</text>
              </g>
            )}
          </svg>
        </div>
      )}

      {snapshot && donutSvg && (
        <div style={{ marginBottom: 34 }}>
          <h3 style={{ margin:'0 0 12px', fontSize:16 }}>Portfolio Composition</h3>
          <div style={{ display:'flex', gap:24, alignItems:'center', justifyContent:'center', flexWrap:'wrap' }}>
            <div style={{ flex:'0 0 auto', maxWidth:350 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {donut.map((d,i)=>(
                  <div
                    key={d.currency}
                    style={{
                      background: donutHoverIdx===i ? '#1e293b' : '#0f172a',
                      border: donutHoverIdx===i ? `1px solid ${palette[i%palette.length]}` : '1px solid #1e293b',
                      borderRadius:6,
                      padding:'6px 10px',
                      display:'flex',
                      alignItems:'center',
                      gap:6,
                      cursor:'pointer',
                      transition:'all 0.2s',
                      transform: donutHoverIdx===i ? 'scale(1.03)' : 'scale(1)'
                    }}
                    onMouseEnter={() => setDonutHoverIdx(i)}
                    onMouseLeave={() => setDonutHoverIdx(null)}
                  >
                    <span style={{ width:12, height:12, borderRadius:'50%', background:palette[i%palette.length], flexShrink:0 }} />
                    <img src={iconFor(d.currency)} alt={d.currency} style={{ width:20, height:20, flexShrink:0 }} />
                    <div style={{ flex:1, overflow:'hidden' }}>
                      <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d.currency}</div>
                      <div style={{ fontSize:11, opacity:0.7, fontVariantNumeric:'tabular-nums' }}>{(d.pct*100).toFixed(1)}% • {formatNumber(d.value, 2)} Div</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <svg width={donutSvg.size} height={donutSvg.size} style={{ display:'block', flex:'0 0 auto' }}>
              {donutSvg.segments.map((seg,i)=>(
                <g key={i}>
                  <path
                    d={seg.path}
                    fill={seg.color}
                    stroke="#0f172a"
                    strokeWidth={1}
                    style={{ cursor:'pointer', transition:'opacity 0.2s', opacity: donutHoverIdx!=null && donutHoverIdx!==i ? 0.4 : 1 }}
                    onMouseEnter={() => setDonutHoverIdx(i)}
                    onMouseLeave={() => setDonutHoverIdx(null)}
                  />
                  {donutHoverIdx===i && (
                    <g>
                      <text x={seg.labelPos.x} y={seg.labelPos.y} textAnchor="middle" fontSize={13} fill="#fff" fontWeight={600}>{seg.data.currency}</text>
                      <text x={seg.labelPos.x} y={seg.labelPos.y+16} textAnchor="middle" fontSize={12} fill="#e2e8f0">{(seg.data.pct*100).toFixed(1)}%</text>
                    </g>
                  )}
                </g>
              ))}
              <text x={donutSvg.cx} y={donutSvg.cy - 14} textAnchor="middle" fontSize={22} fill="#e2e8f0" fontWeight={700} style={{letterSpacing:1,dominantBaseline:'middle'}}>
                {formatNumber(grandTotal, 2)}
              </text>
              <image href="/currency/divine.webp" x={donutSvg.cx - 16} y={donutSvg.cy + 4} width="32" height="32" />
              <text x={donutSvg.cx} y={donutSvg.cy + 54} textAnchor="middle" fontSize={14} fill="#94a3b8">Total</text>
            </svg>
          </div>
        </div>
      )}

      {snapshot && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 40 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              <th style={{ textAlign: 'left', padding: 6 }}>Currency</th>
              <th style={{ textAlign: 'right', padding: 6 }}>Qty</th>
              <th style={{ textAlign: 'right', padding: 6 }}>Div / Unit</th>
              <th style={{ textAlign: 'right', padding: 6 }}>Total (Div)</th>
              <th style={{ textAlign: 'left', padding: 6 }}>Source Pair</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.breakdown.map(b => (
              <tr key={b.currency} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: 6, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <img src={iconFor(b.currency)} alt={b.currency} style={{ width: 26, height: 26 }} />
                  {b.currency}
                </td>
                <td style={{ padding: 6, textAlign: 'right' }}>{b.quantity}</td>
                <td style={{ padding: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(b.divine_per_unit, 4)}</td>
                <td style={{ padding: 6, textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: '#38bdf8' }}>{formatNumber(b.total_divine, 3)}</td>
                <td style={{ padding: 6, fontSize: 12, opacity: 0.65 }}>{b.source_pair || '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: 'right', padding: 6, fontWeight: 600 }}>Grand Total</td>
              <td style={{ textAlign: 'right', padding: 6, fontWeight: 700, color: '#38bdf8', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(grandTotal, 3)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}

      {!snapshot && !error && (
        <p style={{ marginTop: 12, opacity: 0.75 }}>Take a snapshot to populate your portfolio breakdown.</p>
      )}
    </div>
  );
};

export default ProfitTracker;
