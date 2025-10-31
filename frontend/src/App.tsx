import { useCallback, useEffect, useState, useRef } from 'react'
import './spinner.css'
import { Button } from './components/ui/Button';
import { Api } from './api'
import type { TradesResponse, PairSummary } from './types'
import { TradesTable } from './components/TradesTable'
import { ConfigPanel } from './components/ConfigPanel'
import { SystemDashboard } from './components/SystemDashboard'
import ProfitTracker from './components/ProfitTracker'
import { Login } from './components/Login'
import { useAuth } from './hooks/useAuth'
import { useGlobalPolling } from './hooks/useGlobalPolling'
import { BASE, getApiKey } from './utils/apiHelpers'
import { calculateProfitMargins } from './utils/profit'
import { updateRateLimit } from './utils/rateLimit'

import { reloadPair, addNewPair, removePair, updateHotStatus, handleTradeDataUpdate } from './utils/tradeData'


export default function App() {
  const { isAuthenticated, setIsAuthenticated } = useAuth()
  
  // Initialize global polling timers (15-minute intervals for cache refresh and portfolio snapshots)
  useGlobalPolling(isAuthenticated)
  
  const [data, setData] = useState<TradesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [topN, setTopN] = useState(5)
  const [selectedLeague, setSelectedLeague] = useState<string>('Standard');
  // Removed autoRefresh state - no longer needed with global polling
  const [rateLimit, setRateLimit] = useState<{ blocked: boolean; block_remaining: number; rules: Record<string, { current: number; limit: number; reset_s: number }[]> } | null>(null)
  const [nearLimit, setNearLimit] = useState(false)
  const [rateLimitDisplay, setRateLimitDisplay] = useState<{ blocked: boolean; block_remaining: number; rules: Record<string, { current: number; limit: number; reset_s: number }[]> } | null>(null)
  const [view, setView] = useState<'trades' | 'system' | 'profit'>('trades')
  const [accountName, setAccountName] = useState<string | null>(null)

  // SSE trades loading
  const eventSourceRef = useRef<EventSource | null>(null)
  const initialLoadRef = useRef(true) // Track if this is the initial load

  const handleLogin = (token: string) => {
    sessionStorage.setItem('api_key', token);
    setIsAuthenticated(true);
    // Reload the page to initialize the authenticated state
    window.location.reload();
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



  const load = useCallback((forceRefresh = false, leagueOverride?: string) => {
    setLoading(true)
    const leagueToUse = leagueOverride || selectedLeague;
    Api.getConfig(leagueToUse).then(cfg => {
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
      const apiKey = getApiKey();
      const apiKeyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : '';
      const url = `${BASE}/api/trades/stream?top_n=${topN}&force=${forceRefresh}&league=${encodeURIComponent(cfg.league)}${apiKeyParam}`;
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
          const updatedResults = (pairs && arrivedCount >= pairs) 
            ? calculateProfitMargins(results)
            : results;
          if (pairs && arrivedCount >= pairs) {
            setLoading(false);
          }
          return { league, pairs, results: updatedResults };
        });
        updateRateLimit(setRateLimit, setRateLimitDisplay, setNearLimit);
      };
      es.onerror = () => {
        es.close();
        setLoading(false);
        updateRateLimit(setRateLimit, setRateLimitDisplay, setNearLimit);
      };
      es.onopen = () => {
        setLoading(true);
        updateRateLimit(setRateLimit, setRateLimitDisplay, setNearLimit);
      };
    });
    updateRateLimit(setRateLimit, setRateLimitDisplay, setNearLimit);
  }, [topN, selectedLeague])

  // Initial load uses cache, subsequent manual refreshes force fresh data
  useEffect(() => { 
    if (!isAuthenticated) return; // Don't load if not authenticated
    if (initialLoadRef.current) {
      load(false, selectedLeague); // Initial load from cache for selected league
      initialLoadRef.current = false;
    }
    return () => { eventSourceRef.current?.close() } 
  }, [load, isAuthenticated, selectedLeague])


  // Modularized reloadPair
  // Usage: reloadPair(index, data, setData, topN, () => updateRateLimit(setRateLimit, setRateLimitDisplay, setNearLimit))

  // Stable callback for TradesTable data updates
  // Modularized handleTradeDataUpdate

  // Modularized updateHotStatus

  // Modularized addNewPair

  // Modularized removePair

  // Optionally, fallback poll every 30s in case no user actions
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const interval = setInterval(() => {
  updateRateLimit(setRateLimit, setRateLimitDisplay, setNearLimit);
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

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
          <Button
            variant={view === 'trades' ? 'primary' : 'ghost'}
            onClick={() => setView('trades')}
            style={{ minWidth: 90 }}
          >Trades</Button>
          <Button
            variant={view === 'system' ? 'primary' : 'ghost'}
            onClick={() => setView('system')}
            style={{ minWidth: 90 }}
          >System</Button>
          <Button
            variant={view === 'profit' ? 'primary' : 'ghost'}
            onClick={() => setView('profit')}
            style={{ minWidth: 90 }}
          >Profit</Button>
        </div>
        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            variant="ghost"
            onClick={handleLogout}
            style={{ padding: '6px 12px', fontSize: '13px' }}
            title="Logout"
          >
            Logout
          </Button>
        </div>
      </header>

      <div className="main-layout">
        <div className="trades-section">
          {view === 'trades' && (
            <TradesTable 
              data={data?.results || []} 
              loading={loading} 
              onReload={async (index, newPrice) => {
                if (newPrice) {
                  try {
                    await Api.undercut(index, newPrice);
                  } catch (err) {
                    // Optionally handle error (show toast, etc)
                  }
                } else {
                  reloadPair(index, data, setData, topN, () => updateRateLimit(setRateLimit, setRateLimitDisplay, setNearLimit), selectedLeague);
                }
              }} 
              onRefresh={() => load(true)} 
              accountName={accountName} 
              onDataUpdate={(newResults) => handleTradeDataUpdate(newResults, setData)}
              topN={topN}
            />
          )}
          {view === 'system' && (
            <SystemDashboard selectedLeague={selectedLeague} />
          )}
          {view === 'profit' && (
            <ProfitTracker selectedLeague={selectedLeague} />
          )}
        </div>
        <aside className="config-sidebar">
          <ConfigPanel 
            onChanged={() => load(false, selectedLeague)} 
            onHotToggled={(index: number, hot: boolean) => updateHotStatus(index, hot, setData)} 
            onPairAdded={(get: string, pay: string) => addNewPair(get, pay, data, setData, topN, () => updateRateLimit(setRateLimit, setRateLimitDisplay, setNearLimit), selectedLeague)} 
            onPairRemoved={(index: number) => removePair(index, setData)} 
            topN={topN} 
            onTopNChanged={setTopN}
            onAccountNameChanged={setAccountName}
            onLeagueChanged={(league: string) => { setSelectedLeague(league); load(false, league); }}
            selectedLeague={selectedLeague}
          />
        </aside>
      </div>

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
                  {r.current}/{r.limit} ({Math.round(r.reset_s)}s)
                </span>
              ))}
            </div>
          ))}
          {rateLimitDisplay.blocked && (
            <div style={{color:'#fee2e2', fontWeight:500}}>Blocked: {Math.round(rateLimitDisplay.block_remaining)}s</div>
          )}
        </div>
      )}
    </div>
  )
}
