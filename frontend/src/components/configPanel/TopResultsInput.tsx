import React from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface TopResultsInputProps {
  topN: number;
  onTopNChanged: (n: number) => void;
}

const TopResultsInput: React.FC<TopResultsInputProps> = ({ topN, onTopNChanged }) => (
  <div style={{ flex: 1 }}>
    <label className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>Top Results</label>
    <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
      <Input
        id="topn-input"
        type="number"
        min={1}
        max={20}
        value={topN}
        onChange={e => onTopNChanged(Number(e.target.value) || 5)}
        style={{ fontSize: '13px', padding: '6px 32px 6px 8px', flex: 1, textAlign: 'center' }}
      />
      <div style={{ 
        position: 'absolute', 
        right: 7, 
        top: 0, 
        bottom: 0, 
        display: 'flex', 
        flexDirection: 'column',
        width: '24px',
        zIndex: 1
      }}>
        <Button
          variant="ghost"
          style={{
            borderRadius: '6px 6px 0 0',
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            borderBottom: '0.5px solid var(--border)',
            minWidth: 30
          }}
          onClick={() => {
            const input = document.getElementById('topn-input') as HTMLInputElement;
            if (input) input.stepUp();
            onTopNChanged(Number(input.value) || 1);
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(156, 163, 175, 0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18,15 12,9 6,15"></polyline>
          </svg>
        </Button>
        <Button
          variant="ghost"
          style={{
            borderRadius: '0 0 6px 6px',
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            borderTop: '0.5px solid var(--border)',
            minWidth: 30,
          }}
          onClick={() => {
            const input = document.getElementById('topn-input') as HTMLInputElement;
            if (input) input.stepDown();
            onTopNChanged(Number(input.value) || 20);
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(156, 163, 175, 0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6,9 12,15 18,9"></polyline>
          </svg>
        </Button>
      </div>
    </div>
  </div>
);

export default TopResultsInput;
