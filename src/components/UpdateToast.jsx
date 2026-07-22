import { useRegisterSW } from 'virtual:pwa-register/react'
import { createPortal } from 'react-dom'
import { useUi } from '../state/radar.js'

/**
 * SW update flow (registerType 'prompt'): a new version only ever applies on
 * this explicit tap — and the tap is disabled while a bottom sheet is open,
 * so an update can never destroy unsaved form input.
 */
export default function UpdateToast() {
  const { sheetCount } = useUi()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  const blocked = sheetCount > 0
  return createPortal(
    // Rendered at the TOP so it can never cover (or be covered by) the
    // regular toast, which lives above the tab bar.
    <div
      className="toast"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))', bottom: 'auto' }}
      role="status"
    >
      <span>Nouvelle version disponible</span>
      <button
        type="button"
        disabled={blocked}
        onClick={() => updateServiceWorker(true)}
        className="btn btn-sm btn-primary"
      >
        Recharger
      </button>
    </div>,
    document.body,
  )
}
