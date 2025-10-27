import { useState } from 'react';

export type SortKey = 'none' | 'change' | 'spread' | 'median' | 'profit';
export type SortDirection = 'desc' | 'asc' | 'none';

export function useTradeSort() {
  const [sortBy, setSortBy] = useState<SortKey>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('none');

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      // Cycle through: desc -> asc -> none
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else if (sortDirection === 'asc') {
        setSortDirection('none');
        setSortBy('none');
      }
    } else {
      // Start with descending on first click
      setSortBy(key);
      setSortDirection('desc');
    }
  };

  return { sortBy, sortDirection, handleSort };
}
