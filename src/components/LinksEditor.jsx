import DateField from './DateField.jsx'
import { IconPlus, IconTrash } from '../ui/icons.jsx'

const inputCls =
  'h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-[15px] text-slate-100 placeholder:text-slate-600 focus:border-teal-500/60 focus:outline-none'

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
      { id: `lnk_tmp_${value.length}_${value.reduce((a, l) => a + l.url.length, 0)}`, url: '', label: '', postedAt: null },
    ])
  }
  function remove(id) {
    onChange(value.filter((l) => l.id !== id))
  }

  return (
    <div className="space-y-3">
      {value.map((l, idx) => (
        <div key={l.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Annonce {idx + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(l.id)}
              aria-label={`Supprimer l’annonce ${idx + 1}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-400 active:bg-rose-500/10"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 space-y-2">
            <input
              aria-label={`Lien de l’annonce ${idx + 1}`}
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={inputCls}
              value={l.url}
              onChange={(e) => update(l.id, { url: e.target.value })}
              placeholder="https://www.linkedin.com/jobs/… ou lien de l’offre"
            />
            <input
              aria-label={`Libellé de l’annonce ${idx + 1}`}
              className={inputCls}
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
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 text-sm font-medium text-slate-300 active:bg-slate-800"
      >
        <IconPlus className="h-4 w-4" /> Ajouter une annonce
      </button>
    </div>
  )
}
