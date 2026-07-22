import DateField from './DateField.jsx'
import { IconPlus, IconTrash } from '../ui/icons.jsx'
import { makeId } from '../storage/index.js'

/**
 * Editable list of job-posting links on a company: url + optional label +
 * posted/repost date. `value` is the links array; `onChange` returns the new
 * array. Part of the company form's saved data (not an immutable log).
 */
export default function LinksEditor({ value = [], onChange }) {
  function update(id, patch) {
    onChange(value.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }
  function add() {
    onChange([
      ...value,
      // Unique draft id: index/length-derived ids collide after add+remove
      // (two rows would mirror each other and share a React key).
      { id: makeId('lnk'), url: '', label: '', postedAt: null },
    ])
  }
  function remove(id) {
    onChange(value.filter((l) => l.id !== id))
  }

  return (
    <div className="stack-3">
      {value.map((l, idx) => (
        <div key={l.id} className="card card-pad">
          <div className="row-between">
            <span className="section-title">
              Annonce {idx + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(l.id)}
              aria-label={`Supprimer l’annonce ${idx + 1}`}
              className="btn btn-ghost btn-icon"
              style={{ width: 44, height: 44, color: 'var(--danger)' }}
            >
              <IconTrash size={16} />
            </button>
          </div>
          <div className="stack-2" style={{ marginTop: 8 }}>
            <input
              aria-label={`Lien de l’annonce ${idx + 1}`}
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="input"
              style={{ height: 44 }}
              value={l.url}
              onChange={(e) => update(l.id, { url: e.target.value })}
              placeholder="https://www.linkedin.com/jobs/… ou lien de l’offre"
            />
            <input
              aria-label={`Libellé de l’annonce ${idx + 1}`}
              className="input"
              style={{ height: 44 }}
              value={l.label}
              onChange={(e) => update(l.id, { label: e.target.value })}
              placeholder="Libellé (ex. « Lead robotique — repost »)"
            />
            <DateField
              id={`lnk-date-${l.id}`}
              label="Postée / repostée le"
              value={l.postedAt}
              onChange={(d) => update(l.id, { postedAt: d })}
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="btn btn-mid"
        style={{ borderStyle: 'dashed' }}
      >
        <IconPlus size={16} /> Ajouter une annonce
      </button>
    </div>
  )
}
