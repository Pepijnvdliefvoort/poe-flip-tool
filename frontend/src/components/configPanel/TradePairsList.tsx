import React from 'react';
import { CurrencyIcon } from '../CurrencyIcon';

import type { TradePair } from '../../types';

interface TradePairsListProps {
  trades: TradePair[];
  cfg: any;
  setCfg: (cfg: any) => void;
  setSaving: (saving: boolean) => void;
  onHotToggled: (i: number) => void;
  onPairRemoved: (i: number) => void;
  saving: boolean;
  toggleHot: (i: number, cfg: any, setCfg: any, setSaving: any, onHotToggled: any) => void;
  removePair: (i: number, setCfg: any, setSaving: any, onPairRemoved: any) => void;
}

const TradePairsList: React.FC<TradePairsListProps> = ({ trades, cfg, setCfg, setSaving, onHotToggled, onPairRemoved, saving, toggleHot, removePair }) => (
  <div style={{ marginBottom: 16 }}>
    <label className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' }}>
      Pairs ({trades.length})
    </label>
    {trades.length > 0 ? (
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gridAutoFlow: 'column',
        gridTemplateRows: `repeat(${Math.ceil(trades.length / 2)}, auto)`,
        gap: '8px' 
      }}>
        {trades.map((t, i) => (
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
              onClick={() => toggleHot(i, cfg, setCfg, setSaving, onHotToggled)}
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
              onMouseEnter={e => {
                if (!t.hot) {
                  e.currentTarget.style.opacity = '0.7';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={e => {
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
              onClick={() => removePair(i, setCfg, setSaving, onPairRemoved)} 
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
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseLeave={e => {
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
);

export default TradePairsList;
