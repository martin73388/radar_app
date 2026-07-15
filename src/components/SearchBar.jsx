import { IconSearch, IconX } from '../ui/icons.jsx'

export default function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-slate-800 bg-slate-900 pl-11 pr-10 text-[15px] text-slate-100 placeholder:text-slate-500 focus:border-teal-500/60 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400"
        >
          <IconX className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
