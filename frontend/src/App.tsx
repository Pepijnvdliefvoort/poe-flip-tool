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
      <div className="row" style={{alignItems:'center', justifyContent:'space-between'}}>
        <h1 style={{margin:0}}>PoE Flip Tool</h1>
        <div className="row" style={{alignItems:'center'}}>
          <label className="muted" style={{marginRight:8}}>Top N</label>
          <input
            type="number"
            min={1}
            max={20}
            value={topN}
            onChange={e=>setTopN(Number(e.target.value) || 5)}
            style={{width:80}}
          />
          <button className="btn secondary" onClick={load} style={{marginLeft:8}}>Load</button>
          <button className="btn" onClick={refresh} style={{marginLeft:8}}>Refresh live</button>
        </div>
      </div>

      <div style={{height:12}}/>

      {data ? (
        <div className="row">
          <div style={{flex:2}}>
            <TradesTable data={data.results} loading={loading} />
          </div>
          <div style={{flex:1}}>
            <ConfigPanel onChanged={load} />
          </div>
        </div>
      ) : (
        <div className="card">No data yet. Click <b>Load</b>.</div>
      )}
    </div>
  )
}
