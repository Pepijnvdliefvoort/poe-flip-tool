import React from 'react';
import { Button } from '../../ui/Button';

type Props = {
  allExpanded: boolean;
  setAllExpanded: (v: boolean) => void;
  onRefresh?: () => void;
  loading?: boolean;
};

export const TradesTableControls: React.FC<Props> = ({ allExpanded, setAllExpanded, onRefresh, loading }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Button
      variant="ghost"
      onClick={() => setAllExpanded(!allExpanded)}
      style={{ padding: '6px 12px', fontSize: '13px' }}
    >
      {allExpanded ? 'Collapse All' : 'Expand All'}
    </Button>
    {onRefresh && (
      <Button
        variant={loading ? 'ghost' : 'primary'}
        onClick={() => onRefresh()}
        loading={loading}
        style={{ padding: '6px 14px', fontSize: '13px' }}
        title="Refresh all trades"
      >
        Refresh
      </Button>
    )}
  </div>
);
