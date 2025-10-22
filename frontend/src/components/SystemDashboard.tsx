import { useEffect, useState } from 'react'
import { Api } from '../api'
import type { CacheSummary, CacheStatus, HistoryResponse, ConfigData, DatabaseStats } from '../types'

export function SystemDashboard() {
  const [cacheSummary, setCacheSummary] = useState<CacheSummary | null>(null)
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null)
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null)
  const [config, setConfig] = useState<ConfigData | null>(null)
  const [selectedPair, setSelectedPair] = useState<{ have: string; want: string } | null>(null)
  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Fetch base data
  useEffect(() => {
    const load = async () => {
      try {
        const [cfg, summary, status, db] = await Promise.all([
          Api.getConfig(),
          Api.cacheSummary(),
          Api.cacheStatus(),
          Api.databaseStats()
        ])
        setConfig(cfg)
        setCacheSummary(summary)
        setCacheStatus(status)
        setDbStats(db)
        if (!selectedPair && cfg.trades.length > 0) {
          setSelectedPair({ have: cfg.trades[0].pay, want: cfg.trades[0].get })
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load data')
      }
    }
    load()
  }, [])

  // Auto refresh summary/status
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(async () => {
      try {
        const [summary, status, db] = await Promise.all([
          Api.cacheSummary(),
          Api.cacheStatus(),
          Api.databaseStats()
        ])
        setCacheSummary(summary)
        setCacheStatus(status)
        setDbStats(db)
      } catch { /* ignore */ }
    }, 15000)
    return () => clearInterval(id)
  }, [autoRefresh])

  // Fetch history when selection changes
  useEffect(() => {
    const run = async () => {
      if (!selectedPair) return
      setLoadingHistory(true)
      setError(null)
      try {
        const h = await Api.history(selectedPair.have, selectedPair.want, 120)
        setHistory(h)
      } catch (e: any) {
        setError(e.message || 'Failed to load history')
      } finally {
        setLoadingHistory(false)
      }
    }
    run()
  }, [selectedPair])

  const pairs = config?.trades || []

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>System Dashboard</h2>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> Auto refresh (15s)
        </label>
      </div>
      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      {/* Database Stats */}
      <section style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Database Persistence</h3>
        {!dbStats ? <div>Loading database stats…</div> : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, fontSize: 13 }}>
              <Stat label="DB Size" value={formatBytes(dbStats.database_size_bytes)} />
              <Stat label="Cache Entries" value={dbStats.cache_entries} />
              <Stat label="Price Snapshots" value={dbStats.price_snapshots} />
            </div>
            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
              <div><strong>File:</strong> {dbStats.database_file}</div>
              {dbStats.oldest_snapshot && <div><strong>Oldest:</strong> {new Date(dbStats.oldest_snapshot).toLocaleString()}</div>}
              {dbStats.newest_snapshot && <div><strong>Newest:</strong> {new Date(dbStats.newest_snapshot).toLocaleString()}</div>}
            </div>
          </div>
        )}
      </section>

      {/* Cache Summary */}
      <section style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Cache Summary</h3>
        {!cacheSummary ? <div>Loading summary…</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, fontSize: 13 }}>
            <Stat label="TTL (s)" value={cacheSummary.trade_cache.ttl_seconds} />
            <Stat label="Cache Entries" value={cacheSummary.trade_cache.entries} />
            <Stat label="Pairs Tracked" value={cacheSummary.historical.pairs_tracked} />
            <Stat label="Snapshots" value={cacheSummary.historical.total_snapshots} />
            <Stat label="Retention (h)" value={cacheSummary.historical.retention_hours} />
            <Stat label="Max/Pair" value={cacheSummary.historical.max_points_per_pair} />
          </div>
        )}
        {cacheSummary?.trade_cache.soonest_expiry && (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
            Soonest expiry: {new Date(cacheSummary.trade_cache.soonest_expiry).toLocaleTimeString()}
          </div>
        )}
      </section>

      {/* Cache Entries Table */}
      <section style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Cache Entries</h3>
        {!cacheSummary ? <div>Loading entries…</div> : cacheSummary.trade_cache.entries_detail.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.7 }}>No cached entries yet.</div>
        ) : (
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>Have</th>
                  <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>Want</th>
                  <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>Listings</th>
                  <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>Remaining (s)</th>
                  <th style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {cacheSummary.trade_cache.entries_detail.map(entry => (
                  <tr key={entry.have + '_' + entry.want} style={{ cursor: 'pointer' }} onClick={() => setSelectedPair({ have: entry.have, want: entry.want })}>
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>{entry.have}</td>
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>{entry.want}</td>
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>{entry.listing_count}</td>
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)', color: entry.seconds_remaining < 60 ? '#fbbf24' : '#9ca3af' }}>{entry.seconds_remaining}</td>
                    <td style={{ padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>{new Date(entry.expires_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* History Viewer */}
      <section style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0 }}>History</h3>
            <select
              value={selectedPair ? `${selectedPair.have}|${selectedPair.want}` : ''}
              onChange={e => {
                const [have, want] = e.target.value.split('|')
                setSelectedPair({ have, want })
              }}
              style={{ background: 'var(--bg-alt)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12 }}
            >
              {pairs.map((p, i) => (
                <option key={i} value={`${p.pay}|${p.get}`}>{p.pay} → {p.get}</option>
              ))}
            </select>
            {loadingHistory && <span style={{ fontSize: 11, opacity: 0.7 }}>Loading…</span>}
        </div>
        {!history ? (
          <div style={{ fontSize: 13, marginTop: 8 }}>Select a pair to view history.</div>
        ) : history.history.length === 0 ? (
          <div style={{ fontSize: 13, marginTop: 8 }}>No snapshots yet.</div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.8 }}>
              {history.history.length} points | Change: {history.trend.change_percent > 0 ? '+' : ''}{history.trend.change_percent.toFixed(2)}% ({history.trend.direction})
            </div>
            <HistoryMiniChart data={history.history} />
            <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>Time</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>Best</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>Avg</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>Listings</th>
                  </tr>
                </thead>
                <tbody>
                  {history.history.slice().reverse().map((h, i) => (
                    <tr key={i}>
                      <td style={{ padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{new Date(h.timestamp).toLocaleTimeString()}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h.best_rate.toFixed(4)}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h.avg_rate.toFixed(4)}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h.listing_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px 10px', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

function HistoryMiniChart({ data }: { data: { timestamp: string; best_rate: number; avg_rate: number }[] }) {
  if (data.length < 2) return null
  const width = 320
  const height = 80
  const bestSeries = data.map(d => d.best_rate)
  const min = Math.min(...bestSeries)
  const max = Math.max(...bestSeries)
  const range = max - min || 1
  const stepX = width / (data.length - 1)
  const d = bestSeries.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * height
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 4 }}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
    </svg>
  )
}