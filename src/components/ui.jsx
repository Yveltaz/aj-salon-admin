import React from 'react'

export function Sprig({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M12 21V6" />
      <path d="M12 10c-3 0-5-2-5-5 3 0 5 2 5 5z" />
      <path d="M12 15c3 0 5-2 5-5-3 0-5 2-5 5z" />
    </svg>
  )
}

export function Wordmark({ compact = false }) {
  return (
    <div className="wordmark">
      <div className="aj">
        Amelia <em>Jacob's</em>
      </div>
      {!compact && (
        <>
          <div className="sub">— Salon —</div>
          <div className="rule"><Sprig /></div>
        </>
      )}
    </div>
  )
}

export const icons = {
  shift: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 5.5l1 1 2-2.5M4 11.5l1 1 2-2.5M4 17.5l1 1 2-2.5" />
    </svg>
  ),
  kpis: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-8M21 20H3" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 8v4l3 2" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
      <path d="M5 13l4 4 10-11" />
    </svg>
  ),
  roster: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
    </svg>
  ),
  leave: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v3M16 3v3M9 14.5h6" />
    </svg>
  ),
}

export function Toast({ msg }) {
  if (!msg) return null
  return <div className="toast" role="status">{msg}</div>
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(s / 3600)).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${h}:${m}:${ss}`
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ---- week / date helpers (shared by roster + leave) ----
// All work in local time and use plain YYYY-MM-DD strings, so there are no
// timezone off-by-ones on week boundaries.

export function ymd(d) {
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + n)
  return d
}

// Monday of the week containing `date`.
export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dow = (d.getDay() + 6) % 7 // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow)
  return d
}

// 7 Date objects Mon→Sun for the week starting at weekStart (YYYY-MM-DD).
export function weekDates(weekStart) {
  const start = parseYmd(weekStart)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

// "16–22 Jun" (or "30 Jun – 6 Jul" across a month boundary).
export function weekLabel(weekStart) {
  const start = parseYmd(weekStart)
  const end = addDays(start, 6)
  const mon = (d) => d.toLocaleDateString('en-AU', { month: 'short' })
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${mon(start)}`
  }
  return `${start.getDate()} ${mon(start)} – ${end.getDate()} ${mon(end)}`
}

// Inclusive day count between two YYYY-MM-DD strings.
export function daysInclusive(from, to) {
  return Math.round((parseYmd(to) - parseYmd(from)) / 86400000) + 1
}

// "Monday 16 Jun"
export function fmtDayLong(ymdStr) {
  return parseYmd(ymdStr).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })
}
