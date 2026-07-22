// Company pipeline statuses, validated by Martin (Phase 1).
// Stored by stable `key` — labels/colors can change without touching data.
// `color` is a mid-tone hue; the UI adapts it to light/dark via color-mix
// (see .status-pill in app.css), so one value serves both themes.

export const STATUSES = [
  { key: 'to_contact', label: 'À contacter', color: '#94a3b8' },
  { key: 'contacted', label: 'Contacté', color: '#38bdf8' },
  { key: 'in_discussion', label: 'En discussion', color: '#2dd4bf' },
  { key: 'meeting', label: 'RDV prévu', color: '#a78bfa' },
  { key: 'proposal', label: 'Proposition envoyée', color: '#fbbf24' },
  { key: 'won', label: 'Gagné', color: '#34d399' },
  { key: 'lost', label: 'Refusé / Sans suite', color: '#fb7185' },
  { key: 'standby', label: 'En veille', color: '#a1a1aa' },
]

// Fallback for statuses coming from a newer/older export we don't know:
// data is preserved as-is, UI renders this neutral style.
export const UNKNOWN_STATUS = {
  key: 'unknown',
  label: 'Autre',
  color: '#64748b',
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
