// All user-facing dates are LOCAL calendar dates as 'YYYY-MM-DD' strings.
// Date math converts them to UTC epoch-days, which is DST- and timezone-immune.
// Every function that depends on "today" takes it as an explicit parameter.

const DAY_MS = 86_400_000

export function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

export function todayLocal(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toEpochDays(s) {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

/** Whole calendar days from `from` to `to` (negative if `to` is before). */
export function daysBetween(from, to) {
  return toEpochDays(to) - toEpochDays(from)
}

/** Whole calendar days from `today` until `date` (0 = today, negative = past). */
export function daysUntil(date, today) {
  return daysBetween(today, date)
}

export function addDays(date, n) {
  const dt = new Date((toEpochDays(date) + n) * DAY_MS)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatFR(date) {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

/** Mission countdown label: J−42, Jour J, J+3 (overshoot). */
export function countdownLabel(days) {
  if (days === 0) return 'Jour J'
  return days > 0 ? `J−${days}` : `J+${-days}`
}

/** "Relances du jour" horizon: due within 2 days (overdue included). */
export const DUE_SOON_DAYS = 2

export function isDueSoon(days) {
  return days <= DUE_SOON_DAYS
}

/** Human label for a follow-up N days away. */
export function dueLabel(days) {
  if (days < 0) return `En retard de ${-days} j`
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Demain'
  return `Dans ${days} j`
}

/** Quick-reschedule offsets after "Relance faite", counted from TODAY. */
export const RESCHEDULE_OFFSETS = [3, 7, 14]

export function rescheduleOptions(today) {
  return RESCHEDULE_OFFSETS.map((n) => ({ offset: n, date: addDays(today, n) }))
}

/**
 * Contacts sort: soonest follow-up first ('YYYY-MM-DD' compares
 * lexicographically), contacts without a follow-up last, ties by name.
 */
export function compareByFollowUpUrgency(a, b) {
  const an = a.nextFollowUp || null
  const bn = b.nextFollowUp || null
  if (an && bn && an !== bn) return an < bn ? -1 : 1
  if (an && !bn) return -1
  if (!an && bn) return 1
  return (a.name || '').localeCompare(b.name || '', 'fr')
}
