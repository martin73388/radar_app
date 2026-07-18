// Activity statistics derived from the document (pure, unit-tested).
import { STATUSES, statusOf } from '../config/statuses.js'
import { addDays, daysBetween } from './dates.js'

// Monday of the ISO week containing `date` ('YYYY-MM-DD' → 'YYYY-MM-DD').
export function weekStart(date) {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun..6=Sat
  const backToMonday = (dow + 6) % 7
  return addDays(date, -backToMonday)
}

/**
 * Relances (activity entries) per ISO week for the `weeks` weeks ending with
 * the week containing `today`. Returns oldest→newest, each { weekStart, count }.
 */
export function relancesByWeek(activityLog, today, weeks = 8) {
  const thisMonday = weekStart(today)
  const buckets = []
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.push({ weekStart: addDays(thisMonday, -7 * i), count: 0 })
  }
  const index = new Map(buckets.map((b, i) => [b.weekStart, i]))
  for (const entry of activityLog) {
    if (!entry || typeof entry.date !== 'string') continue
    const wk = weekStart(entry.date)
    const i = index.get(wk)
    if (i != null) buckets[i].count += 1
  }
  return buckets
}

export function companiesByStatus(companies) {
  const counts = new Map()
  for (const c of companies) counts.set(c.status, (counts.get(c.status) ?? 0) + 1)
  const known = STATUSES.map((s) => s.key).filter((k) => counts.has(k))
  const unknown = [...counts.keys()].filter((k) => !STATUSES.some((s) => s.key === k))
  return [...known, ...unknown].map((key) => ({
    key,
    label: statusOf(key).label,
    dot: statusOf(key).dot,
    count: counts.get(key),
  }))
}

export function computeStats(doc, today, weeks = 8) {
  const byWeek = relancesByWeek(doc.activityLog ?? [], today, weeks)
  const last7 = (doc.activityLog ?? []).filter(
    (e) => e && typeof e.date === 'string' && daysBetween(e.date, today) >= 0 && daysBetween(e.date, today) <= 6,
  ).length
  return {
    byWeek,
    perStatus: companiesByStatus(doc.companies),
    totals: {
      companies: doc.companies.length,
      contacts: doc.contacts.length,
      relancesTotal: (doc.activityLog ?? []).length,
      relancesLast7: last7,
      won: doc.companies.filter((c) => c.status === 'won').length,
    },
  }
}
