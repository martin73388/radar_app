// Company pipeline statuses, validated by Martin (Phase 1).
// Stored by stable `key` — labels/colors can change without touching data.
// Tailwind classes are literal strings so the source scanner picks them up.

export const STATUSES = [
  { key: 'to_contact', label: 'À contacter', dot: 'bg-slate-400', chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  { key: 'contacted', label: 'Contacté', dot: 'bg-sky-400', chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { key: 'in_discussion', label: 'En discussion', dot: 'bg-teal-400', chip: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
  { key: 'meeting', label: 'RDV prévu', dot: 'bg-violet-400', chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  { key: 'proposal', label: 'Proposition envoyée', dot: 'bg-amber-400', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { key: 'won', label: 'Gagné', dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { key: 'lost', label: 'Refusé / Sans suite', dot: 'bg-rose-400', chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  { key: 'standby', label: 'En veille', dot: 'bg-zinc-400', chip: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
]

// Fallback for statuses coming from a newer/older export we don't know:
// data is preserved as-is, UI renders this neutral style.
export const UNKNOWN_STATUS = {
  key: 'unknown',
  label: 'Autre',
  dot: 'bg-slate-500',
  chip: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
}

const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]))

export function statusOf(key) {
  return STATUS_MAP[key] ?? { ...UNKNOWN_STATUS, key }
}

export const DEFAULT_STATUS = 'to_contact'

export const TYPES = [
  { key: 'freelance', label: 'Freelance' },
  { key: 'cdi', label: 'CDI' },
  { key: 'both', label: 'Les deux' },
]

const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.key, t]))

export function typeOf(key) {
  return TYPE_MAP[key] ?? { key, label: 'Autre' }
}

export const DEFAULT_TYPE = 'freelance'
