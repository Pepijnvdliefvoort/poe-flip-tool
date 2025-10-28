import React, { useEffect, useRef, useState } from 'react';
import './CountdownBar.css';

interface CountdownBarProps {
  duration: number; // total seconds
  remaining: number; // seconds left
  label?: string;
}

const CountdownBar: React.FC<CountdownBarProps> = ({ duration, remaining, label }) => {
  // Smoothly animate the bar width
  const [smoothRemaining, setSmoothRemaining] = useState(remaining);
  const lastUpdateRef = useRef(Date.now());

  useEffect(() => {
    setSmoothRemaining(remaining);
    lastUpdateRef.current = Date.now();
  }, [remaining]);

  useEffect(() => {
    if (remaining <= 0) {
      setSmoothRemaining(0);
      return;
    }
    let anim = true;
    const animate = () => {
      if (!anim) return;
      const now = Date.now();
      const elapsed = (now - lastUpdateRef.current) / 1000;
      const target = Math.max(0, remaining - elapsed);
      setSmoothRemaining(target);
      if (target > 0) {
        requestAnimationFrame(animate);
      }
    };
    animate();
    return () => { anim = false; };
  }, [remaining]);

  const percent = Math.max(0, Math.min(1, smoothRemaining / duration));
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
