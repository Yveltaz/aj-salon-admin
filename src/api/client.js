// ---------------------------------------------------------------------------
// Amelia Jacob's Salon — ADMIN data layer (Supabase backend)
//
// This is the admin-only slice of the data layer, extracted from the staff app.
// It contains only the owner/admin surface — dashboard, timesheet approvals,
// tasks, roster, leave, employees, reports, audit log, and Xero sync. Staff-only
// functions (PIN login, clock on/off, breaks, personal KPIs/history) live in the
// staff app and are intentionally absent here.
//
// Auth note: unlike the staff app (synthetic `{pin}@aj-salon.internal` users),
// the admin app signs in Amelia with a real email + password + TOTP 2FA via
// Supabase Auth. Every call below runs under that authenticated session; RLS
// allows authenticated read/write. `actorId` passed to the audit-writing
// functions is the owner's employee_id (resolved once at login in App.jsx).
// ---------------------------------------------------------------------------

import { supabase } from './supabase.js'

// Reference data — small, fixed, and identical to the seeded `locations` and
// `service_categories` tables. Kept as constants so screens can resolve names
// synchronously (e.g. LOCATIONS.find(...)).
export const LOCATIONS = [
  { location_id: 'loc_macarthur', name: 'Macarthur Square', address: 'Macarthur Square, Campbelltown NSW' },
  { location_id: 'loc_edpark', name: 'Ed Park', address: 'Ed Park, Kirrawee NSW' },
]

export const SERVICE_CATEGORIES = [
  { service_category_id: 'svc_colours', name: 'Colours', display_order: 1 },
  { service_category_id: 'svc_extensions', name: 'Extensions', display_order: 2 },
  { service_category_id: 'svc_haircuts', name: 'Haircuts', display_order: 3 },
  { service_category_id: 'svc_washblow', name: 'Wash & blow dry', display_order: 4 },
  { service_category_id: 'svc_treatments', name: 'Treatments', display_order: 5 },
]

// Columns safe to surface to the UI — never includes `pin`.
const EMP_COLS = 'employee_id, user_id, name, role, active, removed_at'

const uid = () => 'id_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

