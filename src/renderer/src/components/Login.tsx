import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import styles from './Login.module.css'

export const Login: React.FC = () => {
  const { login, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [showMfa, setShowMfa] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [keepLoggedIn, setKeepLoggedIn] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    console.log('[Login] Submitting with MFA:', showMfa, 'Code length:', mfaCode?.length)
    try {
      await login({ email, password, keepLoggedIn, mfaCode: showMfa ? mfaCode : undefined })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => {
    setShowMfa(false)
    setMfaCode('')
  }

  // Detect MFA requirement from error message
  useEffect(() => {
    if (error && (error.includes('EMFAREQUIRED') || error.includes('MFA_REQUIRED')) && !showMfa) {
      setShowMfa(true)
      setMfaCode('') // Clear any previous MFA code
    }
  }, [error, showMfa])

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Guitar Companion</h1>
        <p className={styles.subtitle}>Your tabs, everywhere. Securely via MEGA.</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          {!showMfa ? (
            <>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  name="email"
                  autoComplete="username email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mega@example.com"
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Password</label>
                <input
                  className={styles.input}
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div style={{ margin: '15px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    color: '#fff',
                    fontSize: 14
                  }}
                >
                  <input
                    type="checkbox"
                    checked={keepLoggedIn}
                    onChange={(e) => setKeepLoggedIn(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#bb86fc' }}
                  />
                  Save credentials for next time
                </label>
                <div
                  style={{ fontSize: 11, color: '#f44336', marginLeft: 24, fontStyle: 'italic' }}
                >
                  Warning: Do not save if this is not your device.
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  disabled
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>2FA Authentication Code</label>
                <input
                  className={styles.input}
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="123456"
                  required
                  autoFocus
                  maxLength={6}
                />
              </div>

              <button
                type="button"
                onClick={handleBack}
                className={styles.button}
                style={{ background: '#333', marginBottom: '10px' }}
              >
                ← Back to Login
              </button>
            </>
          )}

          <button type="submit" className={styles.button} disabled={isSubmitting}>
            {isSubmitting ? 'Connecting...' : showMfa ? 'Verify Code' : 'Sign In'}
          </button>
        </form>

        {error && !error.includes('EMFAREQUIRED') && error !== 'MFA_REQUIRED' && (
          <div className={styles.error}>{error}</div>
        )}
      </div>
    </div>
  )
}
