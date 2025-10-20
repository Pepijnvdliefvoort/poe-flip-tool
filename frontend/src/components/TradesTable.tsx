import { PairSummary } from '../types'

export function TradesTable({ data, loading }: { data: PairSummary[]; loading: boolean }) {
    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={{ margin: 0 }}>Market Listings</h2>
                {loading && <span className="pill">loading…</span>}
            </div>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Pair</th>
                        <th>Status</th>
                        <th>Best Rate</th>
                        <th>Top Listings</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((p) => (
                        <tr key={p.index}>
                            <td>{p.index}</td>
                            <td><span className="pill">{p.pay} → {p.get}</span></td>
                            <td>{p.status === 'ok' ? <span className="ok">ok</span> : <span className="danger">{p.status}</span>}</td>
                            <td>{p.best_rate ?? '—'}</td>
                            <td>
                                <div className="grid cols-3">
                                    {p.listings.slice(0, 3).map((l, i) => (
                                        <div key={i} className="card" style={{ padding: 8 }}>
                                            <div style={{ fontWeight: 600 }}>{l.rate} {l.have_currency}/{l.want_currency}</div>
                                            <div className="muted">stock: {l.stock ?? '—'}</div>
                                            <div className="muted">seller: {l.seller ?? '—'}</div>
                                            <div className="muted" style={{ fontSize: 12 }}>{l.indexed?.replace('T', ' ').replace('+00:00', '') ?? ''}</div>
                                        </div>
                                    ))}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
