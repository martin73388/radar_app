import { IconPlus } from '../ui/icons.jsx'
import { useUi } from '../state/radar.js'

/** Floating + button, hidden while a sheet is open (never covers a form). */
export default function Fab({ onClick, label }) {
  const { sheetCount } = useUi()
  if (sheetCount > 0) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/25 active:bg-teal-400"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)' }}
    >
      <IconPlus className="h-7 w-7" />
    </button>
  )
}
