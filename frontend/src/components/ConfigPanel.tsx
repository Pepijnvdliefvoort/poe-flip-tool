import { useEffect, useState } from 'react'
import { Api } from '../api'
import type { ConfigData } from '../types'

export function ConfigPanel({ onChanged }: { onChanged: () => void }) {
    const [cfg, setCfg] = useState<ConfigData | null>(null)
    const [get, setGet] = useState('divine')
    const [pay, setPay] = useState('chaos')
    const [saving, setSaving] = useState(false)

    useEffect(() => { Api.getConfig().then(setCfg) }, [])

    async function changeLeague(newLeague: string) {
        const next = await Api.patchLeague(newLeague)
        setCfg(next)
        onChanged()
    }

    async function addPair() {
        const g = get.trim()
        const p = pay.trim()
        if (!g || !p) return
        setSaving(true)
        try {
            const next = await Api.patchTrades({ add: [{ get: g, pay: p }] })
            setCfg(next)
            setGet(''); setPay('')
            onChanged()
        } finally { setSaving(false) }
    }

    async function removePair(idx: number) {
        setSaving(true)
        try {
            const next = await Api.patchTrades({ remove_indices: [idx] })
            setCfg(next)
            onChanged()
        } finally { setSaving(false) }
    }

    if (!cfg) return <div className="card">Loading config…</div>

    return (
        <div className="card">
            <h2 style={{ marginTop: 0 }}>Config</h2>

            <div className="row" style={{ alignItems: 'center' }}>
                <div>
                    <div className="muted" style={{ marginBottom: 6 }}>League</div>
                    <select value={cfg.league} onChange={(e) => changeLeague(e.target.value)}>
                        <option value="Standard">Standard</option>
                        <option value="Hardcore">Hardcore</option>
                        <option value="SSF Standard">SSF Standard</option>
                        <option value="SSF Hardcore">SSF Hardcore</option>
                    </select>
                </div>
            </div>

            <div style={{ height: 12 }} />

            <div>
                <div className="muted" style={{ marginBottom: 6 }}>Trades</div>
                <table>
                    <thead>
                        <tr><th>#</th><th>Pair</th><th></th></tr>
                    </thead>
                    <tbody>
                        {cfg.trades.map((t, i) => (
                            <tr key={i}>
                                <td>{i}</td>
                                <td><span className="pill">{t.pay} → {t.get}</span></td>
                                <td style={{ textAlign: 'right' }}>
                                    <button className="btn ghost" onClick={() => removePair(i)} disabled={saving}>Remove</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ height: 12 }} />

            <div className="row">
                <input placeholder="get e.g. divine" value={get} onChange={e => setGet(e.target.value)} />
                <input placeholder="pay e.g. chaos" value={pay} onChange={e => setPay(e.target.value)} />
                <button className="btn" onClick={addPair} disabled={saving}>Add pair</button>
            </div>
        </div>
    )
}
