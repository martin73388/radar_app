import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/** Transient toast above the tab bar; optional action button (e.g. undo). */
export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(onDismiss, toast.action ? 8000 : 2500)
    return () => clearTimeout(t)
  }, [toast, onDismiss])

  if (!toast) return null
  return createPortal(
    <div
      className="fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
    >
      <div
        className={`flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl ${
          toast.kind === 'error'
            ? 'border-rose-500/40 bg-rose-950 text-rose-200'
            : 'border-slate-700 bg-slate-800 text-slate-100'
        }`}
        role="status"
      >
        <span>{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              // Dismiss first: the action may show its own follow-up toast,
              // which must not be clobbered by this dismissal.
              onDismiss()
              toast.action.onClick()
            }}
            className="shrink-0 rounded-lg bg-teal-500/15 px-3 py-1.5 font-semibold text-teal-300 active:bg-teal-500/25"
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
