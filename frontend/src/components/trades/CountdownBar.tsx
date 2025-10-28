import React from 'react';
import './CountdownBar.css';

interface CountdownBarProps {
  duration: number; // total seconds
  remaining: number; // seconds left
  label?: string;
}

const CountdownBar: React.FC<CountdownBarProps> = ({ duration, remaining, label }) => {
  const percent = Math.max(0, Math.min(1, remaining / duration));
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
