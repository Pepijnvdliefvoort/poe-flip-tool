import React from 'react';
import type { SortKey, SortDirection } from './useTradeSort';

type Props = {
  sortBy: SortKey;
  sortDirection: SortDirection | string;
  handleSort: (key: SortKey) => void;
};

const headers: { key: SortKey; label: string; width: string }[] = [
  { key: 'change', label: 'change', width: '0px' },
  { key: 'spread', label: 'spread', width: '130px' },
  { key: 'median', label: 'median', width: '130px' },
  { key: 'profit', label: 'profit', width: '310px' },
];

export const TradesTableHeaders: React.FC<Props> = ({ sortBy, sortDirection, handleSort }) => (
  <>
    {/* Spacer for Best column */}
    <div style={{ width: '170px' }}></div>
    {/* Change column header */}
    <div
      style={{
        width: '0px',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        userSelect: 'none',
        fontSize: '13px',
        fontWeight: 500,
        color: sortBy === 'change' ? 'var(--accent)' : 'var(--muted)',
        transition: 'color 0.2s',
      }}
      onClick={() => handleSort('change')}
      title="Sort by price change percentage"
    >
      <span style={{ textTransform: 'capitalize' }}>change</span>
      {sortBy === 'change' && sortDirection !== 'none' && (
        <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
      )}
    </div>
    {/* Metrics table headers */}
    <div style={{ width: '540px', display: 'flex', gap: 0 }}>
      <div
        style={{
          width: '130px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '13px',
          fontWeight: 500,
          color: sortBy === 'spread' ? 'var(--accent)' : 'var(--muted)',
          transition: 'color 0.2s',
        }}
        onClick={() => handleSort('spread')}
        title="Sort by spread"
      >
        <span style={{ textTransform: 'capitalize' }}>spread</span>
        {sortBy === 'spread' && sortDirection !== 'none' && (
          <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
        )}
      </div>
      <div
        style={{
          width: '130px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '13px',
          fontWeight: 500,
          color: sortBy === 'median' ? 'var(--accent)' : 'var(--muted)',
          transition: 'color 0.2s',
        }}
        onClick={() => handleSort('median')}
        title="Sort by median rate"
      >
        <span style={{ textTransform: 'capitalize' }}>median</span>
        {sortBy === 'median' && sortDirection !== 'none' && (
          <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
        )}
      </div>
      <div
        style={{
          width: '310px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '13px',
          fontWeight: 500,
          color: sortBy === 'profit' ? 'var(--accent)' : 'var(--muted)',
          transition: 'color 0.2s',
        }}
        onClick={() => handleSort('profit')}
        title="Sort by profit margin"
      >
        <span style={{ textTransform: 'capitalize' }}>profit</span>
        {sortBy === 'profit' && sortDirection !== 'none' && (
          <span style={{ fontSize: '10px' }}>{sortDirection === 'asc' ? '▲' : '▼'}</span>
        )}
      </div>
    </div>
  </>
);
