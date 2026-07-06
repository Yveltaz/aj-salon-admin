import React, { useEffect, useState } from 'react'
import { getAdminDashboard } from '../api/client.js'
import { supabase } from '../api/supabase.js'

export default function Dashboard() {
  const [data, setData] = useState(null)

  useEffect(() => {
    const refreshDashboard = () => getAdminDashboard().then(setData)
    refreshDashboard()
    // Live updates: re-pull the dashboard whenever any shift row changes so the
    // "staff clocked on now" count tracks the floor in real time.
    const channel = supabase
      .channel('dashboard-shifts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, refreshDashboard)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  if (!data) return <div className="admin-screen" />

  const maxHours = Math.max(1, ...data.perLocationToday.map((l) => l.hours))
  const maxSvcs = Math.max(1, ...data.perLocationToday.map((l) => l.services))

  const stats = [
    { n: data.clockedOnNow.length, k: 'Staff clocked on now' },
    { n: data.todayHours.toFixed(1), k: 'Total hours today' },
    { n: data.todayServices, k: 'Total services today' },
    { n: data.pendingApprovalCount, k: 'Shifts awaiting approval', warn: data.pendingApprovalCount > 0 },
    { n: data.overdueTaskCount, k: 'Tasks overdue', warn: data.overdueTaskCount > 0 },
  ]

  return (
    <div className="admin-screen">
      <div className="eyebrow">Overview</div>
      <h1 className="admin-heading">Dashboard</h1>

      <div className="admin-stat-grid">
        {stats.map((s) => (
          <div className="card admin-stat" key={s.k}>
            <div className="admin-stat-n" style={{ color: s.warn ? 'var(--warn)' : undefined }}>{s.n}</div>
            <div className="admin-stat-k">{s.k}</div>
          </div>
        ))}
      </div>

      <div className="admin-row">
        <div className="card" style={{ flex: 1 }}>
          <div className="eyebrow">Location comparison — today</div>
          {data.perLocationToday.map((loc) => (
            <div key={loc.location_id} style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>{loc.name}</div>
              <div className="bar-row">
                <span>Hours</span>
                <span className="bar"><i style={{ width: `${(loc.hours / maxHours) * 100}%` }} /></span>
                <span className="bn">{loc.hours.toFixed(1)}</span>
              </div>
              <div className="bar-row">
                <span>Services</span>
                <span className="bar"><i style={{ width: `${(loc.services / maxSvcs) * 100}%` }} /></span>
                <span className="bn">{loc.services}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ flex: 1 }}>
          <div className="eyebrow">Top staff this week</div>
          {data.topStaff.length === 0 ? (
            <p className="muted">No shifts this week yet.</p>
          ) : (
            <table className="admin-table admin-table-full">
              <thead>
                <tr><th>Name</th><th>Services</th><th>Hours</th><th>Svcs/hr</th></tr>
              </thead>
              <tbody>
                {data.topStaff.map((s) => (
                  <tr key={s.employee_id}>
                    <td>{s.name}</td>
                    <td>{s.services}</td>
                    <td>{s.hours.toFixed(1)}</td>
                    <td>{s.servicesPerHour.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
