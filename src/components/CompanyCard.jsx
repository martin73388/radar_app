import StatusPill from './StatusPill.jsx'
import { typeOf } from '../config/statuses.js'
import { daysBetween, relativeDayLabel } from '../lib/dates.js'
import { safeHref } from '../lib/url.js'
import { useRadar } from '../state/radar.js'
import { IconStar, IconLink } from '../ui/icons.jsx'

// Freshness of the most recent job posting → how urgent it is to respond.
function postingBadge(days) {
  if (days <= 3) return 'badge-soon'
  if (days <= 14) return 'badge-today'
  return 'badge-later'
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
    <div className="card card-pad">
      <button
        type="button"
        onClick={onClick}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div className="flex-1">
            <p className="row truncate" style={{ gap: 6, fontWeight: 600 }}>
              {company.priority && <IconStar filled size={16} className="star" />}
              <span className="truncate" style={{ minWidth: 0 }}>
                {company.name}
              </span>
            </p>
            {sub && (
              <p className="muted small truncate" style={{ marginTop: 2 }}>
                {sub}
              </p>
            )}
          </div>
          <span className="chip" style={{ flex: 'none' }}>
            {typeOf(company.type).label}
          </span>
        </div>
        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <StatusPill statusKey={company.status} />
          {postedDays != null && (
            <span
              className={`badge ${postingBadge(postedDays)}`}
              style={{ whiteSpace: 'nowrap' }}
            >
              Annonce {relativeDayLabel(freshest.postedAt, today)}
            </span>
          )}
        </div>
        {company.notes && (
          <p
            className="muted small"
            style={{
              marginTop: 8,
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {company.notes}
          </p>
        )}
      </button>

      {links.length > 0 && (
        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          {links.map((l) => (
            <a
              key={l.id}
              href={safeHref(l.url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="chip"
              style={{ minHeight: 36, color: 'var(--primary)', textDecoration: 'none' }}
            >
              <IconLink size={14} />
              <span className="truncate" style={{ maxWidth: '10rem' }}>
                {l.label || 'Annonce'}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