// Add n days to a YYYY-MM-DD string, returning a YYYY-MM-DD string (local-safe).
function addDaysStr(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// Fetch the employee directory keyed by employee_id (pin excluded).
async function employeeMap() {
  const { data, error } = await supabase.from('employees').select(EMP_COLS)
  if (error) throw new Error(error.message)
  const map = {}
  for (const e of data) map[e.employee_id] = e
  return map
}

const locationOf = (id) => LOCATIONS.find((l) => l.location_id === id)

// Map a leave_requests row to the shape screens expect (from/to aliases).
const mapLeave = (l) => ({ ...l, from: l.from_date, to: l.to_date })

// Paid hours for a completed shift (worked minus break).
export function shiftPaidHours(s) {
  if (!s.clock_off_at) return 0
  const mins = (new Date(s.clock_off_at) - new Date(s.clock_on_at)) / 60000 - (s.break_minutes || 0)
  return Math.max(0, mins / 60)
}

// --- auth ------------------------------------------------------------------

// Resolve the owner's employee row — used as the audit `actorId` and for the
// sidebar display name. The admin auth account is a separate Supabase Auth user
// from the PIN-based staff logins, so we look the owner up by role.
export async function getOwnerEmployee() {
  const { data, error } = await supabase
    .from('employees').select(EMP_COLS).eq('role', 'owner').limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

export async function logout() {
  await supabase.auth.signOut()
}

// --- dashboard --------------------------------------------------------------

export async function getAdminDashboard() {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [{ data: shifts }, { data: services }, { data: tasks }, employees] = await Promise.all([
    supabase.from('shifts').select('*'),
    supabase.from('shift_services').select('*'),
    supabase.from('tasks').select('*'),
    employeeMap(),
  ])
  const allShifts = shifts || []
  const allServices = services || []
  const allTasks = tasks || []

  const clockedOnNow = allShifts
    .filter((s) => s.status === 'active')
    .map((s) => ({
      employee: employees[s.employee_id] || {},
      location: locationOf(s.location_id),
      clock_on_at: s.clock_on_at,
    }))

  const todayShifts = allShifts.filter(
    (s) => s.clock_on_at.slice(0, 10) === todayStr && (s.status === 'submitted' || s.status === 'approved')
  )
  const todayHours = todayShifts.reduce((a, s) => a + shiftPaidHours(s), 0)
  const todayShiftIds = new Set(todayShifts.map((s) => s.shift_id))
  const todayServices = allServices
    .filter((x) => todayShiftIds.has(x.shift_id))
    .reduce((a, x) => a + x.count, 0)

  const pendingApprovalCount = allShifts.filter((s) => s.status === 'submitted').length
  const overdueTaskCount = allTasks.filter((t) => t.status !== 'completed' && new Date(t.due_at) < new Date()).length

  const perLocationToday = LOCATIONS.map((loc) => {
    const ls = todayShifts.filter((s) => s.location_id === loc.location_id)
    const lIds = new Set(ls.map((s) => s.shift_id))
    return {
      location_id: loc.location_id,
      name: loc.name,
      hours: ls.reduce((a, s) => a + shiftPaidHours(s), 0),
      services: allServices.filter((x) => lIds.has(x.shift_id)).reduce((a, x) => a + x.count, 0),
    }
  })

  const weekAgo = Date.now() - 7 * 86400000
  const weekShifts = allShifts.filter(
    (s) => (s.status === 'approved' || s.status === 'submitted') && new Date(s.clock_on_at).getTime() >= weekAgo
  )
  const empStats = {}
  for (const s of weekShifts) {
    if (!empStats[s.employee_id]) {
      const emp = employees[s.employee_id]
      // Skip owner and removed staff from the leaderboard. Their historical
      // shifts still count toward location/day totals above.
      if (!emp || emp.role === 'owner' || emp.removed_at) continue
      empStats[s.employee_id] = { employee_id: s.employee_id, name: emp.name, hours: 0, services: 0 }
    }
    if (empStats[s.employee_id]) empStats[s.employee_id].hours += shiftPaidHours(s)
  }
  const weekShiftIds = new Set(weekShifts.map((s) => s.shift_id))
  for (const x of allServices.filter((x) => weekShiftIds.has(x.shift_id))) {
    const s = weekShifts.find((sh) => sh.shift_id === x.shift_id)
    if (s && empStats[s.employee_id]) empStats[s.employee_id].services += x.count
  }
  const topStaff = Object.values(empStats)
    .map((e) => ({ ...e, servicesPerHour: e.hours > 0 ? e.services / e.hours : 0 }))
    .sort((a, b) => b.services - a.services)

  return { clockedOnNow, todayHours, todayServices, pendingApprovalCount, overdueTaskCount, perLocationToday, topStaff }
}

// --- timesheets / approvals -------------------------------------------------

export async function getShiftsForApproval() {
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('status', 'submitted')
    .order('clock_on_at', { ascending: true })
  if (error) throw new Error(error.message)
  if (shifts.length === 0) return []
  const ids = shifts.map((s) => s.shift_id)
  const [{ data: services }, { data: events }, employees] = await Promise.all([
    supabase.from('shift_services').select('*').in('shift_id', ids),
    supabase.from('shift_events').select('*').in('shift_id', ids),
    employeeMap(),
  ])
  return shifts.map((s) => ({
    ...s,
    employee: employees[s.employee_id] || {},
    location: locationOf(s.location_id),
    services: (services || []).filter((x) => x.shift_id === s.shift_id),
    events: (events || []).filter((x) => x.shift_id === s.shift_id),
  }))
}

async function getShiftRow(shiftId) {
  const { data } = await supabase.from('shifts').select('*').eq('shift_id', shiftId).maybeSingle()
  return data
}

async function writeAudit(entry) {
  await supabase.from('audit_log').insert({ at: new Date().toISOString(), ...entry })
}

export async function approveShift(shiftId, actorId) {
  const before = await getShiftRow(shiftId)
  if (!before || before.status !== 'submitted') throw new Error('Shift not submitted')
  const { data: after, error } = await supabase
    .from('shifts')
    .update({
      status: 'approved',
      approved_hours: shiftPaidHours(before),
      approved_by: actorId,
      approved_at: new Date().toISOString(),
    })
    .eq('shift_id', shiftId).select().single()
  if (error) throw new Error(error.message)
  await writeAudit({ actor_id: actorId, entity_type: 'shift', entity_id: shiftId, action: 'approve', before_json: before, after_json: after, reason: null })
  return after
}

export async function rejectShift(shiftId, actorId, reason) {
  if (!reason) throw new Error('Reason is required')
  const before = await getShiftRow(shiftId)
  if (!before || before.status !== 'submitted') throw new Error('Shift not submitted')
  const { data: after, error } = await supabase
    .from('shifts')
    .update({ status: 'rejected', rejection_reason: reason })
    .eq('shift_id', shiftId).select().single()
  if (error) throw new Error(error.message)
  await writeAudit({ actor_id: actorId, entity_type: 'shift', entity_id: shiftId, action: 'reject', before_json: before, after_json: after, reason })
  return after
}

export async function editShiftHours(shiftId, actorId, newBreakMinutes, newClockOff, reason) {
  if (!reason) throw new Error('Reason is required')
  const before = await getShiftRow(shiftId)
  if (!before || before.status !== 'submitted') throw new Error('Shift not submitted')
  const patch = {}
  if (newBreakMinutes !== undefined && newBreakMinutes !== null) patch.break_minutes = Number(newBreakMinutes)
  if (newClockOff) patch.clock_off_at = newClockOff
  const { data: after, error } = await supabase
    .from('shifts').update(patch).eq('shift_id', shiftId).select().single()
  if (error) throw new Error(error.message)
  await writeAudit({ actor_id: actorId, entity_type: 'shift', entity_id: shiftId, action: 'edit', before_json: before, after_json: after, reason })
  return after
}

// --- employees --------------------------------------------------------------

// Active employees only by default. Pass { includeRemoved: true } to also return
// anonymized/removed rows (for the Employees screen's "Show removed staff" list).
export async function getEmployees({ includeRemoved = false } = {}) {
  let q = supabase.from('employees').select(EMP_COLS)
  if (!includeRemoved) q = q.is('removed_at', null)
  const { data, error } = await q.order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return data
}

// Removed (anonymized) employees with their removal date and the reason recorded
// in the audit log at removal time. Read-only — for the owner's own reference.
export async function getRemovedEmployees() {
  const { data: emps, error } = await supabase
    .from('employees')
    .select('employee_id, name, removed_at')
    .not('removed_at', 'is', null)
    .order('removed_at', { ascending: false })
  if (error) throw new Error(error.message)
  if (!emps || emps.length === 0) return []
  const ids = emps.map((e) => e.employee_id)
  const { data: audits } = await supabase
    .from('audit_log')
    .select('entity_id, reason, before_json, at')
    .eq('action', 'remove')
    .in('entity_id', ids)
    .order('id', { ascending: false })
  // Keep the most recent remove entry per employee (list is newest-first).
  const meta = {}
  for (const a of audits || []) {
    if (meta[a.entity_id]) continue
    const before = typeof a.before_json === 'string' ? JSON.parse(a.before_json || '{}') : (a.before_json || {})
    meta[a.entity_id] = { reason: a.reason || null, original_name: before.name || null }
  }
  return emps.map((e) => ({
    ...e,
    reason: meta[e.employee_id]?.reason || null,
    original_name: meta[e.employee_id]?.original_name || null,
  }))
}

// Fetch a single employee's PIN on-demand — used only to display the PIN that is
// about to be retired in the remove-confirmation modal. Deliberately scoped: the
// PIN is never included in list payloads (see EMP_COLS).
export async function getEmployeePin(employeeId) {
  const { data, error } = await supabase
    .from('employees').select('pin').eq('employee_id', employeeId).single()
  if (error) throw new Error(error.message)
  return data?.pin || null
}

// Permanently remove (anonymize + revoke login) an employee via the Edge
// Function. Irreversible: the auth user is deleted and the row is anonymized to
// "Former employee", but the employee_id and all history are preserved.
export async function removeEmployee(employeeId, reason) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/remove-staff-login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ employeeId, reason }),
    }
  )
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(result.error || 'Could not remove employee')
  return result
}

