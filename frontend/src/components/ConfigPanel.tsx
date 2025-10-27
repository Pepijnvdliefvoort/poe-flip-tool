import React, { useEffect, useState, useRef } from 'react'
import { Card } from './ui/Card';

import { Api } from '../api'
import type { ConfigData } from '../types'
import { CurrencyIcon } from './CurrencyIcon'
import { useAuth } from '../hooks/useAuth'
import { changeLeague, addPair, removePair, toggleHot, useDebouncedAccountNameSave } from '../utils/configPanelUtils';
import TopResultsInput from './configPanel/TopResultsInput';
import AccountNameInput from './configPanel/AccountNameInput';
import TradePairsList from './configPanel/TradePairsList';
import AddTradeForm from './configPanel/AddTradeForm';
import { ForumThreadLink } from './ForumThreadLink';

export function ConfigPanel({ 
    onChanged, 
    onHotToggled, 
    onPairAdded, 
    onPairRemoved, 
    topN, 
    onTopNChanged,
    onAccountNameChanged
}: any) {
    const { isAuthenticated } = useAuth()
    const [cfg, setCfg] = useState<ConfigData | null>(null)
    const [get, setGet] = useState('')
    const [pay, setPay] = useState('')
    const [saving, setSaving] = useState(false)
    const [accountNameDraft, setAccountNameDraft] = useState('')
    const [accountNameSaving, setAccountNameSaving] = useState(false)

    // Use modularized debounced account name save
    useDebouncedAccountNameSave(cfg, accountNameDraft, setCfg, setAccountNameSaving, onAccountNameChanged);

    useEffect(() => { 
        if (!isAuthenticated) return
        
        Api.getConfig().then(c => { 
            setCfg(c)
            setAccountNameDraft(c.account_name || '')
        }) 
    }, [isAuthenticated])


    if (!cfg) return <Card><p style={{color: 'var(--muted)'}}>Loading…</p></Card>


    return (
        <Card style={{ fontSize: '14px' }}>
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Config</h2>


            {/* League selector and Top Results - side by side */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                    <label className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>League</label>
                    <select 
                        value={cfg.league} 
                        onChange={(e) => changeLeague(e.target.value, setCfg, onChanged)}
                        disabled={saving}
                        style={{ fontSize: '13px', padding: '6px 8px', width: '100%' }}
                    >
                        <option value="Standard">Standard</option>
                        <option value="Hardcore">Hardcore</option>
                    </select>
                </div>
                <TopResultsInput topN={topN} onTopNChanged={onTopNChanged} />
            </div>
            
            <ForumThreadLink />

            {/* Account Name for Highlighting */}
            <AccountNameInput accountNameDraft={accountNameDraft} setAccountNameDraft={setAccountNameDraft} accountNameSaving={accountNameSaving} />

            {/* Trade pairs list - compact */}
            <TradePairsList trades={cfg.trades} cfg={cfg} setCfg={setCfg} setSaving={setSaving} onHotToggled={onHotToggled} onPairRemoved={onPairRemoved} saving={saving} toggleHot={toggleHot} removePair={removePair} />

            {/* Add new trade - compact */}
            <AddTradeForm get={get} setGet={setGet} pay={pay} setPay={setPay} saving={saving} addPair={addPair} setCfg={setCfg} onPairAdded={onPairAdded} />

    </Card>
    )
}

