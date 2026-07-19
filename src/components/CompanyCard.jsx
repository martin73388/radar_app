import StatusPill from './StatusPill.jsx'
import { typeOf } from '../config/statuses.js'
import { daysBetween, relativeDayLabel } from '../lib/dates.js'
import { safeHref } from '../lib/url.js'
import { useRadar } from '../state/radar.js'
import { IconStar, IconLink } from '../ui/icons.jsx'

// Freshness of the most recent job posting → how urgent it is to respond.
function postingBadge(days) {
  if (days <= 3) return 'bg-teal-500/15 text-teal-300 border-teal-500/30'
  if (days <= 14) return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  return 'bg-slate-500/15 text-slate-400 border-slate-500/30'
}

export default function CompanyCard({ company, onClick }) {
  const { today } = useRadar()
  const sub = [company.city, company.sector].filter(Boolean).join(' · ')
  const links = (company.links ?? []).filter((l) => safeHref(l.url))
  const dated = (company.links ?? []).filter((l) => l.postedAt)
  const freshest = dated.length
    ? dated.reduce((a, b) => (a.postedAt >= b.postedAt ? a : b))
    : null
  const postedDays = freshest ? daysBetween(freshest.postedAt, today) : null

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <button type="button" onClick={onClick} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-slate-100">
              {company.priority && (
                <IconStar filled className="h-4 w-4 shrink-0 text-amber-300" />
              )}
              <span className="truncate">{company.name}</span>
            </p>
            {sub && <p className="mt-0.5 truncate text-sm text-slate-400">{sub}</p>}
          </div>
          <span className="shrink-0 rounded-lg bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
            {typeOf(company.type).label}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <StatusPill statusKey={company.status} />
          {postedDays != null && (
            <span
              className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${postingBadge(postedDays)}`}
            >
              Annonce {relativeDayLabel(freshest.postedAt, today)}
            </span>
          )}
        </div>
        {company.notes && (
          <p className="mt-2 line-clamp-2 text-sm leading-snug text-slate-400">
            {company.notes}
          </p>
        )}
      </button>

      {links.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {links.map((l) => (
            <a
              key={l.id}
              href={safeHref(l.url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 text-xs font-medium text-sky-300 active:bg-sky-500/20"
            >
              <IconLink className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[10rem] truncate">{l.label || 'Annonce'}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
