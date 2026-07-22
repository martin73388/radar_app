import { IconPlus } from '../ui/icons.jsx'
import { useUi } from '../state/radar.js'

/** Floating + button, hidden while a sheet is open (never covers a form). */
export default function Fab({ onClick, label }) {
  const { sheetCount } = useUi()
  if (sheetCount > 0) return null
  return (
    <button type="button" onClick={onClick} aria-label={label} className="fab">
      <IconPlus size={28} />
    </button>
  )
}
