import { useEffect, useState } from 'react'
import { Api } from '../api'
import type { ConfigData } from '../types'
import { CurrencyIcon } from './CurrencyIcon'

export function ConfigPanel({ onChanged, onHotToggled }: { onChanged: () => void; onHotToggled?: (index: number, hot: boolean) => void }) {
    const [cfg, setCfg] = useState<ConfigData | null>(null)
    const [get, setGet] = useState('')
    const [pay, setPay] = useState('')
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

    async function toggleHot(idx: number) {
        if (!cfg) return
        setSaving(true)
        try {
            const updatedTrades = cfg.trades.map((t, i) => 
                i === idx ? { ...t, hot: !t.hot } : t
            )
            const next = await Api.putConfig({ ...cfg, trades: updatedTrades })
            setCfg(next)
            // Update the parent's data state without reloading all trades
            if (onHotToggled && next.trades[idx]) {
                onHotToggled(idx, next.trades[idx].hot ?? false)
            }
        } finally { 
            setSaving(false) 
        }
    }

    if (!cfg) return <div className="card"><p style={{color: 'var(--muted)'}}>Loading…</p></div>

    return (
        <div className="card" style={{ fontSize: '14px' }}>
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Config</h2>

            {/* League selector - compact */}
            <div style={{ marginBottom: 16 }}>
                <label className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>League</label>
                <select 
                    value={cfg.league} 
                    onChange={(e) => changeLeague(e.target.value)}
                    disabled={saving}
                    style={{ fontSize: '13px', padding: '6px 8px' }}
                >
                    <option value="Standard">Standard</option>
                    <option value="Hardcore">Hardcore</option>
                </select>
            </div>

            {/* Trade pairs list - compact */}
            <div style={{ marginBottom: 16 }}>
                <label className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>
                    Pairs ({cfg.trades.length})
                </label>
                {cfg.trades.length > 0 ? (
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr', 
                        gridAutoFlow: 'column',
                        gridTemplateRows: `repeat(${Math.ceil(cfg.trades.length / 2)}, auto)`,
                        gap: '8px' 
                    }}>
                        {cfg.trades.map((t, i) => (
                            <div 
                                key={i} 
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 8px',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    fontSize: '12px'
                                }}
                            >
                                <span style={{ color: 'var(--muted)', fontSize: '11px', width: '14px', flexShrink: 0 }}>{i + 1}</span>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    flex: 1,
                                    minWidth: 0
                                }}>
                                    <CurrencyIcon currency={t.pay} size={16} />
                                    <span style={{ color: 'var(--muted)', fontSize: '11px' }}>→</span>
                                    <CurrencyIcon currency={t.get} size={16} />
                                </div>
                                <button
                                    onClick={() => toggleHot(i)}
                                    disabled={saving}
                                    style={{
                                        padding: '2px 5px',
                                        fontSize: '13px',
                                        background: t.hot ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.1)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        transition: 'background 0.3s ease',
                                        flexShrink: 0,
                                        lineHeight: 1.2
                                    }}
                                    title={t.hot ? "Hot" : "Cold"}
                                >
                                    {t.hot ? '🔥' : '❄️'}
                                </button>
                                <button 
                                    onClick={() => removePair(i)} 
                                    disabled={saving}
                                    style={{
                                        padding: '2px 5px',
                                        fontSize: '11px',
                                        background: 'transparent',
                                        border: '1px solid var(--border)',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        color: 'var(--muted)',
                                        flexShrink: 0,
                                        lineHeight: 1.2,
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                                        e.currentTarget.style.color = '#ef4444';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.borderColor = 'var(--border)';
                                        e.currentTarget.style.color = 'var(--muted)';
                                    }}
                                    title="Remove"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p style={{color: 'var(--muted)', fontSize: 12, fontStyle: 'italic', margin: '8px 0'}}>
                        No trades yet
                    </p>
                )}
            </div>

            {/* Add new trade - compact */}
            <div>
                <label className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>
                    Add Trade
                </label>
                <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                    <input 
                        placeholder="Want (e.g. divine)" 
                        value={get} 
                        onChange={e => setGet(e.target.value)}
                        disabled={saving}
                        style={{ fontSize: '13px', padding: '6px 8px' }}
                    />
                    <input 
                        placeholder="Pay (e.g. chaos)" 
                        value={pay} 
                        onChange={e => setPay(e.target.value)}
                        disabled={saving}
                        style={{ fontSize: '13px', padding: '6px 8px' }}
                    />
                    <button 
                        className="btn primary" 
                        onClick={addPair} 
                        disabled={saving || !get.trim() || !pay.trim()}
                        style={{width: '100%', fontSize: '13px', padding: '8px'}}
                    >
                        {saving ? 'Adding...' : '+ Add'}
                    </button>
                </div>
            </div>
        </div>
    )
}
