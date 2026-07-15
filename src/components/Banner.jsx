import { IconX } from '../ui/icons.jsx'

/**
 * Persistent banner for storage-level situations (corrupt recovery,
 * read-only newer version, save failures, multi-tab conflict). Not a toast:
 * it stays until resolved/dismissed.
 */
export default function Banner({ tone = 'warn', children, actions = [], onDismiss }) {
  const tones = {
    warn: 'border-amber-500/40 bg-amber-950/80 text-amber-100',
    error: 'border-rose-500/40 bg-rose-950/80 text-rose-100',
    info: 'border-sky-500/40 bg-sky-950/80 text-sky-100',
  }
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">{children}</div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fermer"
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-70"
          >
            <IconX className="h-4 w-4" />
          </button>
        )}
      </div>
      {actions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold active:bg-white/20"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
