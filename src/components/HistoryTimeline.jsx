import { useState } from 'react'
import { formatFR } from '../lib/dates.js'
import { IconClock, IconCheck } from '../ui/icons.jsx'

// Kind → small French tag + accent color for the timeline dot.
const KIND = {
  note: { label: 'Note', color: 'var(--text-faint)' },
  status: { label: 'Statut', color: 'var(--accent)' },
  relance: { label: 'Relance', color: 'var(--primary)' },
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
      <div className="row">
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ajouter une note horodatée…"
          className="textarea flex-1"
          style={{ minHeight: 44, resize: 'none' }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!text.trim()}
          aria-label="Ajouter la note"
          className="btn btn-primary btn-icon"
          style={{ width: 44, height: 44, flex: 'none' }}
        >
          <IconCheck />
        </button>
      </div>

      {ordered.length === 0 ? (
        <p className="muted small" style={{ margin: '8px 0 0' }}>
          Aucun mouvement pour l’instant. Tes notes, changements de statut et
          relances apparaîtront ici, horodatés.
        </p>
      ) : (
        <ul className="timeline" style={{ listStyle: 'none', margin: '12px 0 0' }}>
          {ordered.map((e) => {
            const k = KIND[e.kind] ?? KIND.note
            return (
              <li key={e.id}>
                <p className="row tiny mono-nums faint" style={{ margin: 0, gap: 6 }}>
                  <span className="status-dot" style={{ '--pill-hue': k.color }} />
                  <IconClock size={12} />
                  {stamp(e.at)}
                  <span className="chip">{k.label}</span>
                </p>
                <p
                  className="small"
                  style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
                >
                  {e.text}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
