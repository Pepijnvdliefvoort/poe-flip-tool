import React from 'react';

interface TimeRangePickerProps {
  timeRange: number | null;
  setTimeRange: (v: number | null) => void;
  showCustomRange: boolean;
  setShowCustomRange: (v: boolean) => void;
  customStartDate: string;
  setCustomStartDate: (v: string) => void;
  customEndDate: string;
  setCustomEndDate: (v: string) => void;
}

const ranges = [
  { label: 'All', hours: null },
  { label: '1y', hours: 8760 },
  { label: '1mo', hours: 720 },
  { label: '1w', hours: 168 },
  { label: '1d', hours: 24 },
  { label: '12h', hours: 12 },
  { label: '6h', hours: 6 },
  { label: '1h', hours: 1 },
  { label: '30m', hours: 0.5 },
];

const TimeRangePicker: React.FC<TimeRangePickerProps> = ({ timeRange, setTimeRange, showCustomRange, setShowCustomRange, customStartDate, setCustomStartDate, customEndDate, setCustomEndDate }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(30, 41, 59, 0.6))', borderRadius: 8, border: '1px solid #334155' }}>
      <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.8, marginRight: 4 }}>Time Range:</span>
      {ranges.map((range) => (
        <button
          key={range.label}
          onClick={() => { setTimeRange(range.hours); setShowCustomRange(false); }}
          style={{
            background: timeRange === range.hours && !showCustomRange ? '#334155' : 'transparent',
            border: timeRange === range.hours && !showCustomRange ? '1px solid #64748b' : '1px solid #475569',
            color: timeRange === range.hours && !showCustomRange ? '#e2e8f0' : '#94a3b8',
            padding: '4px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: timeRange === range.hours && !showCustomRange ? 600 : 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            if (timeRange !== range.hours || showCustomRange) {
              e.currentTarget.style.background = 'rgba(51, 65, 85, 0.5)';
              e.currentTarget.style.borderColor = '#64748b';
              e.currentTarget.style.color = '#cbd5e1';
            }
          }}
          onMouseLeave={e => {
            if (timeRange !== range.hours || showCustomRange) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = '#475569';
              e.currentTarget.style.color = '#94a3b8';
            }
          }}
        >
          {range.label}
        </button>
      ))}
      <button
        onClick={() => setShowCustomRange(!showCustomRange)}
        style={{
          background: showCustomRange ? '#334155' : 'transparent',
          border: showCustomRange ? '1px solid #64748b' : '1px solid #475569',
          color: showCustomRange ? '#e2e8f0' : '#94a3b8',
          padding: '4px 12px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: showCustomRange ? 600 : 500,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => {
          if (!showCustomRange) {
            e.currentTarget.style.background = 'rgba(51, 65, 85, 0.5)';
            e.currentTarget.style.borderColor = '#64748b';
            e.currentTarget.style.color = '#cbd5e1';
          }
        }}
        onMouseLeave={e => {
          if (!showCustomRange) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = '#475569';
            e.currentTarget.style.color = '#94a3b8';
          }
        }}
      >
        Custom
      </button>
    </div>
    {showCustomRange && (
      <div style={{ marginTop: 8, padding: '12px', background: 'rgba(15, 23, 42, 0.8)', borderRadius: 8, border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="custom-start-date" style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>From:</label>
          <input id="custom-start-date" type="datetime-local" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} style={{ background: '#1e293b', border: '1px solid #475569', color: '#e2e8f0', padding: '4px 8px', borderRadius: 6, fontSize: 12 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="custom-end-date" style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>To:</label>
          <input id="custom-end-date" type="datetime-local" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} style={{ background: '#1e293b', border: '1px solid #475569', color: '#e2e8f0', padding: '4px 8px', borderRadius: 6, fontSize: 12 }} />
        </div>
        <button
          onClick={() => {
            if (customStartDate && customEndDate) {
              const start = new Date(customStartDate).getTime();
              const end = new Date(customEndDate).getTime();
              const hoursRange = (end - start) / (1000 * 60 * 60);
              setTimeRange(hoursRange);
            }
          }}
          disabled={!customStartDate || !customEndDate}
          style={{ background: (!customStartDate || !customEndDate) ? '#1e293b' : '#334155', border: '1px solid #475569', color: (!customStartDate || !customEndDate) ? '#64748b' : '#e2e8f0', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: (!customStartDate || !customEndDate) ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
          onMouseEnter={e => {
            if (customStartDate && customEndDate) {
              e.currentTarget.style.background = '#475569';
              e.currentTarget.style.borderColor = '#64748b';
            }
          }}
          onMouseLeave={e => {
            if (customStartDate && customEndDate) {
              e.currentTarget.style.background = '#334155';
              e.currentTarget.style.borderColor = '#475569';
            }
          }}
        >
          Apply
        </button>
      </div>
    )}
  </div>
);

export default TimeRangePicker;
