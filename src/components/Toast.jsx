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
    <div className={`toast ${toast.kind === 'error' ? 'toast-error' : ''}`} role="status">
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
          className="btn btn-sm btn-primary"
        >
          {toast.action.label}
        </button>
      )}
    </div>,
    document.body,
  )
}
