import { useCallback, useEffect, useState, useRef } from 'react'
import './spinner.css'
import { Api } from './api'
import type { TradesResponse } from './types'
import { TradesTable } from './components/TradesTable'
import { ConfigPanel } from './components/ConfigPanel'

export default function App() {
  const [data, setData] = useState<TradesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [topN, setTopN] = useState(5)
  const [rateLimit, setRateLimit] = useState<{ blocked: boolean; block_remaining: number; rules: Record<string, { current: number; limit: number; reset_s: number }[]> } | null>(null)
  const [nearLimit, setNearLimit] = useState(false)



  // SSE trades loading
  const eventSourceRef = useRef<EventSource | null>(null)
  const load = useCallback(() => {
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
      }))
      setData({ league: cfg.league, pairs: emptyResults.length, results: emptyResults })
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      const url = `/api/trades/stream?top_n=${topN}`
      const es = new window.EventSource(url)
      eventSourceRef.current = es
      let league = cfg.league
      let pairs = emptyResults.length
      es.onmessage = (event) => {
        const summary = JSON.parse(event.data)
        setData(prev => {
          const results = [...(prev?.results || [])]
          results[summary.index] = summary
          // Consider rate_limited or error as "arrived" so loading spinner ends.
          const arrivedCount = results.filter(r => r.status !== 'loading').length
          if (pairs && arrivedCount >= pairs) {
            setLoading(false)
          }
          return { league, pairs, results }
        })
      }
      es.onerror = () => {
        es.close()
        setLoading(false)
      }
      es.onopen = () => {
        setLoading(true)
      }
    })
    // No artificial delay or incremental loading in frontend; backend controls timing
  }, [topN])

  useEffect(() => { load(); return () => { eventSourceRef.current?.close() } }, [load])

  const reloadPair = async (index: number) => {
    if (!data) return
    // Optimistically set loading status for that pair
    setData(prev => {
      if (!prev) return prev
      const results = [...prev.results]
      const p = results[index]
      if (p) {
        results[index] = { ...p, status: 'loading', listings: [], best_rate: null, count_returned: 0 }
      }
      return { ...prev, results }
    })
    try {
      const refreshed = await Api.refreshOne(index, topN)
      setData(prev => {
        if (!prev) return prev
        const results = [...prev.results]
        results[index] = refreshed
        return { ...prev, results }
      })
    } catch (e) {
      setData(prev => {
        if (!prev) return prev
        const results = [...prev.results]
        const p = results[index]
        if (p) {
          results[index] = { ...p, status: 'error' }
        }
        return { ...prev, results }
      })
    }
  }

  // Poll rate limit status every 5s
  useEffect(() => {
    let mounted = true
    const poll = async () => {
      try {
        const status = await Api.rateLimitStatus()
        if (!mounted) return
        setRateLimit(status)
        // Determine near-limit heuristic
        const near = Object.values(status.rules).some(ruleArr => ruleArr.some(r => r.limit > 0 && r.current / r.limit >= 0.8 && r.current < r.limit))
        setNearLimit(near)
      } catch(e) {
        // ignore
      } finally {
        if (mounted) setTimeout(poll, 5000)
      }
    }
    poll()
    return () => { mounted = false }
  }, [])

  return (
    <div className="container">
      <header className="app-header">
        <h1>PoE Currency Flip Tool</h1>
        {rateLimit && (rateLimit.blocked || nearLimit) && (
          <div className={`rate-limit-banner ${rateLimit.blocked ? 'blocked' : 'near'}`}>
            {rateLimit.blocked ? (
              <span>Rate limited. Resuming in {rateLimit.block_remaining.toFixed(1)}s…</span>
            ) : (
              <span>Approaching limit – requests are being throttled.</span>
            )}
          </div>
        )}
        <div className="controls">
          <div className="control-group">
            <label htmlFor="topn-input">Top Results</label>
            <input
              id="topn-input"
              type="number"
              min={1}
              max={20}
              value={topN}
              onChange={e=>setTopN(Number(e.target.value) || 5)}
              className="topn-input"
            />
          </div>
          <button className="btn primary" onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Load Cached'}
          </button>
        </div>
      </header>

      <div className="main-layout">
        <div className="trades-section">
          <TradesTable data={data?.results || []} loading={loading} onReload={reloadPair} />
        </div>
        <aside className="config-sidebar">
          <ConfigPanel onChanged={load} />
        </aside>
      </div>

      {/* Small rate limit info box, bottom right */}
      {rateLimit && (
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
          {Object.entries(rateLimit.rules).map(([rule, arr]) => (
            <div key={rule} style={{marginBottom:2}}>
              <span style={{fontWeight:500}}>{rule}:</span>{' '}
              {arr.map((r, i) => (
                <span key={i} style={{marginRight:8}}>
                  {r.current}/{r.limit} ({r.reset_s}s)
                </span>
              ))}
            </div>
          ))}
          {rateLimit.blocked && (
            <div style={{color:'#fee2e2', fontWeight:500}}>Blocked: {rateLimit.block_remaining.toFixed(1)}s</div>
          )}
        </div>
      )}
    </div>
  )
}
