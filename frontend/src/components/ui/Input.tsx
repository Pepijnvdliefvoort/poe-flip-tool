import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  containerStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, containerStyle, labelStyle, style, ...props }, ref) => (
    <div style={{ width: '100%', ...containerStyle }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: '13px',
          fontWeight: 500,
          marginBottom: '6px',
          color: 'var(--text)',
          ...labelStyle
        }}>{label}</label>
      )}
      <input
        ref={ref}
        style={{
          width: '100%',
          padding: '10px 12px',
          fontSize: '14px',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          background: 'var(--bg-secondary)',
          color: 'var(--text)',
          outline: 'none',
          transition: 'border-color 0.2s',
          ...style
        }}
        {...props}
      />
    </div>
  )
);

Input.displayName = 'Input';

export default Input;
