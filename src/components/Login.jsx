import React, { useState } from 'react'
import { supabase } from '../api/supabase.js'
import { Wordmark } from './ui.jsx'

// Email + password sign-in for the owner. No PIN pad, no sign-up link — admin
// accounts are created manually in the Supabase dashboard. On success the parent
// (App) re-resolves the auth state and routes to 2FA enroll/verify or the portal.
export default function Login({ onAuthed }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function signIn(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw error
      onAuthed()
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Email or password is incorrect.'
        : (err.message || 'Could not sign in.'))
      setBusy(false)
    }
  }

  async function forgotPassword() {
    setError('')
    setNotice('')
    if (!email.trim()) {
      setError('Enter your email above first, then tap “Forgot password”.')
      return
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      })
      if (error) throw error
      setNotice('If that email has an account, a password-reset link is on its way.')
    } catch (err) {
      setError(err.message || 'Could not send the reset email.')
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card card" onSubmit={signIn}>
        <Wordmark />
        <div className="auth-sub">Owner portal</div>

        <label className="admin-label" htmlFor="email">Email</label>
        <input
          id="email"
          className="admin-input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError('') }}
          placeholder="you@ameliajacobssalon.com.au"
          autoFocus
        />

        <label className="admin-label" htmlFor="password" style={{ marginTop: 14 }}>Password</label>
        <input
          id="password"
          className="admin-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError('') }}
          placeholder="••••••••"
        />

        {error && <div className="admin-error" style={{ marginTop: 12 }}>{error}</div>}
        {notice && <div className="auth-notice" style={{ marginTop: 12 }}>{notice}</div>}

        <button className="btn btn-gold" type="submit" disabled={busy || !email || !password} style={{ marginTop: 20 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <button type="button" className="auth-link" onClick={forgotPassword}>
          Forgot password?
        </button>
      </form>
    </div>
  )
}
