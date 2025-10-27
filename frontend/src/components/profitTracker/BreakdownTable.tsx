import React from 'react';
import { iconFor, formatNumber } from '../../utils/profitTrackerUtils';
import type { PortfolioSnapshot } from '../../types';

export const BreakdownTable: React.FC<{ snapshot: PortfolioSnapshot }> = ({ snapshot }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 40 }}>
    <thead>
      <tr style={{ borderBottom: '1px solid #334155' }}>
        <th style={{ textAlign: 'left', padding: 6 }}>Currency</th>
        <th style={{ textAlign: 'right', padding: 6 }}>Qty</th>
        <th style={{ textAlign: 'right', padding: 6 }}>Div / Unit</th>
        <th style={{ textAlign: 'right', padding: 6 }}>Total (Div)</th>
        <th style={{ textAlign: 'left', padding: 6 }}>Source Pair</th>
      </tr>
    </thead>
    <tbody>
      {snapshot.breakdown.map(b => (
        <tr key={b.currency} style={{ borderBottom: '1px solid #1e293b' }}>
          <td style={{ padding: 6, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
            <img src={iconFor(b.currency)} alt={b.currency} style={{ width: 26, height: 26 }} />
            {b.currency}
          </td>
          <td style={{ padding: 6, textAlign: 'right' }}>{b.quantity}</td>
          <td style={{ padding: 6, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(b.divine_per_unit, 2)}</td>
          <td style={{ padding: 6, textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: '#38bdf8' }}>{formatNumber(b.total_divine, 2)}</td>
          <td style={{ padding: 6, fontSize: 12, opacity: 0.65 }}>{b.source_pair || '—'}</td>
        </tr>
      ))}
    </tbody>
    <tfoot>
      <tr>
        <td colSpan={3} style={{ textAlign: 'right', padding: 6, fontWeight: 600 }}>Grand Total</td>
        <td style={{ textAlign: 'right', padding: 6, fontWeight: 700, color: '#38bdf8', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(snapshot.total_divines, 2)}</td>
        <td />
      </tr>
    </tfoot>
  </table>
);
