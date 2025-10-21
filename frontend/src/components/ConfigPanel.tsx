import { useEffect, useState } from 'react'
import { Api } from '../api'
import type { ConfigData } from '../types'
import { CurrencyIcon } from './CurrencyIcon'

export function ConfigPanel({ 
    onChanged, 
    onHotToggled, 
    onPairAdded, 
    onPairRemoved, 
    topN, 
    onTopNChanged,
    autoRefresh,
    onAutoRefreshChanged
}: { 
    onChanged: () => void; 
    onHotToggled?: (index: number, hot: boolean) => void;
    onPairAdded?: (get: string, pay: string) => void;
    onPairRemoved?: (index: number) => void;
    topN: number;
    onTopNChanged: (value: number) => void;
    autoRefresh: boolean;
    onAutoRefreshChanged: (value: boolean) => void;
}) {
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
            // Call the new callback instead of reloading everything
            if (onPairAdded) {
                onPairAdded(g, p)
            }
        } finally { setSaving(false) }
    }

    async function removePair(idx: number) {
        setSaving(true)
        try {
            const next = await Api.patchTrades({ remove_indices: [idx] })
            setCfg(next)
            // Just remove from UI, don't reload
            if (onPairRemoved) {
                onPairRemoved(idx)
            }
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

            {/* League selector and Top Results - side by side */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                    <label className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>League</label>
                    <select 
                        value={cfg.league} 
                        onChange={(e) => changeLeague(e.target.value)}
                        disabled={saving}
                        style={{ fontSize: '13px', padding: '6px 8px', width: '100%' }}
                    >
                        <option value="Standard">Standard</option>
                        <option value="Hardcore">Hardcore</option>
                    </select>
                </div>
                <div style={{ flex: 1 }}>
                    <label className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Top Results</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
                        <input
                            id="topn-input"
                            type="number"
                            min={1}
                            max={20}
                            value={topN}
                            onChange={e => onTopNChanged(Number(e.target.value) || 5)}
                            style={{ fontSize: '13px', padding: '6px 8px', flex: 1, textAlign: 'center', paddingRight: '32px' }}
                        />
                        <div style={{ 
                            position: 'absolute', 
                            right: 0, 
                            top: 0, 
                            bottom: 0, 
                            display: 'flex', 
                            flexDirection: 'column',
                            width: '24px'
                        }}>
                            <button
                                onClick={() => {
                                    const input = document.getElementById('topn-input') as HTMLInputElement;
                                    if (input) input.stepUp();
                                    onTopNChanged(Number(input.value) || 1);
                                }}
                                style={{
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px 6px 0 0',
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    padding: 0,
                                    borderBottom: '0.5px solid var(--border)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--border)';
                                    e.currentTarget.style.borderBottom = '0.5px solid var(--border)';
                                }}
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(156, 163, 175, 0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="18,15 12,9 6,15"></polyline>
                                </svg>
                            </button>
                            <button
                                onClick={() => {
                                    const input = document.getElementById('topn-input') as HTMLInputElement;
                                    if (input) input.stepDown();
                                    onTopNChanged(Number(input.value) || 20);
                                }}
                                style={{
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '0 0 6px 6px',
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    padding: 0,
                                    borderTop: '0.5px solid var(--border)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--border)';
                                    e.currentTarget.style.borderTop = '0.5px solid var(--border)';
                                }}
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(156, 163, 175, 0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6,9 12,15 18,9"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Auto-refresh controls */}
            <div style={{ marginBottom: 16, padding: '12px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => onAutoRefreshChanged(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Auto-refresh expired trades</span>
                </label>
                <div className="muted" style={{ fontSize: '11px', marginTop: '6px', marginLeft: '24px' }}>
                    Checks every 60s, refreshes max 2 pairs at a time (respects rate limits)
                </div>
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
                                        background: t.hot ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                                        border: '1px solid var(--border)',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        flexShrink: 0,
                                        lineHeight: 1.2,
                                        opacity: t.hot ? 1 : 0.4,
                                        filter: t.hot ? 'none' : 'grayscale(0.7)',
                                        position: 'relative'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!t.hot) {
                                            e.currentTarget.style.opacity = '0.7';
                                            e.currentTarget.style.transform = 'scale(1.05)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!t.hot) {
                                            e.currentTarget.style.opacity = '0.4';
                                            e.currentTarget.style.transform = 'scale(1)';
                                        }
                                    }}
                                    title={t.hot ? "Mark as normal" : "Mark as hot (priority)"}
                                >
                                    🔥
                                    {!t.hot && (
                                        <span style={{ 
                                            position: 'absolute', 
                                            top: '-2px', 
                                            right: '2px', 
                                            fontSize: '10px',
                                            opacity: 0.5
                                        }}>
                                            💨
                                        </span>
                                    )}
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
