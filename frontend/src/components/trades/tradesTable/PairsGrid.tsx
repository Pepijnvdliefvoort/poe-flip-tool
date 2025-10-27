import React from 'react';
import CollapsiblePair from '../CollapsiblePair';
import { PairSummary } from '../../../types';

type Props = {
  data: PairSummary[];
  loading: boolean;
  loadingIndex: number;
  onReload: (index: number, newPrice?: string) => Promise<any> | void;
  globalMaxAbsDelta: number;
  accountName?: string | null;
  selectedMetrics: readonly string[];
  allExpanded: boolean;
};

export const PairsGrid: React.FC<Props> = ({ data, loading, loadingIndex, onReload, globalMaxAbsDelta, accountName, selectedMetrics, allExpanded }) => (
  <div className="pairs-grid">
    {data.map((p, i) => (
      <CollapsiblePair
        key={`${p.pay}->${p.get}`}
        pair={p}
        defaultExpanded={allExpanded}
        loading={!!loading && i === loadingIndex}
        onReload={onReload}
        globalMaxAbsDelta={globalMaxAbsDelta}
        accountName={accountName}
        selectedMetrics={selectedMetrics}
      />
    ))}
  </div>
);
