import React from 'react';
import { Api } from '../api';
import type { ConfigData } from '../types';

export async function changeLeague(newLeague: string, setCfg: Function, onChanged: Function) {
  const next = await Api.patchLeague(newLeague);
  setCfg(next);
  onChanged();
}

export async function addPair(get: string, pay: string, setCfg: Function, setGet: Function, setPay: Function, setSaving: Function, onPairAdded?: Function) {
  const g = get.trim();
  const p = pay.trim();
  if (!g || !p) return;
  setSaving(true);
  try {
    const next = await Api.patchTrades({ add: [{ get: g, pay: p }] });
    setCfg(next);
    setGet(''); setPay('');
    if (onPairAdded) onPairAdded(g, p);
  } finally { setSaving(false); }
}

export async function removePair(idx: number, setCfg: Function, setSaving: Function, onPairRemoved?: Function) {
  setSaving(true);
  try {
    const next = await Api.patchTrades({ remove_indices: [idx] });
    setCfg(next);
    if (onPairRemoved) onPairRemoved(idx);
  } finally { setSaving(false); }
}

export async function toggleHot(idx: number, cfg: ConfigData | null, setCfg: Function, setSaving: Function, onHotToggled?: Function) {
  if (!cfg) return;
  setSaving(true);
  try {
    const updatedTrades = cfg.trades.map((t, i) => i === idx ? { ...t, hot: !t.hot } : t);
    const next = await Api.putConfig({ ...cfg, trades: updatedTrades });
    setCfg(next);
    if (onHotToggled && next.trades[idx]) onHotToggled(idx, next.trades[idx].hot ?? false);
  } finally { setSaving(false); }
}

export function useDebouncedAccountNameSave(cfg: ConfigData | null, accountNameDraft: string, setCfg: Function, setAccountNameSaving: Function, onAccountNameChanged?: Function) {
  const accountNameDebounceRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!cfg) return;
    if (accountNameDebounceRef.current !== null) {
      clearTimeout(accountNameDebounceRef.current);
    }
    accountNameDebounceRef.current = window.setTimeout(async () => {
      const draft = accountNameDraft.trim();
      if (draft === (cfg.account_name || '')) return;
      setAccountNameSaving(true);
      try {
        const next = await Api.patchAccountName(draft);
        setCfg(next);
        if (onAccountNameChanged) onAccountNameChanged(next.account_name || null);
      } finally {
        setAccountNameSaving(false);
      }
    }, 600);
    return () => {
      if (accountNameDebounceRef.current !== null) {
        clearTimeout(accountNameDebounceRef.current);
      }
    };
  }, [accountNameDraft, cfg]);
}
