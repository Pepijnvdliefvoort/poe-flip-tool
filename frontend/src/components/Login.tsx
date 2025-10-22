import { useState } from 'react'

interface LoginProps {
  onLogin: (apiKey: string) => void
}

export function Login({ onLogin }: LoginProps) {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apiKey.trim()) {
      setError('Please enter an API key')
      return
    }

    setLoading(true)
    setError('')

    // Test the API key by making a request
    try {
      const BASE = import.meta.env.VITE_BACKEND_URL || 
        (typeof location !== 'undefined' && location.hostname.endsWith('github.io')
          ? 'https://poe-flip-backend.fly.dev'
          : 'http://localhost:8000')
      
      const response = await fetch(`${BASE}/api/config`, {
        headers: {
          'X-API-Key': apiKey.trim()
        }
      })

      if (response.ok) {
        onLogin(apiKey.trim())
      } else if (response.status === 403) {
        setError('Invalid API key')
      } else {
        setError('Failed to verify API key')
      }
    } catch (err) {
      setError('Connection error. Please check if the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '32px',
        maxWidth: '400px',
        width: '100%',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 700,
          marginBottom: '8px',
          color: 'var(--text-bright)',
          textAlign: 'center'
        }}>
          PoE Currency Flip Tool
        </h1>
        <p style={{
          fontSize: '14px',
          color: 'var(--muted)',
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          Enter your API key to continue
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '6px',
              color: 'var(--text)'
            }}>
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                background: 'var(--bg-secondary)',
                color: 'var(--text)',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 12px',
              marginBottom: '16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--err)',
              borderRadius: '4px',
              color: 'var(--err)',
              fontSize: '13px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: 600,
              color: 'white',
              background: loading ? 'var(--muted)' : 'var(--accent)',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = 'var(--accent-hover)'
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = 'var(--accent)'
            }}
          >
            {loading ? 'Verifying...' : 'Login'}
          </button>
        </form>

        <p style={{
          marginTop: '20px',
          fontSize: '12px',
          color: 'var(--muted)',
          textAlign: 'center'
        }}>
          Don't have an API key? Contact your administrator.
        </p>
      </div>
    </div>
  )
}
