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
          // Replace the placeholder row with the loaded summary
          const results = [...(prev?.results || [])]
          results[summary.index] = summary
          // If all trades have arrived, stop loading
          if (pairs && results.filter(r => r.listings.length > 0).length >= pairs) {
            setLoading(false)
          }
          return {
            league,
            pairs,
            results
          }
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

  return (
    <div className="container">
      <header className="app-header">
        <h1>PoE Flip Tool</h1>
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
          <TradesTable data={data?.results || []} loading={loading} />
        </div>
        <aside className="config-sidebar">
          <ConfigPanel onChanged={load} />
        </aside>
      </div>
    </div>
  )
}
