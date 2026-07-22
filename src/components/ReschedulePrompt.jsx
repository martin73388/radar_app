import { useEffect, useState } from 'react'
import BottomSheet from './BottomSheet.jsx'
import DateField from './DateField.jsx'
import { addDays, formatFR, rescheduleOptions } from '../lib/dates.js'
import { useRadar } from '../state/radar.js'

/**
 * Opens right after "Relance faite" (lastContact is already set to today).
 * Offsets +3/+7/+14 are counted from TODAY (validated, Phase 1). Custom date
 * min = tomorrow. Dismissing keeps the previous nextFollowUp untouched —
 * deliberate: the app never invents or clears a date on its own.
 */
export default function ReschedulePrompt({ contact, onPick, onClose }) {
  const { today } = useRadar()
  const [custom, setCustom] = useState(null)
  const open = Boolean(contact)
  const minDate = addDays(today, 1)

  // The component stays mounted across opens — reset the draft per contact so
  // a stale custom date can never be committed for the wrong contact.
  useEffect(() => {
    setCustom(null)
  }, [contact?.id])

  return (
    <BottomSheet open={open} onClose={onClose} title="Relance notée ✅">
      {open && (
        <div className="stack-3" style={{ paddingTop: 4 }}>
          <p className="muted small">
            Prochaine relance pour{' '}
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{contact.name}</span> ?
          </p>
          <div className="grid-3">
            {rescheduleOptions(today).map((opt) => (
              <button
                key={opt.offset}
                type="button"
                onClick={() => onPick(opt.date)}
                className="btn"
                style={{ height: 64, flexDirection: 'column', gap: 2, padding: 0 }}
              >
                <span style={{ color: 'var(--primary)' }}>+{opt.offset} j</span>
                <span className="muted tiny mono-nums">
                  {formatFR(opt.date).slice(0, 5)}
                </span>
              </button>
            ))}
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="flex-1">
              <DateField
                id="resched-custom"
                label="Ou une date précise"
                value={custom}
                onChange={setCustom}
                min={minDate}
              />
            </div>
            <button
              type="button"
              disabled={!custom || custom < minDate}
              onClick={() => custom && custom >= minDate && onPick(custom)}
              className="btn btn-primary"
              style={{ height: 44, flex: 'none' }}
            >
              OK
            </button>
          </div>
          <button type="button" onClick={() => onPick(null)} className="btn btn-mid">
            Pas de prochaine relance
          </button>
          {contact.nextFollowUp && (
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-mid"
              style={{ color: 'var(--text-muted)', fontWeight: 500 }}
            >
              Garder la date actuelle ({formatFR(contact.nextFollowUp)})
            </button>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
