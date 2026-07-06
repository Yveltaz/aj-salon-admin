import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../api/supabase.js'
import { Wordmark } from './ui.jsx'

// Mandatory TOTP enrollment, shown after the owner's first password login when
// no verified authenticator is on file. Shows a QR code (and the secret for
// manual entry), then confirms enrollment by verifying a 6-digit code.
export default function TwoFactorSetup({ onEnrolled, onSignOut }) {
  const [factor, setFactor] = useState(null) // { id, qr, secret }
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const started = useRef(false)

  useEffect(() => {
    // React 18 StrictMode double-invokes effects in dev; guard so we only enroll
    // one factor.
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        // Clear any half-finished (unverified) TOTP factors from a previous
        // abandoned attempt so enroll() doesn't pile them up or clash on name.
        const { data: list } = await supabase.auth.mfa.listFactors()
        const stale = (list?.all || []).filter((f) => f.factor_type === 'totp' && f.status !== 'verified')
        for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id })

        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Authenticator',
        })
        if (error) throw error
        setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
      } catch (err) {
        setLoadErr(err.message || 'Could not start 2FA setup.')
      }
    })()
  }, [])

  async function confirm(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: code.trim(),
      })
      if (error) throw error
      onEnrolled()
    } catch (err) {
      setError('That code didn’t match. Check your authenticator app and try again.')
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <Wordmark />
        <div className="auth-sub">Set up two-factor authentication</div>
        <p className="muted" style={{ textAlign: 'center', marginBottom: 18 }}>
          Scan this with Google Authenticator, Authy, or any TOTP app, then enter
          the 6-digit code to finish. You’ll only do this once.
        </p>

        {loadErr && <div className="admin-error">{loadErr}</div>}

        {!loadErr && !factor && <p className="muted" style={{ textAlign: 'center' }}>Preparing your QR code…</p>}

        {factor && (
          <form onSubmit={confirm}>
            <div className="auth-qr">
              <img src={factor.qr} alt="TOTP QR code" width={200} height={200} />
            </div>
            <div className="auth-secret">
              Can’t scan? Enter this key manually:
              <code>{factor.secret}</code>
            </div>

            <label className="admin-label" htmlFor="totp" style={{ marginTop: 16 }}>
              6-digit code
            </label>
            <input
              id="totp"
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

            <button className="btn btn-dark" type="submit" disabled={busy || code.length !== 6} style={{ marginTop: 18 }}>
              {busy ? 'Verifying…' : 'Confirm & continue'}
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
