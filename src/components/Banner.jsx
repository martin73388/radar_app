import { IconX } from '../ui/icons.jsx'

/**
 * Persistent banner for storage-level situations (corrupt recovery,
 * read-only newer version, save failures, multi-tab conflict). Not a toast:
 * it stays until resolved/dismissed.
 */
export default function Banner({ tone = 'warn', children, actions = [], onDismiss }) {
  return (
    <div className={`banner ${tone === 'error' ? 'banner-error' : 'banner-warn'}`}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="flex-1">{children}</div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fermer"
            className="btn btn-ghost btn-icon"
          >
            <IconX size={16} />
          </button>
        )}
      </div>
      {actions.length > 0 && (
        <div className="banner-actions">
          {actions.map((a) => (
            <button key={a.label} type="button" onClick={a.onClick} className="btn btn-sm">
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
