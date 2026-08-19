import React, { useEffect, useState } from 'react'
import { getAuditLog } from '../api/client.js'
import { fmtDate, fmtTime } from '../components/ui.jsx'

export default function Audit() {
  const [log, setLog] = useState([])

  useEffect(() => { getAuditLog().then(setLog) }, [])

  return (
    <div className="admin-screen">
      <div className="eyebrow">Accountability</div>
      <h1 className="admin-heading">Audit log</h1>

      <div className="card" style={{ padding: 0 }}>
        {log.length === 0 && (
          <p className="muted admin-list-empty">No audit entries yet. Approvals, rejections, and edits will appear here.</p>
        )}
        {log.map((entry, i) => {
          const before = entry.before_json ? JSON.parse(entry.before_json) : null
          const after = entry.after_json ? JSON.parse(entry.after_json) : null
          const actionClass = entry.action === 'approve' ? 'approved' : entry.action === 'reject' ? 'submitted' : ''
          return (
            <div key={i} className="admin-list-entry">
              <div className="admin-entry-head">
                <div className="admin-list-title">
                  {entry.actor_name}
                  {' '}
                  <span className={`status ${actionClass}`} style={{ verticalAlign: 'middle' }}>{entry.action}</span>
                  {' '}shift
                </div>
                <span className="admin-list-side">
                  {fmtDate(entry.at)} {fmtTime(entry.at)}
                </span>
              </div>
              {entry.reason && (
                <div className="admin-list-sub">Reason: {entry.reason}</div>
              )}
              {before && after && (
                <div className="admin-entry-diff">
                  <span>Before: status={before.status}{before.break_minutes !== undefined ? `, ${before.break_minutes} min break` : ''}</span>
                  <span>→ After: status={after.status}{after.break_minutes !== undefined ? `, ${after.break_minutes} min break` : ''}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
