// Plain-text French summary Martin pastes to his AI coach ("point pour
// Claude"). Must include: date, mission countdown (when set), every company
// with type/status/notes, every contact with last contact + next follow-up.

import { STATUSES, statusOf, typeOf } from '../config/statuses.js'
import {
  daysUntil,
  formatFR,
  dueLabel,
  compareByFollowUpUrgency,
} from './dates.js'

function header(doc, today) {
  const md = doc.settings.missionEndDate
  if (!md) return `📍 POINT RADAR — ${formatFR(today)} (fin de mission non définie)`
  const days = daysUntil(md, today)
  if (days > 0) {
    return `📍 POINT RADAR — ${formatFR(today)} (J−${days} avant fin de mission, ${formatFR(md)})`
  }
  if (days === 0) {
    return `📍 POINT RADAR — ${formatFR(today)} (Jour J — fin de mission aujourd'hui, ${formatFR(md)})`
  }
  return `📍 POINT RADAR — ${formatFR(today)} (fin de mission dépassée de ${-days} j, ${formatFR(md)})`
}

function companyLine(c) {
  const parts = [
    `${c.name}${c.priority ? ' ⭐' : ''}`,
    typeOf(c.type).label,
    c.city,
    c.sector,
  ].filter(Boolean)
  const lines = [`• ${parts.join(' — ')}`]
  if (c.notes) lines.push(`  Notes : ${c.notes}`)
  return lines
}

function contactCompanyLabel(contact, companiesById) {
  if (contact.companyId && companiesById.has(contact.companyId)) {
    return companiesById.get(contact.companyId).name
  }
  return contact.companyName || ''
}

function contactLines(p, companiesById, today) {
  const headParts = [p.name, contactCompanyLabel(p, companiesById), p.role].filter(
    Boolean,
  )
  const lines = [`• ${headParts.join(' — ')}`]
  const last = p.lastContact ? formatFR(p.lastContact) : 'jamais'
  let next = 'aucune'
  if (p.nextFollowUp) {
    const days = daysUntil(p.nextFollowUp, today)
    next = `${formatFR(p.nextFollowUp)} (${dueLabel(days)})`
  }
  lines.push(`  Dernier contact : ${last} · Prochaine relance : ${next}`)
  if (p.notes) lines.push(`  Notes : ${p.notes}`)
  return lines
}

export function buildPoint(doc, today) {
  const out = [header(doc, today), '']

  out.push(`🏢 ENTREPRISES (${doc.companies.length})`)
  const knownKeys = STATUSES.map((s) => s.key)
  const groupKeys = [
    ...knownKeys,
    // Unknown statuses (future versions) still appear, preserved as-is.
    ...[...new Set(doc.companies.map((c) => c.status))].filter(
      (k) => !knownKeys.includes(k),
    ),
  ]
  for (const key of groupKeys) {
    const group = doc.companies.filter((c) => c.status === key)
    if (group.length === 0) continue
    out.push(`── ${statusOf(key).label} (${group.length})`)
    for (const c of group) out.push(...companyLine(c))
  }

  out.push('')
  out.push(`👤 CONTACTS (${doc.contacts.length})`)
  const companiesById = new Map(doc.companies.map((c) => [c.id, c]))
  const sorted = [...doc.contacts].sort(compareByFollowUpUrgency)
  for (const p of sorted) out.push(...contactLines(p, companiesById, today))

  return out.join('\n')
}
