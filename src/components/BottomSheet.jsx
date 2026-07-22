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
    <div role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="btn btn-ghost btn-icon">
            <IconX />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
