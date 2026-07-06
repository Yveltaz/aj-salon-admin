import React, { useEffect, useState } from 'react'
import Dashboard from './Dashboard.jsx'
import Timesheets from './Timesheets.jsx'
import AdminTasks from './AdminTasks.jsx'
import Roster from './Roster.jsx'
import Leave from './Leave.jsx'
import Employees from './Employees.jsx'
import Reports from './Reports.jsx'
import Audit from './Audit.jsx'
import { getShiftsForApproval, getAllLeaveRequests } from '../api/client.js'

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'timesheets', label: 'Timesheets' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'roster', label: 'Roster' },
  { id: 'leave', label: 'Leave' },
  { id: 'employees', label: 'Employees' },
  { id: 'reports', label: 'Reports' },
  { id: 'audit', label: 'Audit' },
]

export default function AdminPortal({ employee, onLogout, landOn }) {
  // App decides where to land (e.g. 'reports' after the Xero OAuth redirect).
  const [page, setPage] = useState(landOn || 'dashboard')
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingLeave, setPendingLeave] = useState(0)

  async function refreshPending() {
    const shifts = await getShiftsForApproval()
    setPendingCount(shifts.length)
  }

  async function refreshPendingLeave() {
    const all = await getAllLeaveRequests()
    setPendingLeave(all.filter((l) => l.status === 'pending').length)
  }

  useEffect(() => { refreshPending(); refreshPendingLeave() }, [])

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-wordmark">
          <div className="admin-wordmark-aj">Amelia <em>Jacob's</em></div>
          <div className="admin-wordmark-sub">Owner portal</div>
        </div>
        <nav className="admin-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={'admin-nav-item' + (page === n.id ? ' on' : '')}
              onClick={() => setPage(n.id)}
            >
              {n.label}
              {n.id === 'timesheets' && pendingCount > 0 && (
                <span className="admin-badge">{pendingCount}</span>
              )}
              {n.id === 'leave' && pendingLeave > 0 && (
                <span className="admin-badge">{pendingLeave}</span>
              )}
            </button>
          ))}
        </nav>
        <button className="admin-signout" onClick={onLogout}>
          {employee.name} · Sign out
        </button>
      </aside>

      <main className="admin-content">
        {page === 'dashboard' && <Dashboard />}
        {page === 'timesheets' && <Timesheets employee={employee} onApprovalChange={refreshPending} />}
        {page === 'tasks' && <AdminTasks />}
        {page === 'roster' && <Roster />}
        {page === 'leave' && <Leave employee={employee} onPendingChange={setPendingLeave} />}
        {page === 'employees' && <Employees />}
        {page === 'reports' && <Reports />}
        {page === 'audit' && <Audit />}
      </main>
    </div>
  )
}
