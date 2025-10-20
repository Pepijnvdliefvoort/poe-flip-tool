import { useEffect, useState } from 'react'
import { Api } from '../api'
import type { ConfigData } from '../types'
import { CurrencyIcon } from './CurrencyIcon'

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

    if (!cfg) return <div className="card"><p style={{color: 'var(--muted)'}}>Loading configuration…</p></div>

    return (
        <div className="card">
            <h2>Configuration</h2>

            <div style={{ marginBottom: 24 }}>
                <label className="muted">League</label>
                <select 
                    value={cfg.league} 
                    onChange={(e) => changeLeague(e.target.value)}
                    disabled={saving}
                >
                    <option value="Standard">Standard</option>
                    <option value="Hardcore">Hardcore</option>
                </select>
            </div>

            <div style={{ marginBottom: 24 }}>
                <label className="muted">Trades ({cfg.trades.length})</label>
                {cfg.trades.length > 0 ? (
                    <table>
                        <thead>
                            <tr>
                                <th style={{width: 40}}>#</th>
                                <th>Pay → Get</th>
                                <th style={{width: 80}}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {cfg.trades.map((t, i) => (
                                <tr key={i}>
                                    <td style={{color: 'var(--muted)'}}>{i}</td>
                                    <td>
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: '4px 10px',
                                            background: 'var(--bg-secondary)',
                                            borderRadius: '6px',
                                            fontSize: '13px',
                                            fontWeight: 600
                                        }}>
                                            <CurrencyIcon currency={t.pay} size={18} />
                                            <span style={{ color: 'var(--muted)' }}>→</span>
                                            <CurrencyIcon currency={t.get} size={18} />
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button 
                                            className="btn ghost" 
                                            onClick={() => removePair(i)} 
                                            disabled={saving}
                                            style={{padding: '6px 12px', fontSize: '12px'}}
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p style={{color: 'var(--muted)', fontSize: 14, fontStyle: 'italic'}}>
                        No trade pairs configured. Add one below.
                    </p>
                )}
            </div>

            <div>
                <label className="muted">Add New Trade</label>
                <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                    <input 
                        placeholder="Want (e.g. divine)" 
                        value={get} 
                        onChange={e => setGet(e.target.value)}
                        disabled={saving}
                    />
                    <input 
                        placeholder="Pay (e.g. chaos)" 
                        value={pay} 
                        onChange={e => setPay(e.target.value)}
                        disabled={saving}
                    />
                    <button 
                        className="btn primary" 
                        onClick={addPair} 
                        disabled={saving || !get.trim() || !pay.trim()}
                        style={{width: '100%'}}
                    >
                        {saving ? 'Adding...' : 'Add New Trade'}
                    </button>
                </div>
            </div>
        </div>
    )
}
