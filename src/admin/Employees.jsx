import React, { useEffect, useRef, useState } from 'react'
import {
  getEmployees, getRemovedEmployees, addEmployee, setEmployeeActive,
  removeEmployee, getEmployeePin,
} from '../api/client.js'
import { Toast } from '../components/ui.jsx'

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [removed, setRemoved] = useState([])
  const [showRemoved, setShowRemoved] = useState(false)
  const [form, setForm] = useState({ name: '', role: 'Stylist', pin: '' })
  const [error, setError] = useState('')
  const [toastMsg, setToastMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const toastTimer = useRef(null)

  // Remove-confirmation modal state.
  const [removeTarget, setRemoveTarget] = useState(null) // { ...emp, pin }
  const [confirmText, setConfirmText] = useState('')
  const [removeReason, setRemoveReason] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [removing, setRemoving] = useState(false)

  const toast = (msg) => {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 3200)
  }

  async function refresh() {
    const [active, gone] = await Promise.all([getEmployees(), getRemovedEmployees()])
    setEmployees(active)
    setRemoved(gone)
  }
  useEffect(() => { refresh() }, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!/^\d{4}$/.test(form.pin)) { setError('PIN must be exactly 4 digits'); return }
    setSaving(true)
    try {
      const added = await addEmployee(form)
      setForm({ name: '', role: 'Stylist', pin: '' })
      setError('')
      toast(`${added.name} added — they can log in immediately with their PIN.`)
      refresh()
    } catch (err) {
      // Add failed (and any partial row was rolled back) — surface the reason
      // and do not show the employee as added.
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(emp) {
    await setEmployeeActive(emp.employee_id, emp.active === false)
    refresh()
  }

  async function openRemove(emp) {
    setConfirmText('')
    setRemoveReason('')
    setRemoveError('')
    // Fetch the PIN on-demand so the confirmation can name the PIN being retired.
    let pin = null
    try { pin = await getEmployeePin(emp.employee_id) } catch { /* non-fatal */ }
    setRemoveTarget({ ...emp, pin })
  }

  async function confirmRemove() {
    if (confirmText !== 'REMOVE') return
    setRemoving(true)
    setRemoveError('')
    try {
      await removeEmployee(removeTarget.employee_id, removeReason.trim() || null)
      setRemoveTarget(null)
      toast('Removed. Their history is preserved in Reports and Audit.')
      await refresh()
    } catch (err) {
      setRemoveError(err.message)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="admin-screen">
      <div className="eyebrow">Management</div>
      <h1 className="admin-heading">Employees</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="eyebrow">Add employee</div>
        <form onSubmit={handleAdd} style={{ display: 'grid', gap: 10 }}>
          <input className="admin-input" placeholder="Full name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <select className="admin-input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            <option>Senior stylist</option>
            <option>Colourist</option>
            <option>Stylist</option>
            <option>Apprentice</option>
          </select>
          <input className="admin-input" placeholder="4-digit PIN *" maxLength={4} inputMode="numeric" value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} />
          {error && <div className="admin-error">{error}</div>}
          <button type="submit" className="btn btn-gold" disabled={saving}>
            {saving ? 'Adding…' : 'Add employee'}
          </button>
        </form>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {employees.map((emp, i) => (
          <div key={emp.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < employees.length - 1 ? '1px solid #f0e8df' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{emp.name}</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>{emp.role}</div>
            </div>
            {emp.role === 'owner' ? (
              <span className="status approved">owner</span>
            ) : (
              <>
                <label className="admin-toggle" title={emp.active === false ? 'Activate' : 'Deactivate'}>
                  <input type="checkbox" checked={emp.active !== false} onChange={() => toggleActive(emp)} />
                  <span className="admin-toggle-track" />
                </label>
                <button
                  className="emp-remove-btn"
                  onClick={() => openRemove(emp)}
                  title="Permanently remove this employee"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Removed staff — read-only reference list */}
      <div style={{ marginTop: 20 }}>
        <button
          className="emp-removed-toggle"
          onClick={() => setShowRemoved((v) => !v)}
        >
          {showRemoved ? '▾' : '▸'} Show removed staff ({removed.length})
        </button>
        {showRemoved && (
          <div className="card" style={{ padding: 0, marginTop: 10 }}>
            {removed.length === 0 && (
              <p className="muted" style={{ padding: 16 }}>No removed staff.</p>
            )}
            {removed.map((emp, i) => (
              <div key={emp.employee_id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < removed.length - 1 ? '1px solid #f0e8df' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>
                    {emp.name}
                    {emp.original_name && (
                      <span className="muted" style={{ fontWeight: 400 }}> · was {emp.original_name}</span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    Removed {emp.removed_at ? new Date(emp.removed_at).toLocaleDateString() : '—'}
                    {emp.reason ? ` · ${emp.reason}` : ''}
                  </div>
                </div>
                <span className="status rejected">Removed</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Serious, irreversible remove confirmation */}
      {removeTarget && (
        <div className="admin-modal-overlay" onClick={() => !removing && setRemoveTarget(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title">Remove {removeTarget.name} permanently?</h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              This cannot be undone. Their PIN ({removeTarget.pin || '????'}) will never work
              again, and their name will be replaced with “Former employee” everywhere in the app.
              Their shift history, hours, and records are kept for payroll and reporting.
            </p>

            <label className="admin-label">Type <b>REMOVE</b> to confirm</label>
            <input
              className="admin-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="REMOVE"
              autoFocus
            />

            <label className="admin-label" style={{ marginTop: 8 }}>Reason (optional)</label>
            <input
              className="admin-input"
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="Why are you removing them? e.g. left the salon"
            />

            {removeError && <div className="admin-error">{removeError}</div>}

            <div className="admin-modal-actions">
              <button className="btn btn-line" style={{ width: 'auto' }} onClick={() => setRemoveTarget(null)} disabled={removing}>Cancel</button>
              <button
                className="btn btn-gold"
                style={{ width: 'auto', background: 'var(--warn)' }}
                onClick={confirmRemove}
                disabled={removing || confirmText !== 'REMOVE'}
              >
                {removing ? 'Removing…' : 'Remove permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toastMsg} />
    </div>
  )
}
