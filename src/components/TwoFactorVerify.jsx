import React, { useEffect, useState } from 'react'
import { supabase } from '../api/supabase.js'
import { Wordmark } from './ui.jsx'

const TRUST_KEY = 'aj_admin_trusted_until'
const THIRTY_DAYS = 30 * 86400000

// 6-digit TOTP challenge shown after password login when a verified
// authenticator exists but this session hasn't been elevated yet.
export default function TwoFactorVerify({ onVerified, onSignOut }) {
  const [factorId, setFactorId] = useState(null)
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadErr, setLoadErr] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors()
        if (error) throw error
        const totp = (data?.totp || []).find((f) => f.status === 'verified')
          || (data?.all || []).find((f) => f.factor_type === 'totp' && f.status === 'verified')
        if (!totp) throw new Error('No authenticator is enrolled on this account.')
        setFactorId(totp.id)
      } catch (err) {
        setLoadErr(err.message || 'Could not load your authenticator.')
      }
    })()
  }, [])

  async function verify(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      })
      if (error) throw error
      if (remember) {
        localStorage.setItem(TRUST_KEY, String(Date.now() + THIRTY_DAYS))
      }
      onVerified()
    } catch (err) {
      setError('That code didn’t match. Check your authenticator app and try again.')
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <Wordmark />
        <div className="auth-sub">Two-factor authentication</div>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 18 }}>
          Enter the 6-digit code from your authenticator app.
        </p>

        {loadErr && <div className="admin-error">{loadErr}</div>}

        {!loadErr && (
          <form onSubmit={verify}>
            <input
              className="admin-input auth-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
              placeholder="123456"
              autoFocus
            />

            <label className="auth-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember this device for 30 days
            </label>

            {error && <div className="admin-error" style={{ marginTop: 12 }}>{error}</div>}

            <button className="btn btn-dark" type="submit" disabled={busy || code.length !== 6 || !factorId} style={{ marginTop: 16 }}>
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        )}

        <button type="button" className="auth-link" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}

// Whether this browser was marked trusted within the last 30 days.
export function deviceTrusted() {
  const t = Number(localStorage.getItem(TRUST_KEY) || 0)
  return t > Date.now()
}

export function clearTrustedDevice() {
  localStorage.removeItem(TRUST_KEY)
}
