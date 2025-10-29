import React, { useState, useEffect, useRef } from 'react';
import './CollapsiblePair.css';
import CountdownBar from './CountdownBar';
import { createPortal } from 'react-dom';
import { formatRate, formatNumberEU } from '../../utils/format';
import { PairSummary, PriceTrend } from '../../types';
import { gcd, toReducedFraction, getFractionUndercut } from '../../utils/tradePriceUtils';
import Sparkline from './Sparkline';
import { Api } from '../../api';
import { CurrencyIcon } from '../CurrencyIcon';

// Props type for CollapsiblePair
interface CollapsiblePairProps {
  pair: PairSummary;
  defaultExpanded: boolean;
  loading: boolean;
  onReload: (index: number, newPrice?: string) => Promise<any> | void;
  globalMaxAbsDelta: number;
  accountName?: string | null;
  selectedMetrics: readonly string[];
}



const CollapsiblePair: React.FC<CollapsiblePairProps> = ({ pair, defaultExpanded, loading, onReload, globalMaxAbsDelta, accountName, selectedMetrics }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Local state for trend (sparkline) data
  const [trend, setTrend] = useState<PriceTrend | null | undefined>(pair.trend);

  // Fetch trend data if missing
  useEffect(() => {
    let cancelled = false;
    if (!trend || !trend.sparkline || trend.sparkline.length < 2) {
      Api.history(pair.pay, pair.get, 30)
        .then((res) => {
          if (!cancelled) setTrend(res.trend);
        })
        .catch(() => { });
    } else {
      setTrend(trend); // ensure state is set if already present
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair.pay, pair.get]);
  // Timer state for undercut refresh countdown
  const [refreshCountdown, setRefreshCountdown] = useState(0);
  const [undercutDialogOpen, setUndercutDialogOpen] = useState(false);
  let bestRate = pair.best_rate ?? 1;
  let bestRateFraction = '';
  if (pair.best_rate && pair.pay && pair.get) {
    const display = formatRate(pair.best_rate, pair.pay, pair.get);
    const m = display.match(/^1\/(\d+)$/);
    if (m) {
      bestRateFraction = display;
      const denom = parseInt(m[1], 10);
      if (denom > 1) {
        bestRate = 1 / denom;
      }
    }
  }
  let myIndex = -1;
  let myRate: number | null = null;
  let nextBestRate: number | null = null;
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
    if (myIndex === 0 && pair.listings.length > 1) {
      nextBestRate = pair.listings[1].rate;
    }
  }
  let defaultNewPrice = String(bestRate);
  let defaultFraction = '';
  const bestFractionMatch = bestRateFraction.match(/^1\/(\d+)$/);
  if (myIndex === 0 && nextBestRate != null && Number.isFinite(nextBestRate)) {
    const asFraction = (() => {
      if (nextBestRate > 0 && nextBestRate < 1) {
        const denom = Math.round(1 / nextBestRate);
        if (Math.abs(nextBestRate - 1 / denom) < 1e-8) {
          return denom;
        }
      }
      return null;
    })();
    if (asFraction) {
      defaultNewPrice = `1/${asFraction + 1}`;
      defaultFraction = `1/${asFraction + 1}`;
    } else if (nextBestRate > 1 && nextBestRate % 1 !== 0) {
      const frac = getFractionUndercut(nextBestRate, bestRateFraction, pair.listings || []);
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
      const frac = getFractionUndercut(nextBestRate, bestRateFraction, pair.listings || []);
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
  } else if (bestFractionMatch) {
    const denom = parseInt(bestFractionMatch[1], 10);
    defaultNewPrice = `1/${denom + 1}`;
    defaultFraction = `1/${denom + 1}`;
  } else if (myIndex === -1) {
    if (Number.isFinite(bestRate) && bestRate > 1 && bestRate % 1 !== 0) {
      const frac = getFractionUndercut(bestRate, bestRateFraction, pair.listings || []);
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
      const frac = getFractionUndercut(bestRate, bestRateFraction, pair.listings || []);
      if (frac) {
        defaultNewPrice = frac.value;
        defaultFraction = frac.display;
      } else {
        defaultNewPrice = '';
        defaultFraction = '';
      }
    }
  } else if (myIndex > 0) {
    let userDenom: number | null = null;
    if (typeof myRate === 'number' && myRate > 0 && myRate < 1) {
      const d = Math.round(1 / myRate);
      if (Math.abs(myRate - 1 / d) < 1e-8) userDenom = d;
    }
    let bestDenom: number | null = null;
    if (typeof bestRate === 'number' && bestRate > 0 && bestRate < 1) {
      const d = Math.round(1 / bestRate);
      if (Math.abs(bestRate - 1 / d) < 1e-8) bestDenom = d;
    }
    if (bestDenom !== null && pair.listings) {
      const usedDenoms = new Set<number>();
      for (const l of pair.listings) {
        if (l.rate > 0 && l.rate < 1) {
          const d = Math.round(1 / l.rate);
          if (Math.abs(l.rate - 1 / d) < 1e-8) {
            usedDenoms.add(d);
          }
        }
      }
      let startDenom = Math.max(bestDenom, userDenom ?? 0) + 1;
      while (usedDenoms.has(startDenom)) {
        startDenom++;
      }
      defaultNewPrice = `1/${startDenom}`;
      defaultFraction = `1/${startDenom}`;
    } else if (Number.isFinite(bestRate) && bestRate > 1 && bestRate % 1 !== 0) {
      const frac = getFractionUndercut(bestRate, bestRateFraction, pair.listings || []);
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
      const frac = getFractionUndercut(bestRate, bestRateFraction, pair.listings || []);
      if (frac) {
        defaultNewPrice = frac.value;
        defaultFraction = frac.display;
      } else {
        defaultNewPrice = '';
        defaultFraction = '';
      }
    }
  }

  const [newPrice, setNewPrice] = useState(String(defaultNewPrice));
  const [fraction, setFraction] = useState(defaultFraction);

  useEffect(() => {
    if (undercutDialogOpen) {
      setNewPrice(String(defaultNewPrice));
      setFraction(defaultFraction);
    }
  }, [undercutDialogOpen, defaultNewPrice, defaultFraction]);
  const [undercutLoading, setUndercutLoading] = useState(false);
  const [undercutResult, setUndercutResult] = useState<string | null>(null);
  const [undercutMenuPos, setUndercutMenuPos] = useState<{ top: number, left: number } | null>(null);
  const undercutBtnRef = useRef<HTMLButtonElement | null>(null);

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
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setUndercutDialogOpen(false);
        setUndercutResult(null);
        setUndercutMenuPos(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [undercutDialogOpen]);

  useEffect(() => {
    if (!undercutDialogOpen && undercutMenuPos !== null) {
      setUndercutMenuPos(null);
    }
  }, [undercutDialogOpen]);

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
  // Animation state for border highlight
  const [highlighted, setHighlighted] = useState(false);
  // Detect scroll into view and trigger highlight
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handle = () => {
      setHighlighted(true);
      setTimeout(() => setHighlighted(false), 1200);
    };
    // Listen for focus (from scrollIntoView+focus) to trigger highlight
    node.addEventListener('focus', handle);
    return () => {
      node.removeEventListener('focus', handle);
    };
  }, []);
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
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
    }
    navigator.clipboard.writeText(whisper)
    setCopiedIndex(index)
    timeoutRef.current = window.setTimeout(() => {
      setCopiedIndex(null)
      timeoutRef.current = null
    }, 1250)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

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

  const profitMarginRaw = pair.profit_margin_raw ?? null;
  const profitMarginPct = pair.profit_margin_pct ?? null;

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

  const handleHeaderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('.pair-controls button')) return;
    setIsExpanded(v => !v);
  };

  return (
    <div
      ref={containerRef}
      id={`pair-${pair.pay}-${pair.get}`}
      tabIndex={-1}
      style={{ position: 'relative', maxWidth: '100%', overflow: 'hidden', outline: 'none' }}
    >
      <div
        className={`pair-card${highlighted ? ' highlight-border' : ''}`}
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
                  {trend && trend.sparkline && trend.sparkline.length >= 2 ? (
                    <>
                      <Sparkline values={trend.sparkline} width={70} relativeFirst={true} globalMaxAbsDelta={globalMaxAbsDelta} adaptive={true} visualCapPct={40} haveCurrency={pair.pay} wantCurrency={pair.get} />
                      <span style={{ fontSize: '11px', minWidth: 10, textAlign: 'right', color: trend.direction === 'up' ? '#ef4444' : trend.direction === 'down' ? '#10b981' : '#6b7280', whiteSpace: 'nowrap', marginLeft: 4 }}>
                        {trend.change_percent > 0 ? '+' : ''}{formatNumberEU(trend.change_percent, 1, 1)}%
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
              {/* Show player position if present */}
              {myIndex >= 0 && (
                <span className="player-position" style={{
                  marginLeft: 8,
                  fontWeight: 600,
                  color: 'var(--info, #2563eb)',
                  fontSize: '13px',
                  background: 'rgba(37,99,235,0.08)',
                  borderRadius: 4,
                  padding: '1px 6px'
                }}
                  title="Your position in the list"
                >
                  #{myIndex + 1}
                </span>
              )}
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
                    const btnRect = undercutBtnRef.current.getBoundingClientRect();
                    // Calculate position relative to document, not viewport
                    const scrollY = window.scrollY || window.pageYOffset;
                    const scrollX = window.scrollX || window.pageXOffset;
                    const top = btnRect.bottom + 8 + scrollY;
                    const left = btnRect.left + scrollX;
                    setUndercutMenuPos({ top, left });
                  }
                  setUndercutDialogOpen(true);
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}
              >
                {/* Dollar icon SVG */}
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                  <circle cx="10" cy="10" r="8" stroke="#f59e42" strokeWidth="2" fill="none" />
                  <path d="M10 5v10" stroke="#f59e42" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M13 7.5c0-1.1-1.3-2-3-2s-3 .9-3 2c0 1.1 1.3 2 3 2s3 .9 3 2-1.3 2-3 2-3-.9-3-2" stroke="#f59e42" strokeWidth="1.5" fill="none" />
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

        {undercutDialogOpen && undercutMenuPos && createPortal(
          <div
            id="undercut-menu"
            style={{
              position: 'absolute',
              top: undercutMenuPos.top,
              left: undercutMenuPos.left,
              zIndex: 9999,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 20,
              minWidth: 280,
              boxShadow: '0 4px 24px #000b',
              color: 'var(--text)',
              fontSize: 15,
              transition: 'box-shadow 0.2s',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              New price
              <input
                id="collapsiblepair-newprice"
                name="newprice"
                type="text"
                value={(() => {
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
                style={{
                  width: 90,
                  fontSize: 15,
                  marginLeft: 10,
                  marginRight: 6,
                  background: 'var(--bg-secondary)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
              />
              {pair.pay}
            </div>

            {/* Countdown bar spanning the menu */}
            {(refreshCountdown > 0 || (refreshCountdown === 0 && undercutDialogOpen && undercutResult && undercutResult.startsWith('Success'))) && (
              <div style={{ width: '100%', padding: '8px 0 12px 0' }}>
                <CountdownBar
                  total={10}
                  current={Math.max(refreshCountdown, 0)}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button
                disabled={
                  refreshCountdown > 0 ||
                  undercutLoading ||
                  (
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
                className="btn primary"
                style={{
                  minWidth: 90,
                  padding: '8px 0',
                  fontSize: 15,
                  borderRadius: 6,
                  pointerEvents: 'auto',
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
                }}
                onClick={async () => {
                  setUndercutLoading(true);
                  setUndercutResult(null);
                  setRefreshCountdown(10); // Start at full
                  let timer: NodeJS.Timeout | null = null;
                  try {
                    const rateToSend = (fraction && fraction !== '1' && fraction !== '1/1') ? fraction : newPrice.toString();
                    await onReload(pair.index, rateToSend);
                    setUndercutResult('Success!');
                    setRefreshCountdown(prev => prev - 1);
                    timer = setInterval(() => {
                      setRefreshCountdown(prev => {
                        if (prev <= 1) {
                          clearInterval(timer!);
                          setTimeout(() => {
                            setRefreshCountdown(0);
                            setUndercutDialogOpen(false);
                            setUndercutMenuPos(null);
                            setUndercutResult(null);
                            onReload(pair.index);
                          }, 1000);
                          return 0;
                        }
                        return prev - 1;
                      });
                    }, 1000);
                  } catch (err: any) {
                    setUndercutResult('Failed: ' + (err?.message || 'Unknown error'));
                    setRefreshCountdown(0);
                  } finally {
                    setUndercutLoading(false);
                  }
                }}
              >
                {'Confirm'}
              </button>
              <button
                disabled={undercutLoading}
                className="btn secondary"
                style={{
                  minWidth: 90,
                  padding: '8px 0',
                  fontSize: 15,
                  borderRadius: 6,
                }}
                onClick={() => { setUndercutDialogOpen(false); setUndercutResult(null); setUndercutMenuPos(null); }}
              >
                Cancel
              </button>
            </div>
            {undercutResult && (
              <div style={{ marginTop: 6, color: undercutResult.startsWith('Success') ? '#10b981' : '#ef4444', fontWeight: 500 }}>
                {undercutResult.startsWith('Success') ? (
                  <>
                    {undercutResult}
                  </>
                ) : undercutResult}
              </div>
            )}
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
                      const sourceNames = accountName && accountName.length > 0 ? accountName : (import.meta.env.VITE_ACCOUNT_NAME || '')
                      const rawNames: string[] = sourceNames
                        .split(',')
                        .map((s: string) => s.trim())
                        .filter((val: string) => !!val)
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
};

export default CollapsiblePair;