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
    <div
      className="fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 shadow-xl">
        <span>Nouvelle version disponible</span>
        <button
          type="button"
          disabled={blocked}
          onClick={() => updateServiceWorker(true)}
          className="rounded-lg bg-teal-500 px-3 py-1.5 font-semibold text-slate-950 active:bg-teal-400 disabled:opacity-40"
        >
          Recharger
        </button>
      </div>
    </div>,
    document.body,
  )
}
