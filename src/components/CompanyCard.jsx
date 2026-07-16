import StatusPill from './StatusPill.jsx'
import { typeOf } from '../config/statuses.js'
import { IconStar } from '../ui/icons.jsx'

export default function CompanyCard({ company, onClick }) {
  const sub = [company.city, company.sector].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left active:border-slate-700"
    >
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
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <StatusPill statusKey={company.status} />
      </div>
      {company.notes && (
        <p className="mt-2 line-clamp-2 text-sm leading-snug text-slate-400">
          {company.notes}
        </p>
      )}
    </button>
  )
}
