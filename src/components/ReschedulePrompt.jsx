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
        <div className="space-y-4 pt-1">
          <p className="text-sm text-slate-400">
            Prochaine relance pour{' '}
            <span className="font-medium text-slate-200">{contact.name}</span> ?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {rescheduleOptions(today).map((opt) => (
              <button
                key={opt.offset}
                type="button"
                onClick={() => onPick(opt.date)}
                className="flex h-16 flex-col items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10 active:bg-teal-500/20"
              >
                <span className="text-[15px] font-semibold text-teal-300">
                  +{opt.offset} j
                </span>
                <span className="font-mono text-xs tabular-nums text-slate-400">
                  {formatFR(opt.date).slice(0, 5)}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
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
              className="h-11 shrink-0 rounded-xl bg-teal-500 px-4 text-sm font-semibold text-slate-950 disabled:opacity-40"
            >
              OK
            </button>
          </div>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="h-11 w-full rounded-xl bg-slate-800 text-sm font-medium text-slate-300 active:bg-slate-700"
          >
            Pas de prochaine relance
          </button>
          {contact.nextFollowUp && (
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-full rounded-xl text-sm text-slate-500"
            >
              Garder la date actuelle ({formatFR(contact.nextFollowUp)})
            </button>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
