import { daysUntil, dueLabel, formatFR } from '../lib/dates.js'
import { safeHref } from '../lib/url.js'
import { useRadar } from '../state/radar.js'
import { IconCheck, IconLinkedIn } from '../ui/icons.jsx'

export function followUpBadge(days) {
  if (days < 0) return 'badge-overdue'
  if (days === 0) return 'badge-today'
  if (days <= 2) return 'badge-soon'
  return 'badge-later'
}

export default function ContactCard({ contact, onClick, onDone }) {
  const { doc, today, readOnly } = useRadar()
  const company = contact.companyId
    ? doc.companies.find((c) => c.id === contact.companyId)
    : null
  const companyLabel = company?.name || contact.companyName
  const sub = [companyLabel, contact.role].filter(Boolean).join(' · ')
  const days = contact.nextFollowUp ? daysUntil(contact.nextFollowUp, today) : null
  const liHref = safeHref(contact.linkedin)

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
            <p className="truncate" style={{ fontWeight: 600 }}>
              {contact.name}
            </p>
            {sub && (
              <p className="truncate muted small" style={{ marginTop: 2 }}>
                {sub}
              </p>
            )}
          </div>
          {days != null && (
            <span
              className={'badge ' + followUpBadge(days)}
              style={{ flex: 'none', whiteSpace: 'nowrap' }}
            >
              {dueLabel(days)}
            </span>
          )}
        </div>
        <p className="muted tiny mono-nums" style={{ marginTop: 8 }}>
          {contact.lastContact
            ? `Dernier contact : ${formatFR(contact.lastContact)}`
            : 'Jamais contacté'}
          {contact.nextFollowUp && ` · Relance : ${formatFR(contact.nextFollowUp)}`}
        </p>
      </button>
      <div className="row" style={{ marginTop: 12 }}>
        {liHref && (
          <a
            href={liHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Ouvrir le profil LinkedIn de ${contact.name}`}
            className="icon-btn"
            style={{ color: 'var(--primary)', flex: 'none' }}
          >
            <IconLinkedIn />
          </a>
        )}
        {!readOnly && (
          <button
            type="button"
            onClick={onDone}
            className="btn btn-primary flex-1"
            style={{ height: 44 }}
          >
            <IconCheck size={16} /> Relance faite
          </button>
        )}
      </div>
    </div>
  )
}
