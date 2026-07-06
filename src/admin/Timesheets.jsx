import React, { useEffect, useState } from 'react'
import {
  getShiftsForApproval, approveShift, rejectShift, editShiftHours,
  SERVICE_CATEGORIES, shiftPaidHours,
} from '../api/client.js'
import { fmtDate, fmtTime } from '../components/ui.jsx'

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function Timesheets({ employee, onApprovalChange }) {
  const [shifts, setShifts] = useState([])
  const [rejectModal, setRejectModal] = useState(null)
  const [editModal, setEditModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [editBreaks, setEditBreaks] = useState(0)
  const [editClockOff, setEditClockOff] = useState('')
  const [editReason, setEditReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setShifts(await getShiftsForApproval())
    onApprovalChange?.()
  }
  useEffect(() => { refresh() }, [])

  async function handleApprove(shift) {
    setBusy(true)
    try { await approveShift(shift.shift_id, employee.employee_id); await refresh() }
    finally { setBusy(false) }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setError('Reason is required'); return }
    setBusy(true)
    try {
      await rejectShift(rejectModal.shift_id, employee.employee_id, rejectReason)
      setRejectModal(null); setRejectReason(''); setError('')
      await refresh()
    } finally { setBusy(false) }
  }

  function openEdit(shift) {
    setEditModal(shift)
    setEditBreaks(shift.break_minutes)
    setEditClockOff(toLocalInput(shift.clock_off_at))
    setEditReason(''); setError('')
  }

  async function handleEdit() {
    if (!editReason.trim()) { setError('Reason is required'); return }
    setBusy(true)
    try {
      const newOff = editClockOff ? new Date(editClockOff).toISOString() : editModal.clock_off_at
      await editShiftHours(editModal.shift_id, employee.employee_id, Number(editBreaks), newOff, editReason)
      setEditModal(null); setError('')
      await refresh()
    } finally { setBusy(false) }
  }

  const previewHours = editModal
    ? shiftPaidHours({ ...editModal, break_minutes: Number(editBreaks), clock_off_at: editClockOff ? new Date(editClockOff).toISOString() : editModal.clock_off_at })
    : 0

  return (
    <div className="admin-screen">
      <div className="eyebrow">Approvals</div>
      <h1 className="admin-heading">Timesheets</h1>

      {shifts.length === 0 && (
        <div className="card"><p className="muted">No shifts awaiting approval.</p></div>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {shifts.map((s) => {
          const hours = shiftPaidHours(s)
          const totalSvcs = s.services.reduce((a, x) => a + x.count, 0)
          return (
            <div className="card" key={s.shift_id}>
              <div className="admin-ts-header">
                <div>
                  <div style={{ fontWeight: 600 }}>{s.employee?.name}</div>
                  <div className="muted">{fmtDate(s.clock_on_at)} · {s.location?.name}</div>
                </div>
                <span className="status submitted">submitted</span>
              </div>
              <div className="admin-ts-meta">
                <span>{fmtTime(s.clock_on_at)} – {fmtTime(s.clock_off_at)}</span>
                <span>{s.break_minutes} min break</span>
                <span style={{ fontWeight: 500 }}>{hours.toFixed(2)} h paid</span>
                <span>{totalSvcs} services</span>
              </div>
              {s.services.length > 0 && (
                <div className="admin-ts-services">
                  {s.services.map((x) => {
                    const cat = SERVICE_CATEGORIES.find((c) => c.service_category_id === x.service_category_id)
                    return <span key={x.service_category_id} className="chip">{x.count} {cat?.name}</span>
                  })}
                </div>
              )}
              <div className="admin-ts-actions">
                <button className="btn btn-gold" style={{ width: 'auto', padding: '8px 22px' }} onClick={() => handleApprove(s)} disabled={busy}>Approve</button>
                <button className="btn btn-line" style={{ width: 'auto', padding: '8px 18px' }} onClick={() => openEdit(s)}>Edit</button>
                <button className="btn btn-blush" style={{ width: 'auto', padding: '8px 18px', color: 'var(--warn)' }} onClick={() => { setRejectModal(s); setRejectReason(''); setError('') }}>Reject</button>
              </div>
            </div>
          )
        })}
      </div>

      {rejectModal && (
        <div className="admin-modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">Reject shift</div>
            <h2 className="admin-modal-title">{rejectModal.employee?.name} — {fmtDate(rejectModal.clock_on_at)}</h2>
            <label className="admin-label">Reason <span style={{ color: 'var(--warn)' }}>*</span></label>
            <textarea className="admin-input" rows={3} value={rejectReason} onChange={(e) => { setRejectReason(e.target.value); setError('') }} placeholder="Required — visible to employee" />
            {error && <div className="admin-error">{error}</div>}
            <div className="admin-modal-actions">
              <button className="btn btn-line" style={{ width: 'auto' }} onClick={() => setRejectModal(null)}>Cancel</button>
              <button className="btn btn-gold" style={{ width: 'auto', background: 'var(--warn)' }} onClick={handleReject} disabled={busy}>Reject shift</button>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="admin-modal-overlay" onClick={() => setEditModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">Edit hours</div>
            <h2 className="admin-modal-title">{editModal.employee?.name} — {fmtDate(editModal.clock_on_at)}</h2>

            <div className="admin-before-after">
              <div className="eyebrow" style={{ marginBottom: 4 }}>Before</div>
              <div className="muted">{editModal.break_minutes} min break · {shiftPaidHours(editModal).toFixed(2)} h paid · clock off {fmtTime(editModal.clock_off_at)}</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Clock events (read-only)</div>
              <div className="admin-events">
                {editModal.events?.map((ev) => (
                  <div key={ev.event_id} className="muted" style={{ fontSize: '0.8rem' }}>{ev.event_type.replace(/_/g, ' ')} — {fmtTime(ev.timestamp)}</div>
                ))}
              </div>
            </div>

            <label className="admin-label">Break minutes</label>
            <input className="admin-input" type="number" min={0} step={1} value={editBreaks} onChange={(e) => setEditBreaks(e.target.value)} />

            <label className="admin-label" style={{ marginTop: 10, display: 'block' }}>Clock-off time</label>
            <input className="admin-input" type="datetime-local" value={editClockOff} onChange={(e) => setEditClockOff(e.target.value)} />

            <div className="admin-before-after" style={{ marginTop: 10 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>After (preview)</div>
              <div style={{ color: 'var(--ok)' }}>{Number(editBreaks)} min break · {previewHours.toFixed(2)} h paid</div>
            </div>

            <label className="admin-label" style={{ marginTop: 10, display: 'block' }}>Reason <span style={{ color: 'var(--warn)' }}>*</span></label>
            <textarea className="admin-input" rows={2} value={editReason} onChange={(e) => { setEditReason(e.target.value); setError('') }} placeholder="Required" />
            {error && <div className="admin-error">{error}</div>}

            <div className="admin-modal-actions">
              <button className="btn btn-line" style={{ width: 'auto' }} onClick={() => setEditModal(null)}>Cancel</button>
              <button className="btn btn-gold" style={{ width: 'auto' }} onClick={handleEdit} disabled={busy}>Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
