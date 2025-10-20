import { useCallback, useEffect, useState } from 'react'
import { Api } from './api'
import type { TradesResponse } from './types'
import { TradesTable } from './components/TradesTable'
import { ConfigPanel } from './components/ConfigPanel'

export default function App() {
  const [data, setData] = useState<TradesResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [topN, setTopN] = useState(5)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await Api.getTrades(topN)
      setData(d)
    } finally {
      setLoading(false)
    }
  }, [topN])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const d = await Api.refreshTrades(topN)
      setData(d)
    } finally {
      setLoading(false)
    }
  }, [topN])

  useEffect(() => { load() }, [load])

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
          <button className="btn secondary" onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'Load'}
          </button>
          <button className="btn primary" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh Live'}
          </button>
        </div>
      </header>

      {data ? (
        <div className="main-layout">
          <div className="trades-section">
            <TradesTable data={data.results} loading={loading} />
          </div>
          <aside className="config-sidebar">
            <ConfigPanel onChanged={load} />
          </aside>
        </div>
      ) : (
        <div className="empty-state">
          <p>No data yet. Click <strong>Load</strong> to fetch market data.</p>
        </div>
      )}
    </div>
  )
}
