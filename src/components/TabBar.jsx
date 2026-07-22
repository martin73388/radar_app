import { IconRadar, IconBuilding, IconUsers } from '../ui/icons.jsx'

const TABS = [
  { key: 'tableau', label: 'Tableau', Icon: IconRadar },
  { key: 'entreprises', label: 'Entreprises', Icon: IconBuilding },
  { key: 'contacts', label: 'Contacts', Icon: IconUsers },
]

export default function TabBar({ tab, onChange, dueCount = 0 }) {
  return (
    <nav className="tab-bar" aria-label="Navigation principale">
      <div className="tab-bar-inner">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key
          const badge = key === 'contacts' && dueCount > 0 ? dueCount : null
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-current={active ? 'page' : undefined}
              className="tab-item"
            >
              <Icon size={24} />
              {label}
              {badge != null && (
                <>
                  <span aria-hidden="true" className="tab-badge">
                    {badge > 9 ? '9+' : badge}
                  </span>
                  <span className="sr-only">{badge} relances dues</span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