export async function addEmployee({ name, role, pin }) {
  // Reject duplicate PINs before inserting (cheap pre-check; the unique
  // constraint and the Edge Function both back this up).
  const { data: existing } = await supabase.from('employees').select('employee_id').eq('pin', pin).maybeSingle()
  if (existing) throw new Error('PIN already in use')

  const employee_id = uid()
  const { data: emp, error } = await supabase
    .from('employees')
    .insert({ employee_id, name, role, pin, active: true })
    .select(EMP_COLS).single()
  if (error) {
    if (error.message.includes('duplicate') || error.code === '23505') throw new Error('PIN already in use')
    throw new Error(error.message)
  }

  // Create the auth login via the Edge Function (uses the current admin's
  // session token) so the new PIN can sign in immediately — no manual seed step.
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ pin, employeeId: employee_id }),
    }
  )
  const result = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Roll back the employee row so we don't leave an orphaned record with no login.
    await supabase.from('employees').delete().eq('employee_id', employee_id)
    throw new Error(result.error || 'Could not create staff login')
  }

  return emp
}

export async function setEmployeeActive(id, active) {
  const { data, error } = await supabase
    .from('employees').update({ active }).eq('employee_id', id).select(EMP_COLS).single()
  if (error) throw new Error('Employee not found')
  return data
}

