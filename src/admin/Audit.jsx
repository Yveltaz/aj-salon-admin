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
          <p className="muted" style={{ padding: 18 }}>No audit entries yet. Approvals, rejections, and edits will appear here.</p>
        )}
        {log.map((entry, i) => {
          const before = entry.before_json ? JSON.parse(entry.before_json) : null
          const after = entry.after_json ? JSON.parse(entry.after_json) : null
          const actionClass = entry.action === 'approve' ? 'approved' : entry.action === 'reject' ? 'submitted' : ''
          return (
            <div key={i} style={{ padding: '14px 16px', borderBottom: i < log.length - 1 ? '1px solid #f0e8df' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{entry.actor_name}</span>
                  {' '}
                  <span className={`status ${actionClass}`} style={{ verticalAlign: 'middle' }}>{entry.action}</span>
                  {' '}shift
                </div>
                <span className="muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  {fmtDate(entry.at)} {fmtTime(entry.at)}
                </span>
              </div>
              {entry.reason && (
                <div className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>Reason: {entry.reason}</div>
              )}
              {before && after && (
                <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: '0.78rem', color: 'var(--ink-soft)', flexWrap: 'wrap' }}>
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
