import { IconRadar, IconBuilding, IconUsers } from '../ui/icons.jsx'

const TABS = [
  { key: 'tableau', label: 'Tableau', Icon: IconRadar },
  { key: 'entreprises', label: 'Entreprises', Icon: IconBuilding },
  { key: 'contacts', label: 'Contacts', Icon: IconUsers },
]

export default function TabBar({ tab, onChange, dueCount = 0 }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navigation principale"
    >
      <div className="mx-auto flex max-w-md">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key
          const badge = key === 'contacts' && dueCount > 0 ? dueCount : null
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                active ? 'text-teal-400' : 'text-slate-500 active:text-slate-300'
              }`}
            >
              <span className="relative">
                <Icon className="h-6 w-6" />
                {badge != null && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white"
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              {label}
              {badge != null && (
                <span className="sr-only">{badge} relances dues</span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
