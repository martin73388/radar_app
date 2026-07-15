/**
 * Native date input bound to 'YYYY-MM-DD | null'. Nullable fields always get
 * an explicit « Effacer » button — never rely on the platform picker having
 * a clear affordance.
 */
export default function DateField({ id, label, value, onChange, min, required = false }) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-300">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="date"
          value={value ?? ''}
          min={min}
          required={required}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 text-[15px] text-slate-100 focus:border-teal-500/60 focus:outline-none [color-scheme:dark]"
        />
        {!required && value != null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="h-11 shrink-0 rounded-xl bg-slate-800 px-3 text-sm font-medium text-slate-300 active:bg-slate-700"
          >
            Effacer
          </button>
        )}
      </div>
    </div>
  )
}
