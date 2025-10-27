import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
  },
  ghost: {
    background: 'none',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  },
  danger: {
    background: '#ef4444',
    color: 'white',
    border: 'none',
  },
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  loading = false,
  style,
  children,
  ...props
}) => (
  <button
    {...props}
    style={{
      padding: '6px 16px',
      minWidth: 90,
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 600,
      cursor: loading || props.disabled ? 'not-allowed' : 'pointer',
      opacity: loading || props.disabled ? 0.7 : 1,
      transition: 'background 0.2s, border-color 0.2s',
      ...variantStyles[variant],
      ...style,
    }}
    disabled={loading || props.disabled}
  >
    {loading ? 'Loading…' : children}
  </button>
);
