import { daysUntil, dueLabel, formatFR } from '../lib/dates.js'
import { useRadar } from '../state/radar.js'
import { IconCheck } from '../ui/icons.jsx'

export function followUpBadge(days) {
  if (days < 0) return 'bg-rose-500/15 text-rose-300 border-rose-500/30'
  if (days === 0) return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  if (days <= 2) return 'bg-teal-500/15 text-teal-300 border-teal-500/30'
  return 'bg-slate-500/15 text-slate-300 border-slate-500/30'
}

export default function ContactCard({ contact, onClick, onDone }) {
  const { doc, today, readOnly } = useRadar()
  const company = contact.companyId
    ? doc.companies.find((c) => c.id === contact.companyId)
    : null
  const companyLabel = company?.name || contact.companyName
  const sub = [companyLabel, contact.role].filter(Boolean).join(' · ')
  const days = contact.nextFollowUp ? daysUntil(contact.nextFollowUp, today) : null

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <button type="button" onClick={onClick} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-slate-100">
              {contact.name}
            </p>
            {sub && <p className="mt-0.5 truncate text-sm text-slate-400">{sub}</p>}
          </div>
          {days != null && (
            <span
              className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${followUpBadge(days)}`}
            >
              {dueLabel(days)}
            </span>
          )}
        </div>
        <p className="mt-2 font-mono text-xs tabular-nums text-slate-400">
          {contact.lastContact
            ? `Dernier contact : ${formatFR(contact.lastContact)}`
            : 'Jamais contacté'}
          {contact.nextFollowUp && ` · Relance : ${formatFR(contact.nextFollowUp)}`}
        </p>
      </button>
      {!readOnly && (
        <button
          type="button"
          onClick={onDone}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 text-sm font-medium text-teal-300 active:bg-teal-500/20"
        >
          <IconCheck className="h-4 w-4" /> Relance faite
        </button>
      )}
    </div>
  )
}
