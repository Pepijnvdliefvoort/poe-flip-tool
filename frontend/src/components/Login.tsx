import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';

interface LoginProps {
  onLogin: (token: string) => void
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  // Auto-focus username input on mount
  useEffect(() => {
    if (usernameRef.current) {
      usernameRef.current.focus()
    }
  }, [])

  const handleDiscordCopy = () => {
    navigator.clipboard.writeText('pepijn.')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Please enter username and password')
      return
    }

    setLoading(true)
    setError('')

    // Login and get session token
    try {
      const BASE = import.meta.env.VITE_BACKEND_URL ||
        (typeof location !== 'undefined' && location.hostname.endsWith('github.io')
          ? 'https://poe-flip-backend.fly.dev'
          : 'http://localhost:8000')

      const response = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim()
        })
      })

      if (response.ok) {
        const data = await response.json()
        onLogin(data.token)
      } else if (response.status === 401) {
        setError('Invalid username or password')
      } else {
        setError('Login failed. Please try again.')
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
      <Card style={{ maxWidth: 400, width: '100%', padding: 32, boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '16px'
        }}>
          <img
            src={`${import.meta.env.BASE_URL}favicon.png`}
            alt="PoE Logo"
            style={{ width: '48px', height: '48px' }}
          />
        </div>
        <h1 style={{
          fontSize: '24px',
          fontWeight: 700,
          marginBottom: '8px',
          color: 'var(--text-bright)',
          textAlign: 'center'
        }}>
          PoE Currency Flip Tool
        </h1>




        <form onSubmit={handleSubmit}>
          <Input
            label="Username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            disabled={loading}
            autoComplete="username"
            ref={usernameRef}
            containerStyle={{ marginBottom: 16 }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
          />
          <div style={{ marginBottom: '16px', position: 'relative' }}>
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              disabled={loading}
              autoComplete="current-password"
              style={{ paddingRight: 40 }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            />
            <Button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(v => !v)}
              style={{
                position: 'absolute',
                right: 8,
                top: '55%',
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '16px',
                padding: 0,
                minWidth: 30
              }}
              tabIndex={-1}
              variant="ghost"
            >
              {showPassword ? '🙈' : '👁️'}
            </Button>
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

          <Button
            type="submit"
            loading={loading}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '4px',
            }}
          >
            Login
          </Button>
        </form>

        <Card style={{ marginTop: 24, padding: 16, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, textAlign: 'center' }}>
          <p style={{
            fontSize: '13px',
            color: 'var(--text)',
            marginBottom: '8px'
          }}>
            Want to use this tool?
          </p>
          <p style={{
            fontSize: '12px',
            color: 'var(--muted)',
            marginBottom: '10px'
          }}>
            Contact me on Discord
          </p>

          <Button
            onClick={handleDiscordCopy}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--text-bright)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              position: 'relative',
              marginTop: 4
            }}
            variant="ghost"
          >
            {copied ? '✓ Copied!' : 'pepijn.'}
          </Button>
        </Card>
      </Card>
    </div>
  )
}
