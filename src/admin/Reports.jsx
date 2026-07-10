import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  getReport, exportReportCsv, SERVICE_CATEGORIES,
  getXeroStatus, startXeroConnect, pushToXero, getXeroPushHistory, disconnectXero,
} from '../api/client.js'
import { Toast } from '../components/ui.jsx'

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const today = () => new Date().toISOString().slice(0, 10)

export default function Reports() {
  const [from, setFrom] = useState(() => daysAgo(7))
  const [to, setTo] = useState(today)
  const [rows, setRows] = useState([])
  const [rangeError, setRangeError] = useState('')
  const [busy, setBusy] = useState(false)

  // Xero state
  const [xero, setXero] = useState({ connected: false, tenantName: null, connectedAt: null })
  const [history, setHistory] = useState([])
  const [connecting, setConnecting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [showPush, setShowPush] = useState(false)
  const [pushResult, setPushResult] = useState(null)
  const [toastMsg, setToastMsg] = useState('')
  const toastTimer = useRef(null)

  const toast = (msg) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 3600)
  }

  useEffect(() => {
    getReport({ from, to })
      .then((r) => { setRows(r); setRangeError('') })
      .catch((e) => { setRows([]); setRangeError(e.message) })
  }, [from, to])

  async function refreshXero() {
    const [status, hist] = await Promise.all([getXeroStatus(), getXeroPushHistory()])
    setXero(status)
    setHistory(hist)
  }

  // Load connection status + history on mount. The Xero-redirect toast and URL
  // cleanup are handled once in App.jsx (so they work on any landing path).
  useEffect(() => {
    refreshXero()
  }, [])

  async function handleExport() {
    setBusy(true)
    try { await exportReportCsv({ from, to }) }
    finally { setBusy(false) }
  }

  async function handleConnect() {
    setConnecting(true)
    try {
      const url = await startXeroConnect()
      window.location.href = url
    } catch (e) {
      toast(`Could not start Xero connect: ${e.message}`)
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Xero? You can reconnect at any time.')) return
    try {
      await disconnectXero()
      await refreshXero()
      toast('Xero disconnected.')
    } catch (e) {
      toast(`Could not disconnect: ${e.message}`)
    }
  }

  // Preview: total approved hours per employee for the selected period.
  const preview = useMemo(() => {
    const byEmp = {}
    for (const r of rows) {
      if (!byEmp[r.employee]) byEmp[r.employee] = { name: r.employee, hours: 0 }
      byEmp[r.employee].hours += r.paid_hours
    }
    return Object.values(byEmp).sort((a, b) => b.hours - a.hours)
  }, [rows])

  async function handlePush() {
    setPushing(true)
    setPushResult(null)
    try {
      const result = await pushToXero(from, to)
      setPushResult(result)
      await refreshXero()
      const n = result.pushed?.length || 0
      toast(n > 0 ? `Pushed ${n} timesheet${n === 1 ? '' : 's'} to Xero as drafts.` : 'Nothing pushed — see details.')
      setShowPush(false)
    } catch (e) {
      setPushResult({ error: e.message, status: e.status })
      setShowPush(false)
      toast(e.message)
    } finally {
      setPushing(false)
    }
  }

  const totals = {
    paid_hours: rows.reduce((a, r) => a + r.paid_hours, 0),
    total_services: rows.reduce((a, r) => a + r.total_services, 0),
    by: Object.fromEntries(
      SERVICE_CATEGORIES.map((c) => [c.service_category_id, rows.reduce((a, r) => a + (r.services_by_category[c.service_category_id] || 0), 0)])
    ),
  }

  return (
    <div className="admin-screen">
      <div className="eyebrow">Payroll</div>
      <h1 className="admin-heading">Reports</h1>

      {/* ---- Payroll sync (Xero) ---- */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="eyebrow">Payroll sync</div>
        {!xero.connected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <p className="muted" style={{ margin: 0 }}>
              Connect Xero to push approved hours as draft timesheets — reviewed and processed in Xero as normal.
            </p>
            <button className="btn btn-gold" style={{ width: 'auto' }} onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Redirecting…' : 'Connect to Xero'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <span className="status approved">Connected</span>
                <span style={{ marginLeft: 10, fontWeight: 500 }}>{xero.tenantName}</span>
                <button className="xero-disconnect" onClick={handleDisconnect}>Disconnect</button>
              </div>
              <button className="btn btn-gold" style={{ width: 'auto' }} onClick={() => { setPushResult(null); setShowPush(true) }} disabled={preview.length === 0}>
                Push to Xero
              </button>
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: '0.78rem' }}>
              Pushes the {from} → {to} period selected below. {preview.length === 0 && 'No approved hours in this range yet.'}
            </p>
          </div>
        )}

        {pushResult && (
          <div className="xero-result">
            {pushResult.status === 'payroll_unavailable' ? (
              <div className="xero-warning-card">
                <div className="xero-warning-icon" aria-hidden="true">⚠️</div>
                <div className="xero-warning-body">
                  <div className="xero-warning-title">Payroll not available on this Xero organisation</div>
                  <p className="xero-warning-text">{pushResult.error}</p>
                  <button
                    className="btn btn-gold"
                    style={{ width: 'auto' }}
                    onClick={handleConnect}
                    disabled={connecting}
                  >
                    {connecting ? 'Redirecting…' : 'Reconnect to Xero'}
                  </button>
                </div>
              </div>
            ) : pushResult.error ? (
              <div className="admin-error">{pushResult.error}</div>
            ) : (
              <>
                {pushResult.pushed?.length > 0 && (
                  <div style={{ color: 'var(--ok)', fontSize: '0.85rem' }}>
                    Pushed: {pushResult.pushed.join(', ')}
                  </div>
                )}
                {pushResult.skipped?.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {pushResult.skipped.map((s, i) => (
                      <div key={i} className="muted" style={{ fontSize: '0.82rem' }}>
                        {s.name} — {s.reason}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Sync history</div>
            <table className="admin-table admin-table-full">
              <thead>
                <tr><th>Pushed</th><th>Period</th><th>Employees</th><th>Hours</th><th>Status</th></tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.push_id}>
                    <td>{new Date(h.pushed_at).toLocaleString()}</td>
                    <td>{h.pay_period_start} → {h.pay_period_end}</td>
                    <td>{h.employee_count}</td>
                    <td>{Number(h.total_hours || 0).toFixed(2)}</td>
                    <td>
                      <span className={'status ' + (h.status === 'success' ? 'approved' : h.status === 'failed' ? 'rejected' : '')}>
                        {h.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Date range + CSV (existing) ---- */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
            From <input className="admin-input" style={{ width: 'auto', display: 'inline' }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
            To <input className="admin-input" style={{ width: 'auto', display: 'inline' }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn btn-line" style={{ width: 'auto', padding: '9px 22px' }} onClick={handleExport} disabled={busy || rows.length === 0}>
            {busy ? 'Exporting…' : 'Export CSV (fallback)'}
          </button>
        </div>
        {rangeError && <div className="admin-error" style={{ marginTop: 10 }}>{rangeError}</div>}
        <p className="muted" style={{ marginTop: 10, fontSize: '0.78rem' }}>Only approved shifts are exported for payroll.</p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table admin-table-full">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Date</th>
              <th>Location</th>
              <th>Hours</th>
              {SERVICE_CATEGORIES.map((c) => <th key={c.service_category_id}>{c.name}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5 + SERVICE_CATEGORIES.length} style={{ padding: 18, color: 'var(--ink-soft)', textAlign: 'center' }}>No approved shifts in this date range.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.shift_id}>
                <td>{r.employee}</td>
                <td>{r.date}</td>
                <td>{r.location}</td>
                <td>{r.paid_hours.toFixed(2)}</td>
                {SERVICE_CATEGORIES.map((c) => <td key={c.service_category_id}>{r.services_by_category[c.service_category_id] || 0}</td>)}
                <td>{r.total_services}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} style={{ fontWeight: 600 }}>Total</td>
                <td style={{ fontWeight: 600 }}>{totals.paid_hours.toFixed(2)}</td>
                {SERVICE_CATEGORIES.map((c) => <td key={c.service_category_id} style={{ fontWeight: 600 }}>{totals.by[c.service_category_id]}</td>)}
                <td style={{ fontWeight: 600 }}>{totals.total_services}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ---- Push confirmation modal ---- */}
      {showPush && (
        <div className="admin-modal-overlay" onClick={() => !pushing && setShowPush(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title">Push hours to Xero?</h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              This will create <b>draft</b> timesheets in Xero for review. Nothing is paid
              automatically — you'll still process payroll in Xero as normal.
            </p>
            <div style={{ fontSize: '0.82rem', marginBottom: 8 }}>Period: <b>{from}</b> → <b>{to}</b></div>
            <table className="admin-table admin-table-full">
              <thead><tr><th>Employee</th><th>Approved hours</th></tr></thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.name}><td>{p.name}</td><td>{p.hours.toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="admin-modal-actions">
              <button className="btn btn-line" style={{ width: 'auto' }} onClick={() => setShowPush(false)} disabled={pushing}>Cancel</button>
              <button className="btn btn-gold" style={{ width: 'auto' }} onClick={handlePush} disabled={pushing}>
                {pushing ? 'Pushing…' : 'Confirm push'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toastMsg} />
    </div>
  )
}
