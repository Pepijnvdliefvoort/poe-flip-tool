import React from 'react';

interface HistoryMiniChartProps {
  data: { timestamp: string; median_rate: number; avg_rate: number }[];
}

export function HistoryMiniChart({ data }: HistoryMiniChartProps) {
  if (data.length < 2) return null;
  const width = 320;
  const height = 80;
  const medianSeries = data.map(d => d.median_rate);
  const min = Math.min(...medianSeries);
  const max = Math.max(...medianSeries);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const d = medianSeries.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 4 }}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
    </svg>
  );
}
