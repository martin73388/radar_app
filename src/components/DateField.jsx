/**
 * Native date input bound to 'YYYY-MM-DD | null'. Nullable fields always get
 * an explicit « Effacer » button — never rely on the platform picker having
 * a clear affordance.
 */
export default function DateField({ id, label, value, onChange, min, required = false }) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <div className="row">
        <input
          id={id}
          type="date"
          value={value ?? ''}
          min={min}
          required={required}
          onChange={(e) => onChange(e.target.value || null)}
          className="input flex-1"
          style={{ height: 44 }}
        />
        {!required && value != null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="btn"
            style={{ height: 44, flex: 'none' }}
          >
            Effacer
          </button>
        )}
      </div>
    </div>
  )
}
