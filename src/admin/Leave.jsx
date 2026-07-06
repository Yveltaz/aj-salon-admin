import React, { useEffect, useState } from 'react'
import {
  getAllLeaveRequests, approveLeave, rejectLeave, getRosteredShiftsInRange,
} from '../api/client.js'
import { parseYmd, daysInclusive, fmtDayLong } from '../components/ui.jsx'

const FILTERS = [
  ['all', 'All'],
  ['pending', 'Pending'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
]

function fmtRange(from, to) {
  const opts = { day: 'numeric', month: 'short' }
  const f = parseYmd(from).toLocaleDateString('en-AU', opts)
  if (from === to) return f
  const t = parseYmd(to).toLocaleDateString('en-AU', opts)
  return `${f} – ${t}`
}

function fmtActioned(iso) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Leave({ employee, onPendingChange }) {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('all')
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [overlapModal, setOverlapModal] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const all = await getAllLeaveRequests()
    setRequests(all)
    onPendingChange?.(all.filter((l) => l.status === 'pending').length)
  }
  useEffect(() => { refresh() }, [])

  async function tryApprove(l) {
    const rostered = await getRosteredShiftsInRange(l.employee_id, l.from, l.to)
    if (rostered.length > 0) { setOverlapModal({ leave: l, shifts: rostered }); return }
    await doApprove(l)
  }

  async function doApprove(l) {
    setBusy(true)
    try { await approveLeave(l.leave_id, employee.employee_id); setOverlapModal(null); await refresh() }
    finally { setBusy(false) }
  }

  async function doReject() {
    if (!rejectReason.trim()) { setError('Reason is required'); return }
    setBusy(true)
    try {
      await rejectLeave(rejectModal.leave_id, employee.employee_id, rejectReason)
      setRejectModal(null); setRejectReason(''); setError('')
      await refresh()
    } finally { setBusy(false) }
  }

  const visible = filter === 'all' ? requests : requests.filter((l) => l.status === filter)

  return (
    <div className="admin-screen">
      <div className="eyebrow">Approvals</div>
      <h1 className="admin-heading">Leave</h1>

      <div className="leave-filter">
        {FILTERS.map(([id, label]) => {
          const count = id === 'all' ? requests.length : requests.filter((l) => l.status === id).length
          return (
            <button key={id} className={'leave-filter-btn' + (filter === id ? ' on' : '')} onClick={() => setFilter(id)}>
              {label} <span className="leave-filter-n">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table admin-table-full">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Notes</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} className="muted" style={{ padding: 16 }}>No leave requests here.</td></tr>
            )}
            {visible.map((l) => (
              <tr key={l.leave_id}>
                <td style={{ fontWeight: 500 }}>{l.employee?.name || l.employee_id}</td>
                <td><span className="chip">{l.type}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtRange(l.from, l.to)}</td>
                <td>{daysInclusive(l.from, l.to)}</td>
                <td className="muted" style={{ maxWidth: 180 }}>{l.notes || '—'}</td>
                <td>
                  <span className={`status ${l.status}`}>{l.status}</span>
                  {l.status === 'rejected' && l.rejection_reason && (
                    <div className="muted" style={{ fontSize: '0.74rem', marginTop: 4 }}>{l.rejection_reason}</div>
                  )}
                  {l.status !== 'pending' && l.actioned_at && (
                    <div className="muted" style={{ fontSize: '0.72rem', marginTop: 4 }}>
                      {fmtActioned(l.actioned_at)}{l.actioned_by_name ? ` · ${l.actioned_by_name}` : ''}
                    </div>
                  )}
                </td>
                <td>
                  {l.status === 'pending' ? (
                    <div className="leave-actions">
                      <button className="btn btn-gold" style={{ width: 'auto', padding: '6px 14px', background: 'var(--ok)', fontSize: '0.74rem' }} onClick={() => tryApprove(l)} disabled={busy}>Approve</button>
                      <button className="btn btn-blush" style={{ width: 'auto', padding: '6px 14px', color: 'var(--warn)', fontSize: '0.74rem' }} onClick={() => { setRejectModal(l); setRejectReason(''); setError('') }}>Reject</button>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: '0.78rem' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rejectModal && (
        <div className="admin-modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">Reject leave</div>
            <h2 className="admin-modal-title">{rejectModal.employee?.name} — {fmtRange(rejectModal.from, rejectModal.to)}</h2>
            <label className="admin-label">Reason <span style={{ color: 'var(--warn)' }}>*</span></label>
            <textarea className="admin-input" rows={3} value={rejectReason} onChange={(e) => { setRejectReason(e.target.value); setError('') }} placeholder="Required — visible to employee" />
            {error && <div className="admin-error">{error}</div>}
            <div className="admin-modal-actions">
              <button className="btn btn-line" style={{ width: 'auto' }} onClick={() => setRejectModal(null)}>Cancel</button>
              <button className="btn btn-gold" style={{ width: 'auto', background: 'var(--warn)' }} onClick={doReject} disabled={busy}>Reject</button>
            </div>
          </div>
        </div>
      )}

      {overlapModal && (
        <div className="admin-modal-overlay" onClick={() => setOverlapModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">Roster conflict</div>
            <h2 className="admin-modal-title">{overlapModal.leave.employee?.name} is rostered</h2>
            <p className="muted">
              {overlapModal.leave.employee?.name} is rostered on{' '}
              {overlapModal.shifts.map((s) => fmtDayLong(s.date)).join(', ')}. Approve anyway?
              Their roster shifts will need to be removed manually.
            </p>
            <div className="admin-modal-actions">
              <button className="btn btn-line" style={{ width: 'auto' }} onClick={() => setOverlapModal(null)}>Cancel</button>
              <button className="btn btn-gold" style={{ width: 'auto' }} onClick={() => doApprove(overlapModal.leave)} disabled={busy}>Approve anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
