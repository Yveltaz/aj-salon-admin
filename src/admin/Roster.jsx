import React, { useEffect, useState } from 'react'
import {
  getRosterWeek, saveRosterShift, deleteRosterShift,
  publishRoster, unpublishRoster, copyRosterWeek,
  getAllLeaveRequests, getEmployees, LOCATIONS,
} from '../api/client.js'
import { ymd, parseYmd, addDays, mondayOf, weekDates, weekLabel, fmtDayLong } from '../components/ui.jsx'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SHORT = { loc_macarthur: 'Macarthur', loc_edpark: 'Ed Park' }

export default function Roster() {
  const [weekStart, setWeekStart] = useState(() => ymd(mondayOf(new Date())))
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [leaveDates, setLeaveDates] = useState(new Set())
  const [editor, setEditor] = useState(null)
  const [editorError, setEditorError] = useState('')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const [emps, weekShifts, leaves] = await Promise.all([
      getEmployees(), getRosterWeek(weekStart), getAllLeaveRequests(),
    ])
    setEmployees(emps.filter((e) => e.role !== 'owner' && e.active !== false))
    setShifts(weekShifts)
    const set = new Set()
    for (const l of leaves) {
      if (l.status !== 'approved') continue
      let cur = parseYmd(l.from)
      const end = parseYmd(l.to)
      while (cur <= end) { set.add(l.employee_id + '|' + ymd(cur)); cur = addDays(cur, 1) }
    }
    setLeaveDates(set)
  }
  useEffect(() => { refresh() }, [weekStart])

  const todayStr = ymd(new Date())
  const days = weekDates(weekStart)
  const shiftWeek = (delta) => setWeekStart(ymd(addDays(parseYmd(weekStart), delta)))

  function openCell(emp, dateStr, shift) {
    setEditorError('')
    setEditor({
      roster_id: shift?.roster_id || null,
      employee_id: emp.employee_id,
      employee_name: emp.name,
      date: dateStr,
      location_id: shift?.location_id || 'loc_macarthur',
      start_time: shift?.start_time || '09:00',
      end_time: shift?.end_time || '17:00',
      notes: shift?.notes || '',
      published: shift?.published || false,
    })
  }

  const editorHasLeave = editor ? leaveDates.has(editor.employee_id + '|' + editor.date) : false

  function field(key, val) { setEditor((e) => ({ ...e, [key]: val })) }

  async function save() {
    setEditorError('')
    setBusy(true)
    try {
      await saveRosterShift({
        roster_id: editor.roster_id,
        employee_id: editor.employee_id,
        location_id: editor.location_id,
        date: editor.date,
        start_time: editor.start_time,
        end_time: editor.end_time,
        notes: editor.notes,
        published: editor.published,
      })
      setEditor(null)
      await refresh()
    } catch (e) {
      setEditorError(e.message)
    } finally { setBusy(false) }
  }

  async function del() {
    setBusy(true)
    try {
      if (editor.roster_id) await deleteRosterShift(editor.roster_id)
      setEditor(null)
      await refresh()
    } finally { setBusy(false) }
  }

  async function doPublish() {
    setBusy(true)
    try { await publishRoster(weekStart); setConfirmPublish(false); await refresh() }
    finally { setBusy(false) }
  }

  async function doUnpublish() {
    setBusy(true)
    try { await unpublishRoster(weekStart); setConfirmUnpublish(false); await refresh() }
    finally { setBusy(false) }
  }

  async function copyLast() {
    setBusy(true)
    try { await copyRosterWeek(weekStart); await refresh() }
    finally { setBusy(false) }
  }

  return (
    <div className="admin-screen">
      <div className="eyebrow">Scheduling</div>
      <h1 className="admin-heading">Roster</h1>

      <div className="rost-admin-top">
        <div className="rost-weeknav">
          <button onClick={() => shiftWeek(-7)} aria-label="Previous week">‹</button>
          <span className="rost-weeklabel">{weekLabel(weekStart)}</span>
          <button onClick={() => shiftWeek(7)} aria-label="Next week">›</button>
        </div>
        <div className="rost-admin-actions">
          <button className="btn btn-line" style={{ width: 'auto' }} onClick={copyLast} disabled={busy}>Copy last week</button>
          <div className="rost-publish-group">
            <button className="btn btn-gold" style={{ width: 'auto' }} onClick={() => setConfirmPublish(true)} disabled={busy}>Publish week</button>
            <button className="rost-unpublish-link" onClick={() => setConfirmUnpublish(true)} disabled={busy}>Unpublish</button>
          </div>
        </div>
      </div>

      <div className="rost-admin-scroll">
        <table className="rost-admin-table">
          <thead>
            <tr>
              <th className="rost-admin-corner">Staff</th>
              {days.map((d, i) => (
                <th key={i} className={ymd(d) === todayStr ? 'rost-th-today' : ''}>
                  <span className="rost-th-day">{DAY_NAMES[i]}</span>
                  <span className="rost-th-num">{d.getDate()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ padding: 16 }}>No active staff to roster.</td></tr>
            )}
            {employees.map((emp) => (
              <tr key={emp.employee_id}>
                <td className="rost-empname">{emp.name}</td>
                {days.map((d) => {
                  const ds = ymd(d)
                  const shift = shifts.find((s) => s.employee_id === emp.employee_id && s.date === ds)
                  const hasLeave = leaveDates.has(emp.employee_id + '|' + ds)
                  return (
                    <td key={ds} className="rost-admin-cell">
                      <button className="rost-admin-slot" onClick={() => openCell(emp, ds, shift)}>
                        {shift ? (
                          <span className={'rost-chip ' + (shift.published ? 'pub' : 'draft')}>
                            <b>{SHORT[shift.location_id] || shift.location_id}</b>
                            <span>{shift.start_time}–{shift.end_time}</span>
                          </span>
                        ) : hasLeave ? (
                          <span className="rost-leave-pill">Leave</span>
                        ) : (
                          <span className="rost-add">+</span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ marginTop: 14 }}>
        <span className="rost-legend pub" /> Published &nbsp;·&nbsp;
        <span className="rost-legend draft" /> Draft (staff can’t see yet)
      </p>

      {editor && (
        <div className="admin-modal-overlay" onClick={() => setEditor(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">{editor.roster_id ? 'Edit shift' : 'New shift'}</div>
            <h2 className="admin-modal-title">{editor.employee_name} — {fmtDayLong(editor.date)}</h2>

            {editorHasLeave && (
              <div className="rost-warn">
                {editor.employee_name} has approved leave on this day. Remove the leave approval before rostering a shift.
              </div>
            )}

            <label className="admin-label">Location</label>
            <select className="admin-input" value={editor.location_id} onChange={(e) => field('location_id', e.target.value)}>
              {LOCATIONS.map((l) => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
            </select>

            <div className="leave-dates" style={{ marginTop: 4 }}>
              <div>
                <label className="admin-label">Start</label>
                <input className="admin-input" type="time" value={editor.start_time} onChange={(e) => field('start_time', e.target.value)} />
              </div>
              <div>
                <label className="admin-label">End</label>
                <input className="admin-input" type="time" value={editor.end_time} onChange={(e) => field('end_time', e.target.value)} />
              </div>
            </div>

            <label className="admin-label" style={{ marginTop: 4 }}>Notes (optional)</label>
            <textarea className="admin-input" rows={2} value={editor.notes} onChange={(e) => field('notes', e.target.value)} />

            {editorError && <div className="admin-error">{editorError}</div>}

            <div className="admin-modal-actions">
              {editor.roster_id && (
                <button className="btn btn-blush" style={{ width: 'auto', color: 'var(--warn)', marginRight: 'auto' }} onClick={del} disabled={busy}>Delete</button>
              )}
              <button className="btn btn-line" style={{ width: 'auto' }} onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn btn-gold" style={{ width: 'auto' }} onClick={save} disabled={busy || editorHasLeave}>Save</button>
            </div>
          </div>
        </div>
      )}

      {confirmPublish && (
        <div className="admin-modal-overlay" onClick={() => setConfirmPublish(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title">Publish roster for {weekLabel(weekStart)}?</h2>
            <p className="muted">Staff will be notified.</p>
            <div className="admin-modal-actions">
              <button className="btn btn-line" style={{ width: 'auto' }} onClick={() => setConfirmPublish(false)}>Cancel</button>
              <button className="btn btn-gold" style={{ width: 'auto' }} onClick={doPublish} disabled={busy}>Publish</button>
            </div>
          </div>
        </div>
      )}

      {confirmUnpublish && (
        <div className="admin-modal-overlay" onClick={() => setConfirmUnpublish(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title">Unpublish {weekLabel(weekStart)}?</h2>
            <p className="muted">Staff will no longer see this week's roster.</p>
            <div className="admin-modal-actions">
              <button className="btn btn-line" style={{ width: 'auto' }} onClick={() => setConfirmUnpublish(false)}>Cancel</button>
              <button className="btn btn-gold" style={{ width: 'auto', background: 'var(--warn)' }} onClick={doUnpublish} disabled={busy}>Unpublish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
