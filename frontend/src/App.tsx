import { useCallback, useEffect, useState, useRef } from 'react'
import './spinner.css'
import { Api } from './api'
import type { TradesResponse, PairSummary } from './types'
import { TradesTable } from './components/TradesTable'
import { ConfigPanel } from './components/ConfigPanel'
import { SystemDashboard } from './components/SystemDashboard'
import ProfitTracker from './components/ProfitTracker'
import { Login } from './components/Login'

// Backend base resolution (same logic as api.ts)
const BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_BACKEND_URL ||
  (typeof location !== 'undefined' && location.hostname.endsWith('github.io')
    ? 'https://poe-flip-backend.fly.dev'
    : 'http://localhost:8000');

// Get API key from env or sessionStorage
const getApiKey = () => import.meta.env.VITE_API_KEY || sessionStorage.getItem('api_key') || '';

// Helper function to calculate profit margins for linked pairs
function calculateProfitMargins(pairs: PairSummary[]): PairSummary[] {
  const result = pairs.map(p => ({ ...p })); // Clone to avoid mutation
  
  for (let i = 0; i < result.length; i++) {
    const pairA = result[i];
    
    // Skip if already calculated or no valid rate
    if (pairA.linked_pair_index != null || pairA.best_rate == null) {
      continue;
    }
    
    // Find the reverse pair
    for (let j = 0; j < result.length; j++) {
      if (i === j) continue;
      
      const pairB = result[j];
      
      // Check if this is the reverse pair (get/pay swapped)
      if (pairA.get === pairB.pay && pairA.pay === pairB.get) {
        if (pairB.best_rate != null && pairB.best_rate > 0) {
          // Link them together
          pairA.linked_pair_index = j;
          pairB.linked_pair_index = i;
          
          // Calculate profit margin
          // pairA: pay X to get Y (rate = Y/X)
          // pairB: pay Y to get X (rate = X/Y)
          // Amount of pairA.get currency we receive per 1 pairA.pay
          const receivePerCycle = pairA.best_rate;
          
          // Amount of pairA.get currency we need to spend to get back 1 pairA.pay
          const spendToGetBack = 1.0 / pairB.best_rate;
          
          // Raw profit in pairA.get currency per 1 pairA.pay spent
          const rawProfit = receivePerCycle - spendToGetBack;
          
          // Percentage profit margin
          const profitPct = spendToGetBack > 0 ? (rawProfit / spendToGetBack * 100) : 0;
          
          pairA.profit_margin_raw = Math.round(rawProfit * 10000) / 10000;
          pairA.profit_margin_pct = Math.round(profitPct * 100) / 100;
          pairB.profit_margin_raw = Math.round(rawProfit * 10000) / 10000;
          pairB.profit_margin_pct = Math.round(profitPct * 100) / 100;
        }
        break;
      }
    }
  }
  
  return result;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [data, setData] = useState<TradesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [topN, setTopN] = useState(5)
  const [autoRefresh, setAutoRefresh] = useState(true) // Auto-refresh enabled by default
  const [rateLimit, setRateLimit] = useState<{ blocked: boolean; block_remaining: number; rules: Record<string, { current: number; limit: number; reset_s: number }[]> } | null>(null)
  const [nearLimit, setNearLimit] = useState(false)
  const [rateLimitDisplay, setRateLimitDisplay] = useState<{ blocked: boolean; block_remaining: number; rules: Record<string, { current: number; limit: number; reset_s: number }[]> } | null>(null)
  const [view, setView] = useState<'trades' | 'system' | 'profit'>('trades')
  const [accountName, setAccountName] = useState<string | null>(null)

  // SSE trades loading
  const eventSourceRef = useRef<EventSource | null>(null)
  const initialLoadRef = useRef(true) // Track if this is the initial load

  // Check if already authenticated on mount
  useEffect(() => {
    const hasToken = !!getApiKey();
    setIsAuthenticated(hasToken);
  }, []);

  const handleLogin = (token: string) => {
    sessionStorage.setItem('api_key', token);
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    // Call logout endpoint to invalidate session
    try {
      await Api.logout();
    } catch (err) {
      console.error('Logout failed:', err);
    }
    sessionStorage.removeItem('api_key');
    setIsAuthenticated(false);
  };

  // Helper to update rate limit info after every API call
  const updateRateLimit = async () => {
    try {
      const status = await Api.rateLimitStatus();
      setRateLimit(status);
      setRateLimitDisplay(status);
      // Near-limit heuristic: treat small windows differently so 1/5 doesn't immediately trigger.
      // Rules:
      // - Ignore expired windows (reset_s <= 0)
      // - For small limits (<= 10): near if current >= ceil(limit * 0.6)
      // - For larger limits: near if utilization >= 0.7 and at least 3 requests used
      const isNearLimit = (r: { current: number; limit: number; reset_s: number }) => {
        if (r.reset_s <= 0 || r.limit <= 0) return false;
        if (r.limit <= 10) {
          // For very small windows require being one request away from the cap (e.g. 4/5, 5/6, 9/10)
          return r.current >= (r.limit - 1) && r.current < r.limit;
        }
        return r.current >= 3 && (r.current / r.limit) >= 0.7 && r.current < r.limit;
      };
      const near = Object.values(status.rules).some(ruleArr => ruleArr.some(isNearLimit));
      setNearLimit(near);
    } catch (e) {
      // ignore
    }
  };

  const load = useCallback((forceRefresh = false) => {
    setLoading(true)
    // Pre-populate results with empty rows for each trade
    Api.getConfig().then(cfg => {
      const emptyResults = (cfg.trades || []).map((t, idx) => ({
        index: idx,
        get: t.get,
        pay: t.pay,
        status: 'loading' as 'loading',
        listings: [],
        best_rate: null,
        count_returned: 0
      }));
      setData({ league: cfg.league, pairs: emptyResults.length, results: emptyResults });
      setAccountName(cfg.account_name || null)
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      // Use force parameter: true for manual refresh, false for initial load
      // Include API key as query param for EventSource (doesn't support headers)
      const apiKey = getApiKey();
      const apiKeyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : '';
      const url = `${BASE}/api/trades/stream?top_n=${topN}&force=${forceRefresh}${apiKeyParam}`;
      const es = new window.EventSource(url);
      eventSourceRef.current = es;
      let league = cfg.league;
      let pairs = emptyResults.length;
      es.onmessage = (event) => {
        const summary = JSON.parse(event.data);
        setData(prev => {
          const results = [...(prev?.results || [])];
          results[summary.index] = summary;
          const arrivedCount = results.filter(r => r.status !== 'loading').length;
          
          // Calculate profit margins if all pairs have arrived
          const updatedResults = (pairs && arrivedCount >= pairs) 
            ? calculateProfitMargins(results)
            : results;
          
          if (pairs && arrivedCount >= pairs) {
            setLoading(false);
          }
          return { league, pairs, results: updatedResults };
        });
        updateRateLimit();
      };
      es.onerror = () => {
        es.close();
        setLoading(false);
        updateRateLimit();
      };
      es.onopen = () => {
        setLoading(true);
        updateRateLimit();
      };
    });
    updateRateLimit();
  }, [topN])

  // Initial load uses cache, subsequent manual refreshes force fresh data
  useEffect(() => { 
    if (initialLoadRef.current) {
      load(false); // Initial load from cache
      initialLoadRef.current = false;
    }
    return () => { eventSourceRef.current?.close() } 
  }, [load])

  // Auto-refresh functionality - poll cache status and refresh expired pairs
  useEffect(() => {
    if (!autoRefresh) return;

    const checkInterval = 60000; // Check every 60 seconds (very conservative)
    
    const checkCacheStatus = async () => {
      try {
        // First check rate limit status
        const rateLimitCheck = await Api.rateLimitStatus();
        
        // Don't auto-refresh if we're blocked or near the limit
        if (rateLimitCheck.blocked) {
          console.log('[Auto-refresh] ⛔ Skipping - currently rate limited');
          return;
        }
        
        // Check if we're near any limit (>10% utilization - very conservative)
        const isNearLimit = (r: { current: number; limit: number; reset_s: number }) => {
          if (r.reset_s <= 0 || r.limit <= 0) return false;
          if (r.limit <= 10) {
            return r.current >= (r.limit - 1) && r.current < r.limit;
          }
          return r.current >= 3 && (r.current / r.limit) >= 0.7 && r.current < r.limit;
        };
        const nearAnyLimit = Object.values(rateLimitCheck.rules).some(ruleArr => 
          ruleArr.some(isNearLimit)
        );
        
        if (nearAnyLimit) {
          console.log('[Auto-refresh] 🐌 Skipping - near rate limit (>10% utilization)');
          return;
        }
        
        const status = await Api.cacheStatus();
        const expiredPairs = status.pairs.filter((p: any) => p.expired);
        
        if (expiredPairs.length > 0 && data) {
          console.log(`[Auto-refresh] 🔄 Found ${expiredPairs.length} expired cache entries, refreshing...`);
          
          // Limit to refreshing max 2 pairs per check to avoid rate limits (very conservative)
          const pairsToRefresh = expiredPairs.slice(0, 2);
          
          for (const pair of pairsToRefresh) {
            // Update UI to show loading
            setData(prev => {
              if (!prev) return prev;
              const results = [...prev.results];
              const p = results[pair.index];
              if (p) {
                results[pair.index] = { ...p, status: 'loading', listings: [], best_rate: null, count_returned: 0 };
              }
              return { ...prev, results };
            });
            
            try {
              const refreshed = await Api.refreshOne(pair.index, topN);
              setData(prev => {
                if (!prev) return prev;
                const results = [...prev.results];
                results[pair.index] = refreshed;
                // Recalculate profit margins after updating this pair
                const updatedResults = calculateProfitMargins(results);
                return { ...prev, results: updatedResults };
              });
            } catch (e) {
              setData(prev => {
                if (!prev) return prev;
                const results = [...prev.results];
                const p = results[pair.index];
                if (p) {
                  results[pair.index] = { ...p, status: 'error' };
                }
                return { ...prev, results };
              });
            }
            
            // Even longer delay between refreshes (3 seconds)
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          
          updateRateLimit();
        }
      } catch (e) {
        console.error('[Auto-refresh] Failed to check cache status:', e);
      }
    };

    const timer = setInterval(checkCacheStatus, checkInterval);
    return () => clearInterval(timer);
  }, [autoRefresh, data, topN])

  const reloadPair = async (index: number) => {
    if (!data) return;
    setData(prev => {
      if (!prev) return prev;
      const results = [...prev.results];
      const p = results[index];
      if (p) {
        results[index] = { ...p, status: 'loading', listings: [], best_rate: null, count_returned: 0 };
      }
      return { ...prev, results };
    });
    try {
      const refreshed = await Api.refreshOne(index, topN);
      setData(prev => {
        if (!prev) return prev;
        const results = [...prev.results];
        results[index] = refreshed;
        // Recalculate profit margins after updating this pair
        const updatedResults = calculateProfitMargins(results);
        return { ...prev, results: updatedResults };
      });
    } catch (e) {
      setData(prev => {
        if (!prev) return prev;
        const results = [...prev.results];
        const p = results[index];
        if (p) {
          results[index] = { ...p, status: 'error' };
        }
        return { ...prev, results };
      });
    }
    updateRateLimit();
  }

  const updateHotStatus = (index: number, hot: boolean) => {
    setData(prev => {
      if (!prev) return prev;
      const results = [...prev.results];
      if (results[index]) {
        results[index] = { ...results[index], hot };
      }
      return { ...prev, results };
    });
  };

  const addNewPair = async (get: string, pay: string) => {
    if (!data) return;
    const newIndex = data.results.length;
    
    // Add placeholder for the new pair
    setData(prev => {
      if (!prev) return prev;
      const results = [...prev.results, {
        index: newIndex,
        get,
        pay,
        hot: false,
        status: 'loading' as const,
        listings: [],
        best_rate: null,
        count_returned: 0
      }];
      return { ...prev, pairs: results.length, results };
    });

    // Fetch data for the new pair
    try {
      const refreshed = await Api.refreshOne(newIndex, topN);
      setData(prev => {
        if (!prev) return prev;
        const results = [...prev.results];
        results[newIndex] = refreshed;
        // Recalculate profit margins after adding new pair
        const updatedResults = calculateProfitMargins(results);
        return { ...prev, results: updatedResults };
      });
    } catch (e) {
      setData(prev => {
        if (!prev) return prev;
        const results = [...prev.results];
        results[newIndex] = { ...results[newIndex], status: 'error' };
        return { ...prev, results };
      });
    }
    updateRateLimit();
  };

  const removePair = (index: number) => {
    setData(prev => {
      if (!prev) return prev;
      const results = prev.results.filter((_, i) => i !== index);
      // Re-index remaining pairs
      const reindexed = results.map((r, i) => ({ ...r, index: i }));
      return { ...prev, pairs: reindexed.length, results: reindexed };
    });
  };

  // Optionally, fallback poll every 30s in case no user actions
  useEffect(() => {
    const interval = setInterval(() => {
      updateRateLimit();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Local countdown for rate limit display (updates every second, resets on API update)
  useEffect(() => {
    if (!rateLimit) return;
    setRateLimitDisplay(rateLimit); // Reset to latest API values
    const interval = setInterval(() => {
      setRateLimitDisplay(prev => {
        if (!prev) return prev;
        const newBlockRemaining = Math.max(0, prev.block_remaining - 1);
        const newRules = { ...prev.rules };
        for (const [rule, arr] of Object.entries(newRules)) {
          newRules[rule] = arr.map(r => ({ ...r, reset_s: Math.max(0, r.reset_s - 1) }));
        }
        return {
          blocked: newBlockRemaining > 0,
          block_remaining: newBlockRemaining,
          rules: newRules
        };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimit]);

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="container">
      <header className="app-header" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
        <div style={{ justifySelf: 'start' }}>
          <h1 style={{ margin: 0 }}>PoE Currency Flip Tool</h1>
        </div>
        <div style={{ justifySelf: 'center', display: 'flex', gap: 8 }}>
          <button
            className={`btn ${view === 'trades' ? 'primary' : 'ghost'}`}
            onClick={() => setView('trades')}
            style={{ padding: '6px 16px', minWidth: 90 }}
          >Trades</button>
          <button
            className={`btn ${view === 'system' ? 'primary' : 'ghost'}`}
            onClick={() => setView('system')}
            style={{ padding: '6px 16px', minWidth: 90 }}
          >System</button>
          <button
            className={`btn ${view === 'profit' ? 'primary' : 'ghost'}`}
            onClick={() => setView('profit')}
            style={{ padding: '6px 16px', minWidth: 90 }}
          >Profit</button>
        </div>
        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 12 }}>
          {rateLimit && (rateLimit.blocked || nearLimit) && (
            <div className={`rate-limit-banner ${rateLimit.blocked ? 'blocked' : 'near'}`} style={{ whiteSpace: 'nowrap' }}>
              {rateLimit.blocked ? (
                <span>Rate limited. {rateLimit.block_remaining.toFixed(1)}s…</span>
              ) : (
                <span>Near limit – throttling.</span>
              )}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="btn ghost"
            style={{ padding: '6px 12px', fontSize: '13px' }}
            title="Logout"
          >
            Logout
          </button>
        </div>
      </header>

      {view === 'trades' ? (
        <div className="main-layout">
          <div className="trades-section">
            <TradesTable data={data?.results || []} loading={loading} onReload={reloadPair} onRefresh={() => load(true)} accountName={accountName} />
          </div>
          <aside className="config-sidebar">
            <ConfigPanel 
              onChanged={() => load(false)} 
              onHotToggled={updateHotStatus} 
              onPairAdded={addNewPair} 
              onPairRemoved={removePair} 
              topN={topN} 
              onTopNChanged={setTopN}
              autoRefresh={autoRefresh}
              onAutoRefreshChanged={setAutoRefresh}
              onAccountNameChanged={setAccountName}
            />
          </aside>
        </div>
      ) : view === 'system' ? (
        <div style={{ padding: '0 12px 40px' }}>
          <SystemDashboard />
        </div>
      ) : (
        <div style={{ padding: '0 12px 40px' }}>
          <ProfitTracker />
        </div>
      )}

      {/* Small rate limit info box, bottom right */}
      {rateLimitDisplay && (
        <div
          style={{
            position: 'fixed',
            right: 18,
            bottom: 14,
            background: 'rgba(30,58,138,0.85)',
            color: '#dbeafe',
            borderRadius: 8,
            fontSize: 12,
            padding: '8px 14px',
            zIndex: 100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            maxWidth: 320
          }}
        >
          <div style={{fontWeight:600, marginBottom:2, display:'flex', alignItems:'center', gap:6}}>
            Rate Limit Info
            <span
              style={{
                display: 'inline-block',
                cursor: 'pointer',
                position: 'relative',
                verticalAlign: 'middle',
                marginLeft: 2
              }}
              tabIndex={0}
              onMouseEnter={e => {
                const tip = e.currentTarget.querySelector('.rate-tooltip') as HTMLElement | null;
                if (tip) tip.style.display = 'block';
              }}
              onMouseLeave={e => {
                const tip = e.currentTarget.querySelector('.rate-tooltip') as HTMLElement | null;
                if (tip) tip.style.display = 'none';
              }}
              onFocus={e => {
                const tip = e.currentTarget.querySelector('.rate-tooltip') as HTMLElement | null;
                if (tip) tip.style.display = 'block';
              }}
              onBlur={e => {
                const tip = e.currentTarget.querySelector('.rate-tooltip') as HTMLElement | null;
                if (tip) tip.style.display = 'none';
              }}
            >
              {/* Modern info SVG icon */}
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{display:'inline',verticalAlign:'middle'}} aria-label="Rate limit info">
                <circle cx="10" cy="10" r="9" fill="#2563eb" stroke="#fbbf24" strokeWidth="2" />
                <text x="10" y="14" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#fbbf24" fontFamily="Arial, sans-serif">i</text>
              </svg>
              <span
                className="rate-tooltip"
                style={{
                  display: 'none',
                  position: 'absolute',
                  left: '50%',
                  bottom: '120%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(30,41,59,0.98)',
                  color: '#fbbf24',
                  padding: '14px 18px',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 500,
                  boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
                  whiteSpace: 'normal',
                  minWidth: 720,
                  maxWidth: 740,
                  zIndex: 9999,
                  border: '1px solid #fbbf24',
                  letterSpacing: '0.01em',
                  lineHeight: 1.6
                }}
              >
                <div style={{marginBottom:8, fontWeight:600, color:'#fbbf24'}}>How Rate Limiting Works</div>
                <div style={{color:'#fbbf24'}}>
                  Path of Exile's API enforces rate limits per IP and account.<br />
                  <span style={{color:'#fde68a'}}>If you approach the limit, requests are slowed (soft throttle).</span><br />
                  <span style={{color:'#fee2e2'}}>If you exceed the limit, requests are blocked until the window resets.</span>
                </div>
                <div style={{margin:'10px 0 0 0', color:'#dbeafe'}}>
                  <b>current/limit</b>: requests made vs allowed<br />
                  <b>(seconds)</b>: time until reset<br />
                  <span style={{color:'#fee2e2'}}>Blocked</span> means you must wait before sending more requests.
                </div>
              </span>
            </span>
          </div>
          {Object.entries(rateLimitDisplay.rules).map(([rule, arr]) => (
            <div key={rule} style={{marginBottom:2}}>
              <span style={{fontWeight:500}}>{rule}:</span>{' '}
              {arr.map((r, i) => (
                <span key={i} style={{marginRight:8}}>
                  {r.current}/{r.limit} ({r.reset_s}s)
                </span>
              ))}
            </div>
          ))}
          {rateLimitDisplay.blocked && (
            <div style={{color:'#fee2e2', fontWeight:500}}>Blocked: {rateLimitDisplay.block_remaining.toFixed(1)}s</div>
          )}
        </div>
      )}
    </div>
  )
}
