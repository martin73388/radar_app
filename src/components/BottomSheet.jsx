import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useUi } from '../state/radar.js'
import { IconX } from '../ui/icons.jsx'

/**
 * Thumb-friendly bottom sheet. Scrollable body, safe-area padding, closes on
 * backdrop tap. Registers itself in UiContext so the app never triggers a SW
 * reload while a sheet (potentially holding unsaved form input) is open.
 */
export default function BottomSheet({ open, onClose, title, children }) {
  const { incSheet, decSheet } = useUi()

  useEffect(() => {
    if (!open) return undefined
    incSheet()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      decSheet()
      document.body.style.overflow = prev
    }
  }, [open, incSheet, decSheet])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl border-t border-slate-700/60 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-slate-700" />
          <h2 className="pt-2 text-base font-semibold text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 active:bg-slate-800"
          >
            <IconX />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
