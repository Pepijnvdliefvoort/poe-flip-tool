// Utility functions for ProfitTracker

// Format numbers with thousand/million separators and fixed decimals
// Uses European format: dots for thousands, commas for decimals (e.g., 12.330,91)
export function formatNumber(value: number | null | undefined, decimals = 2) {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Ensure timestamps without timezone are treated as UTC by appending 'Z'
export function parseUtcTimestamp(ts: string): number {
  if (/[zZ]$/.test(ts) || /[+-]\d{2}:?\d{2}$/.test(ts)) {
    return new Date(ts).getTime();
  }
  return new Date(ts + 'Z').getTime();
}

// Get icon path for a currency
export function iconFor(currency: string) {
  const map: Record<string, string> = {
    'divine orb': 'divine',
    'divine': 'divine',
    'exalted orb': 'exalted',
    'exalt': 'exalted',
    'exalted': 'exalted',
    'chaos orb': 'chaos',
    'chaos': 'chaos',
    'mirror of kalandra': 'mirror',
    'mirror': 'mirror',
    'hinekoras-lock': 'hinekoras-lock',
    'mirror-shard': 'mirror-shard',
  };
  const key = currency.trim().toLowerCase();
  const file = map[key] || key.replace(/ /g, '-');
  return `${import.meta.env.BASE_URL}currency/${file}.webp`;
}

// Pluralize currency name
export function pluralize(currency: string, quantity: number): string {
  const singularMap: Record<string, string> = {
    'Divine Orb': 'divine',
    'Chaos Orb': 'chaos',
    'Exalted Orb': 'exalt',
    'Mirror Shard': 'mirror shard',
    'Mirror Of Kalandra': 'mirror',
    'Hinekoras Lock': 'lock',
  };
  const pluralMap: Record<string, string> = {
    'Divine Orb': 'divines',
    'Chaos Orb': 'chaos',
    'Exalted Orb': 'exalts',
    'Mirror Shard': 'mirror shards',
    'Mirror Of Kalandra': 'mirrors',
    'Hinekoras Lock': 'locks',
  };
  if (quantity === 1) {
    return singularMap[currency] || currency;
  } else {
    return pluralMap[currency] || currency;
  }
}
