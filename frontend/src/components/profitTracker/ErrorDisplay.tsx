import React from 'react';

export const ErrorDisplay: React.FC<{ error: string }> = ({ error }) => (
  <div style={{ color: '#ef4444', marginTop: 12, fontWeight: 500 }}>{error}</div>
);
