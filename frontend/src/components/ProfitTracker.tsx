import React, { useEffect, useMemo, useRef, useState } from 'react';
import TimeRangePicker from './profitTracker/TimeRangePicker';
import SnapshotStatusBar from './profitTracker/SnapshotStatusBar';
import { Api } from '../api';
import type { PortfolioSnapshot, PortfolioHistoryResponse } from '../types';
import { useAuth } from '../hooks/useAuth';
import { formatNumber, parseUtcTimestamp, iconFor, pluralize } from '../utils/profitTrackerUtils';
import { BreakdownTable } from './profitTracker/BreakdownTable';
import { EmptyState } from './profitTracker/EmptyState';
import { ErrorDisplay } from './profitTracker/ErrorDisplay';
import { extractErrorMessage } from '../utils/error';

const ProfitTracker: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [history, setHistory] = useState<PortfolioHistoryResponse | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [donutHoverIdx, setDonutHoverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState<number>(800);
  const [snapshotAge, setSnapshotAge] = useState<string>('');
  const [nextCountdown, setNextCountdown] = useState<string>('');
  const nextSnapshotAtRef = useRef<number | null>(null);
  const schedulerIntervalRef = useRef<number | null>(null);
  const schedulerLastSuccessRef = useRef<number | null>(null);
  const [timeRange, setTimeRange] = useState<number | null>(null); // hours, null = all
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

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

  const lastSnapshotRef = useRef<string | null>(null);

  // --- API Data Loading Logic ---
  // Load latest snapshot from backend
  async function loadLatestSnapshot() {
    if (!isAuthenticated) return;
    try {
      const h = await Api.portfolioHistory(1); // Get just the latest snapshot
      if (h.snapshots.length > 0) {
        const latest = h.snapshots[0];
        setSnapshot({
          saved: true,
          timestamp: latest.timestamp,
          total_divines: latest.total_divines,
          league: '',
          breakdown: latest.breakdown.map(b => ({
            currency: b.currency,
            quantity: b.quantity,
            divine_per_unit: b.divine_per_unit,
            total_divine: b.total_divine,
            source_pair: b.source_pair ?? null
          }))
        });
        lastSnapshotRef.current = latest.timestamp;
        updateSnapshotAge(latest.timestamp);
        // If we know scheduler interval, derive next snapshot time from latest
        if (schedulerIntervalRef.current) {
          const lastTs = parseUtcTimestamp(latest.timestamp);
          nextSnapshotAtRef.current = lastTs + schedulerIntervalRef.current * 1000;
        }
      }
    } catch (e) {
      console.error('[ProfitTracker] Failed to load latest snapshot:', e);
    }
  }

  // Load full history from backend
  async function loadHistory(limit = 120) {
    if (!isAuthenticated) return;
    setHistoryLoading(true); setError(null);
    try {
      const h = await Api.portfolioHistory(limit, timeRange ?? undefined);
      setHistory(h);
    } catch (e: any) {
      setError(e.message || 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }

  // Load scheduler status from backend
  async function loadSchedulerStatus() {
    if (!isAuthenticated) return;
    try {
      const s = await Api.portfolioSchedulerStatus();
      if (s.enabled) {
        schedulerIntervalRef.current = s.interval_seconds;
        if (s.last_success) {
          const lastSuccess = parseUtcTimestamp(s.last_success);
          schedulerLastSuccessRef.current = lastSuccess;
          nextSnapshotAtRef.current = lastSuccess + s.interval_seconds * 1000;
          if (lastSnapshotRef.current) {
            const localLast = parseUtcTimestamp(lastSnapshotRef.current);
            if (localLast > lastSuccess) {
              nextSnapshotAtRef.current = localLast + s.interval_seconds * 1000;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[ProfitTracker] Failed to fetch scheduler status, using local timing fallback');
    }
  }

  // Take a new snapshot (manual refresh)
  async function takeSnapshot(source: 'initial' | 'interval' | 'manual' | 'visibility' = 'manual') {
    if (!isAuthenticated) return;
    setLoading(true); setError(null);
    try {
      const snap = await Api.portfolioSnapshot();
      lastSnapshotRef.current = snap.timestamp;
      nextSnapshotAtRef.current = Date.now() + 15 * 60 * 1000;
      setSnapshot(snap);
      updateSnapshotAge(snap.timestamp);
      setHistory(h => {
        if (!h) return h;
        if (h.snapshots.find(s => s.timestamp === snap.timestamp)) return h;
        return { ...h, snapshots: [...h.snapshots, { timestamp: snap.timestamp, total_divines: snap.total_divines, breakdown: snap.breakdown }] };
      });
      await loadHistory();
    } catch (e: any) {
      setError(e.message || 'Failed to create snapshot');
    } finally {
      setLoading(false);
    }
  }

  // Update snapshot age display
  function updateSnapshotAge(ts: string) {
    const then = parseUtcTimestamp(ts);
    const diffMs = Date.now() - then;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) {
      setSnapshotAge(`${diffSec}s ago`);
      return;
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      setSnapshotAge(`${diffMin}m ago`);
      return;
    }
    const diffHr = Math.floor(diffMin / 60);
    setSnapshotAge(`${diffHr}h ago`);
  }

  // Update countdown to next snapshot
  function updateCountdown() {
    if (!nextSnapshotAtRef.current) { setNextCountdown('—'); return; }
    const remainingMs = nextSnapshotAtRef.current - Date.now();
    if (remainingMs <= 0) { setNextCountdown('due'); return; }
    const sec = Math.floor(remainingMs / 1000) % 60;
    const minTotal = Math.floor(remainingMs / 60000);
    const min = minTotal % 60;
    const hr = Math.floor(minTotal / 60);
    if (hr > 0) {
      setNextCountdown(`${hr}h ${min}m ${sec}s`);
    } else if (min > 0) {
      setNextCountdown(`${min}m ${sec}s`);
    } else {
      setNextCountdown(`${sec}s`);
    }
  }

  // Initial load: history, snapshot, scheduler status
  useEffect(() => {
    if (!isAuthenticated) return;
    loadHistory();
    loadLatestSnapshot();
    loadSchedulerStatus();
  }, [isAuthenticated, timeRange]);

  // Periodically refresh age + countdown display
  useEffect(() => {
    const id = setInterval(() => {
      if (snapshot?.timestamp) updateSnapshotAge(snapshot.timestamp);
      updateCountdown();
    }, 1000);
    return () => clearInterval(id);
  }, [snapshot]);

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



  const donut = useMemo(() => {
    if (!snapshot) return [];
    const entries = snapshot.breakdown
      .filter(e => typeof e.quantity === 'number' && e.quantity > 0)
      .map(e => ({
        currency: e.currency,
        quantity: e.quantity,
        value: e.total_divine || 0,
      }));
    const total = entries.reduce((a, b) => a + (b.value || 0), 0) || 1;
    return entries.map(e => ({
      ...e,
      pct: (e.value / total),
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
      // Gray out zero-value slices
      const color = d.value > 0 ? palette[i % palette.length] : '#334155';
      const opacity = d.value > 0 ? 1 : 0.35;
      return { path, color, opacity, labelPos: { x: lx, y: ly }, data: d };
    });
    return { size, segments, cx, cy, total: donut.reduce((a,b)=>a+b.value,0) };
  }, [donut]);

  return (


    <div ref={containerRef} style={{ padding: '10px 14px 60px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ marginTop: 0, marginBottom: 4 }}>Profit Tracker</h2>
          <p style={{ margin: '4px 0 20px', fontSize: 14, opacity: 0.85 }}>
            Automatic snapshots of your portfolio every 15 minutes. Track your total divine value and currency composition over time.
          </p>
        </div>
        <SnapshotStatusBar
          snapshot={snapshot ?? undefined}
          snapshotAge={snapshotAge}
          nextCountdown={nextCountdown}
          loading={loading}
          takeSnapshot={(source: string) => { void takeSnapshot(source as any); }}
        />
      </div>

      {/* Gains Box: Shows profit/loss over selected period */}
      {profitStats && (
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 20,
          marginRight: 1,
          maxWidth: chartWidth
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: profitStats.isPositive ? 'rgba(34,197,94,0.10)' : 'rgba(255,80,80,0.13)',
            border: `1.5px solid ${profitStats.isPositive ? '#4ade80' : '#f87171'}`,
            borderRadius: 8,
            padding: '6px 18px 6px 12px',
            minWidth: 0,
            maxWidth: 240,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            overflow: 'hidden'
          }}>
            <span style={{
              fontSize: 14,
              color: profitStats.isPositive ? '#22c55e' : '#ef4444',
              fontWeight: 700,
              lineHeight: 1,
              marginRight: 8,
              flexShrink: 0
            }}>
              {profitStats.isPositive ? '▲' : '▼'}
            </span>
            <span style={{
              fontSize: 15,
              fontWeight: 600,
              color: profitStats.isPositive ? '#22c55e' : '#ef4444',
              marginRight: 4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 90,
              display: 'inline-block'
            }}>
              {profitStats.isPositive ? '+' : ''}{formatNumber(profitStats.absoluteChange, 2)}
            </span>
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              color: profitStats.isPositive ? '#22c55e' : '#ef4444',
              opacity: 0.85,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 70,
              display: 'inline-block'
            }}>
              ({profitStats.isPositive ? '+' : ''}{formatNumber(profitStats.percentChange, 2)}%)
            </span>
          </div>
        </div>
      )}

      {/* Time Range Picker */}
      <div style={{ marginTop: -6, maxWidth:chartWidth}}>
        <TimeRangePicker
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          showCustomRange={showCustomRange}
          setShowCustomRange={setShowCustomRange}
          customStartDate={customStartDate}
          setCustomStartDate={setCustomStartDate}
          customEndDate={customEndDate}
          setCustomEndDate={setCustomEndDate}
        />
      </div>

      {/* Error message */}
      {error && <div style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>}

      {/* Line Chart: Total Divine Value Over Time */}
      {history && history.snapshots.length > 1 && (
        <div style={{ marginBottom: 34 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12, maxWidth: chartWidth }}>

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
                <text x={points[hoverIdx].x} y={points[hoverIdx].y - 28} fontSize={12} fill="#e2e8f0" textAnchor="middle">{new Date(parseUtcTimestamp(points[hoverIdx].ts)).toLocaleTimeString()}</text>
                <text x={points[hoverIdx].x} y={points[hoverIdx].y - 12} fontSize={15} fill="#3b82f6" fontWeight={700} textAnchor="middle" style={{letterSpacing:0.5}}>{formatNumber(points[hoverIdx].v, 2)} Div</text>
              </g>
            )}
          </svg>
        </div>
      )}

      {/* Donut Chart: Currency Composition Breakdown */}
      {snapshot && donutSvg && donut.length > 0 && (
        <div style={{ marginBottom: 34 }}>
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
                      <div style={{ fontSize:11, opacity:0.7, fontVariantNumeric:'tabular-nums' }}>{formatNumber(d.pct*100, 1)}% • {formatNumber(d.quantity, 0)} {pluralize(d.currency, d.quantity)}</div>
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
                      <text x={seg.labelPos.x} y={seg.labelPos.y+16} textAnchor="middle" fontSize={12} fill="#e2e8f0">{formatNumber(seg.data.quantity, 0)} {pluralize(seg.data.currency, seg.data.quantity)} ({formatNumber(seg.data.pct*100, 1)}%)</text>
                    </g>
                  )}
                </g>
              ))}
              {/* Divine Orbs total with icon */}
              <g transform={`translate(${donutSvg.cx}, ${donutSvg.cy - 18})`}>
                <image 
                  href={`${import.meta.env.BASE_URL}currency/divine.webp`} 
                  x={-50} 
                  y={-12} 
                  width="24" 
                  height="24" 
                />
                <text 
                  x={-20} 
                  y={4} 
                  textAnchor="start" 
                  fontSize={18} 
                  fill="#e2e8f0" 
                  fontWeight={700}
                  style={{letterSpacing:0.5}}
                >
                  {formatNumber(grandTotal, 2)}
                </text>
              </g>
              {/* Mirror equivalent with icon */}
              <g transform={`translate(${donutSvg.cx}, ${donutSvg.cy + 12})`}>
                <image 
                  href={`${import.meta.env.BASE_URL}currency/mirror.webp`} 
                  x={-50} 
                  y={-12} 
                  width="24" 
                  height="24" 
                />
                <text 
                  x={-20} 
                  y={4} 
                  textAnchor="start" 
                  fontSize={16} 
                  fill="#94a3b8" 
                  fontWeight={600}
                  style={{letterSpacing:0.5}}
                >
                  {(() => {
                    const mirrorEntry = snapshot.breakdown.find(b => b.currency.toLowerCase() === 'mirror of kalandra');
                    const divPerMirror = mirrorEntry?.divine_per_unit || 80;
                    return formatNumber((grandTotal ?? 0) / divPerMirror, 2);
                  })()}
                </text>
              </g>
            </svg>
          </div>
        </div>
      )}

      {/* Breakdown table */}
      {snapshot && Array.isArray(snapshot.breakdown) && (
        <BreakdownTable snapshot={snapshot} />
      )}

      {/* Empty state */}
      {!snapshot && !error && <EmptyState />}

      {/* Error display */}
      {error && <ErrorDisplay error={error} />}
    </div>
  );
};

export default ProfitTracker;
