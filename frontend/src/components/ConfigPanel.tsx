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
    onAccountNameChanged,
    onLeagueChanged,
    selectedLeague: externalSelectedLeague
}: any) {
    const { isAuthenticated } = useAuth()
    const [cfg, setCfg] = useState<ConfigData | null>(null)
    const [get, setGet] = useState('')
    const [pay, setPay] = useState('')
    const [saving, setSaving] = useState(false)
    const [threadIdDraft, setThreadIdDraft] = useState<string>('');
    const [threadIdSaving, setThreadIdSaving] = useState(false);
    const threadIdSaveTimeout = useRef<NodeJS.Timeout | null>(null);
    const [accountNameDraft, setAccountNameDraft] = useState('')
    const [accountNameSaving, setAccountNameSaving] = useState(false)

    // Use modularized debounced account name save
    useDebouncedAccountNameSave(cfg, accountNameDraft, setCfg, setAccountNameSaving, onAccountNameChanged);


    // Track selected league in state for full refresh
    const [selectedLeague, setSelectedLeague] = useState<string>(externalSelectedLeague || 'Standard');
    const initialLoad = useRef(true);

    useEffect(() => {
        if (!isAuthenticated) return;
        // On initial load, fetch config without league to get last selected league
        if (initialLoad.current) {
            Api.getConfig().then(c => {
                setCfg(c);
                setAccountNameDraft(c.account_name || '');
                setThreadIdDraft(c.thread_id || '');
                setSelectedLeague(c.league || 'Standard');
                if (onLeagueChanged) onLeagueChanged(c.league || 'Standard');
                initialLoad.current = false;
            });
        } else {
            Api.getConfig(selectedLeague).then(c => {
                setCfg(c);
                setAccountNameDraft(c.account_name || '');
                setThreadIdDraft(c.thread_id || '');
            });
        }
    }, [isAuthenticated, selectedLeague]);

    // Auto-save thread_id on change or blur
    const saveThreadId = (newThreadId: string) => {
        if (!cfg) return;
        setThreadIdSaving(true);
        // Always provide required fields for ConfigData
        Api.putConfig({
            league: cfg.league,
            trades: cfg.trades,
            account_name: cfg.account_name,
            thread_id: newThreadId
        })
            .then(saved => {
                setCfg(saved);
                setThreadIdDraft(saved.thread_id || '');
            })
            .finally(() => setThreadIdSaving(false));
    };

    const handleThreadIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/\D/g, '');
        setThreadIdDraft(value);
        if (threadIdSaveTimeout.current) clearTimeout(threadIdSaveTimeout.current);
        threadIdSaveTimeout.current = setTimeout(() => saveThreadId(value), 600);
    };

    const handleThreadIdBlur = () => {
        if (threadIdSaveTimeout.current) clearTimeout(threadIdSaveTimeout.current);
        saveThreadId(threadIdDraft);
    };


    if (!cfg) return <Card><p style={{color: 'var(--muted)'}}>Loading…</p></Card>


    return (
        <Card style={{ fontSize: '14px' }}>
            <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Config</h2>

            {/* League selector and Top Results - side by side */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                    <label className="muted" htmlFor="league-select" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>League</label>
                    <select 
                        id="league-select"
                        value={cfg.league} 
                        onChange={(e) => {
                            setSelectedLeague(e.target.value);
                            if (onLeagueChanged) onLeagueChanged(e.target.value);
                            changeLeague(e.target.value, setCfg, () => {});
                        }}
                        disabled={saving}
                        style={{ fontSize: '13px', padding: '6px 8px', width: '100%' }}
                    >
                        <option value="Standard">Standard</option>
                        <option value="Hardcore">Hardcore</option>
                    </select>
                </div>
                <TopResultsInput topN={topN} onTopNChanged={onTopNChanged} />
            </div>

            {/* Thread ID input */}
            <div style={{ marginBottom: 16 }}>
                <label className="muted" htmlFor="thread-id-input" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Forum Thread</label>
                <input
                    id="thread-id-input"
                    type="text"
                    value={threadIdDraft}
                    onChange={handleThreadIdChange}
                    onBlur={handleThreadIdBlur}
                    style={{ fontSize: '13px', padding: '6px 8px', width: 120 }}
                    disabled={threadIdSaving}
                    placeholder="e.g. 1234567"
                />
            </div>

            {/* Forum thread link below, using the current threadIdDraft */}
            <ForumThreadLink threadId={threadIdDraft} />

            {/* Account Name for Highlighting */}
            <AccountNameInput accountNameDraft={accountNameDraft} setAccountNameDraft={setAccountNameDraft} accountNameSaving={accountNameSaving} />

            {/* Trade pairs list - compact */}
            <TradePairsList trades={cfg.trades} cfg={cfg} setCfg={setCfg} setSaving={setSaving} onHotToggled={onHotToggled} onPairRemoved={onPairRemoved} saving={saving} toggleHot={toggleHot} removePair={(idx: number) => removePair(idx, setCfg, setSaving, onPairRemoved, cfg.league)} />

            {/* Add new trade - compact */}
            <AddTradeForm get={get} setGet={setGet} pay={pay} setPay={setPay} saving={saving} setSaving={setSaving} addPair={(g: string, p: string, setCfg: Function, setGet: Function, setPay: Function, setSaving: Function, onPairAdded?: Function) => addPair(g, p, setCfg, setGet, setPay, setSaving, onPairAdded, cfg.league)} setCfg={setCfg} onPairAdded={onPairAdded} />

    </Card>
    )
}

