import React, { useEffect, useState } from 'react'
import { getAllTasks, addTask, deleteTask, LOCATIONS } from '../api/client.js'
import { fmtTime } from '../components/ui.jsx'

export default function AdminTasks() {
  const [tasks, setTasks] = useState([])
  const [form, setForm] = useState({ title: '', description: '', location_id: 'loc_macarthur', due_at: '', priority: 'normal', recurring: '' })
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [error, setError] = useState('')

  async function refresh() { setTasks(await getAllTasks()) }
  useEffect(() => { refresh() }, [])

  function field(key, val) { setForm((f) => ({ ...f, [key]: val })) }

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    if (!form.due_at) { setError('Due time is required'); return }
    await addTask({ ...form, recurring: form.recurring || null })
    setForm({ title: '', description: '', location_id: 'loc_macarthur', due_at: '', priority: 'normal', recurring: '' })
    setError('')
    refresh()
  }

  async function handleDelete(taskId) {
    await deleteTask(taskId)
    setConfirmDelete(null)
    refresh()
  }

  const locName = (id) => LOCATIONS.find((l) => l.location_id === id)?.name || id

  return (
    <div className="admin-screen">
      <div className="eyebrow">Management</div>
      <h1 className="admin-heading">Tasks</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="eyebrow">Create task</div>
        <form onSubmit={handleAdd} style={{ display: 'grid', gap: 10 }}>
          <input className="admin-input" placeholder="Title *" value={form.title} onChange={(e) => field('title', e.target.value)} />
          <input className="admin-input" placeholder="Description" value={form.description} onChange={(e) => field('description', e.target.value)} />
          <select className="admin-input" value={form.location_id} onChange={(e) => field('location_id', e.target.value)}>
            {LOCATIONS.map((l) => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
          </select>
          <input className="admin-input" type="datetime-local" value={form.due_at} onChange={(e) => field('due_at', e.target.value)} />
          <select className="admin-input" value={form.priority} onChange={(e) => field('priority', e.target.value)}>
            <option value="normal">Normal priority</option>
            <option value="high">High priority</option>
          </select>
          <select className="admin-input" value={form.recurring} onChange={(e) => field('recurring', e.target.value)}>
            <option value="">Not recurring</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          {error && <div className="admin-error">{error}</div>}
          <button type="submit" className="btn btn-gold" style={{ marginTop: 4 }}>Add task</button>
        </form>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {tasks.length === 0 && <p className="muted" style={{ padding: 18 }}>No tasks yet.</p>}
        {tasks.map((t, i) => (
          <div key={t.task_id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '13px 16px', borderBottom: i < tasks.length - 1 ? '1px solid #f0e8df' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>
                {t.title}
                {t.recurring && <span className="chip">{t.recurring}</span>}
                {t.priority === 'high' && <span className="chip" style={{ background: '#faeaea', color: 'var(--warn)' }}>high</span>}
              </div>
              {t.description && <div className="muted" style={{ fontSize: '0.82rem' }}>{t.description}</div>}
              <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                Due {fmtTime(t.due_at)} · {locName(t.location_id)} · <span style={{ color: t.status === 'completed' ? 'var(--ok)' : 'inherit' }}>{t.status}</span>
              </div>
            </div>
            <button className="btn btn-blush" style={{ width: 'auto', padding: '6px 14px', color: 'var(--warn)', fontSize: '0.8rem', flexShrink: 0 }} onClick={() => setConfirmDelete(t.task_id)}>Delete</button>
          </div>
        ))}
      </div>

      {confirmDelete && (
        <div className="admin-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title">Delete this task?</h2>
            <p className="muted" style={{ marginBottom: 20 }}>This cannot be undone.</p>
            <div className="admin-modal-actions">
              <button className="btn btn-line" style={{ width: 'auto' }} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-gold" style={{ width: 'auto', background: 'var(--warn)' }} onClick={() => handleDelete(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
