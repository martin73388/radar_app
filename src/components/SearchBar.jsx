import { IconSearch, IconX } from '../ui/icons.jsx'

export default function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          pointerEvents: 'none',
          color: 'var(--text-faint)',
        }}
      >
        <IconSearch />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
        style={{ height: 44, paddingLeft: 44, paddingRight: 44 }}
      />
      {value && (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => onChange('')}
          className="btn btn-ghost btn-icon"
          style={{
            position: 'absolute',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 44,
            height: 44,
            borderRadius: '50%',
            color: 'var(--text-muted)',
          }}
        >
          <IconX size={16} />
        </button>
      )}
    </div>
  )
}
