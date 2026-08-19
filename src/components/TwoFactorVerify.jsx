import React, { useEffect, useState } from 'react'
import { supabase } from '../api/supabase.js'
import { Wordmark } from './ui.jsx'

// 6-digit TOTP challenge shown after password login when a verified
// authenticator exists but this session hasn't been elevated yet. There is no
// "remember this device" option: owner access is enforced at the data layer
// (RLS requires an aal2 session), so a trusted-device shortcut could only skip
// this UI, never the elevation — every session must reach aal2 to be useful.
export default function TwoFactorVerify({ onVerified, onSignOut }) {
  const [factorId, setFactorId] = useState(null)
  const [code, setCode] = useState('')
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

            {error && <div className="admin-error" style={{ marginTop: 12 }}>{error}</div>}

            <button className="btn btn-gold" type="submit" disabled={busy || code.length !== 6 || !factorId} style={{ marginTop: 16 }}>
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
