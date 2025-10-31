import React from 'react';
import './CountdownBar.css';

interface CountdownBarProps {
  total: number; // total seconds
  current: number; // current progress seconds (e.g. 6 means 6/10 filled)
  label?: string;
}

const CountdownBar: React.FC<CountdownBarProps> = ({ total, current, label }) => {
  const percent = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0;
  return (
    <div>
      <div className="countdown-bar-container">
        <div
          className="countdown-bar"
          style={{ width: `${percent * 100}%` }}
        />
      </div>
      {label && (
        <div className="countdown-bar-label">{label}</div>
      )}
    </div>
  );
};

export default CountdownBar;
