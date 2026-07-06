import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './api/supabase.js'
import Login from './components/Login.jsx'
import TwoFactorSetup from './components/TwoFactorSetup.jsx'
import TwoFactorVerify, { deviceTrusted, clearTrustedDevice } from './components/TwoFactorVerify.jsx'
import { Toast } from './components/ui.jsx'
import AdminPortal from './admin/AdminPortal.jsx'
import { getOwnerEmployee, logout as apiLogout } from './api/client.js'

// Auth state machine:
//   'loading' | 'login' | '2fa_enroll' | '2fa_verify' | 'portal'
//
// Routing is driven entirely by the Supabase session + MFA assurance level, so a
// refresh always lands on the right screen:
//   no session                         -> login
//   session, no verified factor        -> 2fa_enroll
//   session, factor but AAL still aal1 -> 2fa_verify  (unless device trusted)
//   session, elevated to aal2          -> portal
async function resolveState() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return 'login'
  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) return 'login'
  // nextLevel is 'aal2' only when a verified factor exists.
  if (aal.nextLevel !== 'aal2') return '2fa_enroll'
  if (aal.currentLevel === 'aal2') return 'portal'
  return deviceTrusted() ? 'portal' : '2fa_verify'
}

export default function App() {
  const [state, setState] = useState('loading')
  const [owner, setOwner] = useState(null)
  const [toastMsg, setToastMsg] = useState('')
  const toastTimer = useRef(null)

  // Capture the Xero OAuth redirect (?xero=connected&org=... or
  // ?xero=error&message=...) once, before anything strips the query string.
  const [xeroRedirect] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    const status = p.get('xero')
    if (!status) return null
    return { status, org: p.get('org') || '', message: p.get('message') || '' }
  })

  const toast = (msg) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 2800)
  }

  // Resolve the current auth state on load.
  useEffect(() => { resolveState().then(setState) }, [])

  // Once we reach the portal, load the owner employee row (used as the audit
  // actor and the sidebar display name). Fall back to the auth account itself.
  useEffect(() => {
    if (state !== 'portal' || owner) return
    ;(async () => {
      try {
        const emp = await getOwnerEmployee()
        if (emp) { setOwner(emp); return }
      } catch { /* fall through to auth-user fallback */ }
      const { data: { user } } = await supabase.auth.getUser()
      setOwner({ employee_id: user?.id, name: user?.email || 'Owner', role: 'owner' })
    })()
  }, [state, owner])

  // Surface the Xero connection result as a toast and strip the query params so
  // a refresh doesn't replay it.
  useEffect(() => {
    if (!xeroRedirect || state !== 'portal') return
    window.history.replaceState({}, '', window.location.pathname)
    toast(xeroRedirect.status === 'connected'
      ? `Connected to ${xeroRedirect.org || 'Xero'}.`
      : `Xero connection failed: ${xeroRedirect.message || 'unknown error'}`)
  }, [state])

  async function logout() {
    clearTrustedDevice()
    await apiLogout()
    setOwner(null)
    setState('login')
  }

  const reresolve = () => resolveState().then(setState)

  if (state === 'loading') {
    return <div className="auth-wrap"><div className="auth-card card"><p className="muted" style={{ textAlign: 'center' }}>Loading…</p></div></div>
  }

  if (state === 'login') {
    return <><Login onAuthed={reresolve} /><Toast msg={toastMsg} /></>
  }

  if (state === '2fa_enroll') {
    return <><TwoFactorSetup onEnrolled={reresolve} onSignOut={logout} /><Toast msg={toastMsg} /></>
  }

  if (state === '2fa_verify') {
    return <><TwoFactorVerify onVerified={reresolve} onSignOut={logout} /><Toast msg={toastMsg} /></>
  }

  // portal — wait for the owner identity before mounting so audit actions have
  // a stable actor id.
  if (!owner) {
    return <div className="auth-wrap"><div className="auth-card card"><p className="muted" style={{ textAlign: 'center' }}>Loading…</p></div></div>
  }

  return (
    <>
      <AdminPortal employee={owner} onLogout={logout} landOn={xeroRedirect ? 'reports' : undefined} />
      <Toast msg={toastMsg} />
    </>
  )
}