// --- tasks ------------------------------------------------------------------

export async function getAllTasks() {
  const { data, error } = await supabase.from('tasks').select('*').order('due_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data
}

export async function addTask({ title, description, location_id, due_at, priority, recurring }) {
  const task = {
    task_id: uid(),
    title,
    description: description || '',
    location_id,
    assigned_to: null,
    due_at: due_at ? new Date(due_at).toISOString() : null,
    priority: priority || 'normal',
    status: 'pending',
    recurring: recurring || null,
  }
  const { data, error } = await supabase.from('tasks').insert(task).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteTask(taskId) {
  const { data, error } = await supabase.from('tasks').delete().eq('task_id', taskId).select()
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Task not found')
}

// --- reports ----------------------------------------------------------------

// Largest report window we allow — guards against absurd ranges (e.g. year 0001
// to 9999) that would scan the whole shifts table and hurt performance.
const MAX_REPORT_DAYS = 366

// Validate a from/to pair (YYYY-MM-DD, inclusive). Throws a friendly Error on a
// malformed date, a reversed range, or a range wider than MAX_REPORT_DAYS.
export function validateDateRange(from, to) {
  const f = new Date(from)
  const t = new Date(to)
  if (!from || !to || Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) {
    throw new Error('Please choose valid from and to dates.')
  }
  if (t < f) throw new Error('The “to” date can’t be before the “from” date.')
  const days = Math.round((t - f) / 86400000) + 1
  if (days > MAX_REPORT_DAYS) {
    throw new Error(`Date range is too large (max ${MAX_REPORT_DAYS} days). Please narrow it.`)
  }
  return { f, t }
}

// Returns approved shifts only — from/to are YYYY-MM-DD strings (inclusive)
export async function getReport({ from, to }) {
  const { f, t } = validateDateRange(from, to)
  const fromIso = f.toISOString()
  const toIso = new Date(t.getTime() + 86400000).toISOString()
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('status', 'approved')
    .gte('clock_on_at', fromIso)
    .lt('clock_on_at', toIso)
  if (error) throw new Error(error.message)
  if (!shifts || shifts.length === 0) return []
  const ids = shifts.map((s) => s.shift_id)
  const [{ data: services }, employees] = await Promise.all([
    supabase.from('shift_services').select('*').in('shift_id', ids),
    employeeMap(),
  ])
  return shifts.map((s) => {
    const emp = employees[s.employee_id]
    const loc = locationOf(s.location_id)
    const svcs = (services || []).filter((x) => x.shift_id === s.shift_id)
    const byCat = {}
    for (const c of SERVICE_CATEGORIES) byCat[c.service_category_id] = 0
    for (const x of svcs) byCat[x.service_category_id] = (byCat[x.service_category_id] || 0) + x.count
    return {
      shift_id: s.shift_id,
      employee_id: s.employee_id,
      employee: emp?.name || s.employee_id,
      location: loc?.name || s.location_id,
      date: s.clock_on_at.slice(0, 10),
      paid_hours: shiftPaidHours(s),
      services_by_category: byCat,
      total_services: svcs.reduce((a, x) => a + x.count, 0),
    }
  })
}

export async function exportReportCsv({ from, to }) {
  const rows = await getReport({ from, to })
  const lines = [['Employee', 'Employee ID', 'Date', 'Location', 'Paid Hours', ...SERVICE_CATEGORIES.map((c) => c.name), 'Total Services'].join(',')]
  for (const r of rows) {
    lines.push([
      `"${r.employee}"`, r.employee_id, r.date, `"${r.location}"`,
      r.paid_hours.toFixed(2),
      ...SERVICE_CATEGORIES.map((c) => r.services_by_category[c.service_category_id] || 0),
      r.total_services,
    ].join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `aj-payroll-${from}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// --- audit ------------------------------------------------------------------

export async function getAuditLog() {
  const [{ data: log, error }, employees] = await Promise.all([
    supabase.from('audit_log').select('*').order('id', { ascending: false }),
    employeeMap(),
  ])
  if (error) throw new Error(error.message)
  const asString = (v) => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v))
  return (log || []).map((entry) => ({
    ...entry,
    before_json: asString(entry.before_json),
    after_json: asString(entry.after_json),
    actor_name: employees[entry.actor_id]?.name || entry.actor_id,
  }))
}

// --- roster -----------------------------------------------------------------
//
// weekStart is the Monday of the week as YYYY-MM-DD.

export async function getRosterWeek(weekStart) {
  const end = addDaysStr(weekStart, 6)
  const { data, error } = await supabase
    .from('roster_shifts')
    .select('*')
    .gte('date', weekStart)
    .lte('date', end)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
  if (error) throw new Error(error.message)
  return data
}

// Upsert by roster_id. Blocks if the employee has an approved leave request that
// overlaps the shift date (conflict rule from the spec).
export async function saveRosterShift(shift) {
  const { data: emp } = await supabase.from('employees').select('name').eq('employee_id', shift.employee_id).maybeSingle()
  const { data: leaves } = await supabase
    .from('leave_requests')
    .select('from_date, to_date')
    .eq('employee_id', shift.employee_id)
    .eq('status', 'approved')
  const conflict = (leaves || []).some((l) => shift.date >= l.from_date && shift.date <= l.to_date)
  if (conflict) {
    throw new Error(`${emp?.name || 'Employee'} has approved leave on ${shift.date} — remove the leave approval first.`)
  }

  const fields = {
    employee_id: shift.employee_id,
    location_id: shift.location_id,
    date: shift.date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    notes: shift.notes || '',
    published: !!shift.published,
  }

  if (shift.roster_id) {
    const { data: existing } = await supabase
      .from('roster_shifts').select('roster_id').eq('roster_id', shift.roster_id).maybeSingle()
    if (existing) {
      const { data, error } = await supabase
        .from('roster_shifts').update(fields).eq('roster_id', shift.roster_id).select().single()
      if (error) throw new Error(error.message)
      return data
    }
  }

  const { data, error } = await supabase
    .from('roster_shifts').insert({ roster_id: shift.roster_id || uid(), ...fields }).select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteRosterShift(rosterId) {
  const { data, error } = await supabase.from('roster_shifts').delete().eq('roster_id', rosterId).select()
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Roster shift not found')
}

export async function publishRoster(weekStart) {
  const end = addDaysStr(weekStart, 6)
  const { error } = await supabase
    .from('roster_shifts').update({ published: true }).gte('date', weekStart).lte('date', end)
  if (error) throw new Error(error.message)
}

export async function unpublishRoster(weekStart) {
  const end = addDaysStr(weekStart, 6)
  const { error } = await supabase
    .from('roster_shifts').update({ published: false }).gte('date', weekStart).lte('date', end)
  if (error) throw new Error(error.message)
}

// Duplicate the previous week's shifts into the given week as unpublished drafts.
export async function copyRosterWeek(toWeekStart) {
  const fromWeekStart = addDaysStr(toWeekStart, -7)
  const fromEnd = addDaysStr(fromWeekStart, 6)
  const { data: src, error } = await supabase
    .from('roster_shifts').select('*').gte('date', fromWeekStart).lte('date', fromEnd)
  if (error) throw new Error(error.message)
  if (!src || src.length === 0) return []
  const created = src.map((s) => ({
    roster_id: uid(),
    employee_id: s.employee_id,
    location_id: s.location_id,
    date: addDaysStr(s.date, 7),
    start_time: s.start_time,
    end_time: s.end_time,
    notes: s.notes || '',
    published: false,
  }))
  const { data, error: insErr } = await supabase.from('roster_shifts').insert(created).select()
  if (insErr) throw new Error(insErr.message)
  return data
}

export async function getRosteredShiftsInRange(employeeId, from, to) {
  const { data, error } = await supabase
    .from('roster_shifts')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('published', true)
    .gte('date', from)
    .lte('date', to)
  if (error) throw new Error(error.message)
  return data
}

// --- leave ------------------------------------------------------------------

export async function getAllLeaveRequests() {
  const [{ data, error }, employees] = await Promise.all([
    supabase.from('leave_requests').select('*').order('submitted_at', { ascending: false }),
    employeeMap(),
  ])
  if (error) throw new Error(error.message)
  return (data || []).map((l) => ({
    ...mapLeave(l),
    employee: employees[l.employee_id] || {},
    actioned_by_name: employees[l.actioned_by]?.name || null,
  }))
}

export async function approveLeave(leaveId, actorId) {
  const { data: before } = await supabase.from('leave_requests').select('*').eq('leave_id', leaveId).maybeSingle()
  if (!before) throw new Error('Leave request not found')
  if (before.status !== 'pending') throw new Error('Leave request already actioned')
  const { data: after, error } = await supabase
    .from('leave_requests')
    .update({ status: 'approved', actioned_at: new Date().toISOString(), actioned_by: actorId })
    .eq('leave_id', leaveId).select().single()
  if (error) throw new Error(error.message)
  await writeAudit({ actor_id: actorId, entity_type: 'leave', entity_id: leaveId, action: 'approve', before_json: before, after_json: after, reason: null })
  return mapLeave(after)
}

export async function rejectLeave(leaveId, actorId, reason) {
  if (!reason) throw new Error('Reason is required')
  const { data: before } = await supabase.from('leave_requests').select('*').eq('leave_id', leaveId).maybeSingle()
  if (!before) throw new Error('Leave request not found')
  if (before.status !== 'pending') throw new Error('Leave request already actioned')
  const { data: after, error } = await supabase
    .from('leave_requests')
    .update({ status: 'rejected', actioned_at: new Date().toISOString(), actioned_by: actorId, rejection_reason: reason })
    .eq('leave_id', leaveId).select().single()
  if (error) throw new Error(error.message)
  await writeAudit({ actor_id: actorId, entity_type: 'leave', entity_id: leaveId, action: 'reject', before_json: before, after_json: after, reason })
  return mapLeave(after)
}

// --- Xero payroll sync ------------------------------------------------------
//
// All Xero secret-credential work happens in Edge Functions; the frontend only
// ever sees connection status (via the tokenless xero_status view) and push
// results. Tokens never reach the browser.

// Call an Edge Function with the current admin's session token.
async function invokeFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body || {}),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(result.error || `${name} failed`)
    err.status = result.status
    throw err
  }
  return result
}

// { connected, tenantName, connectedAt } — reads the tokenless status view.
export async function getXeroStatus() {
  const { data, error } = await supabase
    .from('xero_status').select('connected, tenant_name, connected_at').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data || !data.connected) return { connected: false, tenantName: null, connectedAt: null }
  return { connected: true, tenantName: data.tenant_name, connectedAt: data.connected_at }
}

// Returns the Xero authorization URL; the caller redirects the browser to it.
export async function startXeroConnect() {
  const { url } = await invokeFunction('xero-oauth-start', { origin: window.location.origin })
  return url
}

// Pushes approved hours for the period as Xero draft timesheets.
// Returns { pushed: [...names], skipped: [{name, reason}], status }.
export async function pushToXero(payPeriodStart, payPeriodEnd) {
  return invokeFunction('xero-push-timesheet', { payPeriodStart, payPeriodEnd })
}

// Past pushes, newest first.
export async function getXeroPushHistory() {
  const { data, error } = await supabase
    .from('xero_push_log')
    .select('push_id, pay_period_start, pay_period_end, pushed_at, employee_count, total_hours, status, error_message')
    .order('pushed_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

// Clears the Xero connection (owner-only, enforced inside the SECURITY DEFINER
// disconnect_xero() function so tokens are never exposed to the frontend).
export async function disconnectXero() {
  const { error } = await supabase.rpc('disconnect_xero')
  if (error) throw new Error(error.message)
}
