import { useState } from 'react'
import { formatFR } from '../lib/dates.js'
import { IconClock, IconCheck } from '../ui/icons.jsx'

// Kind → small French tag + accent color for the timeline dot.
const KIND = {
  note: { label: 'Note', dot: 'bg-slate-400' },
  status: { label: 'Statut', dot: 'bg-violet-400' },
  relance: { label: 'Relance', dot: 'bg-teal-400' },
}

function stamp(at) {
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const day = formatFR(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  )
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day} · ${hh}:${mm}`
}

/**
 * Timestamped, immutable activity log. `entries` come from the live document
 * (most-recent-first display); `onAddNote(text)` appends a new note that is
 * persisted immediately, independent of the surrounding form's save button.
 */
export default function HistoryTimeline({ entries = [], onAddNote }) {
  const [text, setText] = useState('')
  const ordered = [...entries].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  function add() {
    const t = text.trim()
    if (!t) return
    onAddNote(t)
    setText('')
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-t-xl border border-slate-800 bg-slate-950 px-3 py-2">
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ajouter une note horodatée…"
          className="min-h-11 flex-1 resize-none bg-transparent py-1.5 text-[15px] text-slate-100 placeholder:text-slate-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!text.trim()}
          aria-label="Ajouter la note"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-500 text-slate-950 disabled:opacity-40"
        >
          <IconCheck className="h-5 w-5" />
        </button>
      </div>

      {ordered.length === 0 ? (
        <p className="rounded-b-xl border border-t-0 border-slate-800 bg-slate-950 px-3 py-3 text-sm text-slate-500">
          Aucun mouvement pour l’instant. Tes notes, changements de statut et
          relances apparaîtront ici, horodatés.
        </p>
      ) : (
        <ul className="space-y-0 rounded-b-xl border border-t-0 border-slate-800 bg-slate-950">
          {ordered.map((e, i) => {
            const k = KIND[e.kind] ?? KIND.note
            return (
              <li
                key={e.id}
                className={`flex gap-3 px-3 py-2.5 ${i > 0 ? 'border-t border-slate-800/70' : ''}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${k.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-slate-500">
                    <IconClock className="h-3 w-3" />
                    {stamp(e.at)}
                    <span className="rounded bg-slate-800 px-1.5 py-px text-[10px] font-medium text-slate-400">
                      {k.label}
                    </span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-200">
                    {e.text}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
