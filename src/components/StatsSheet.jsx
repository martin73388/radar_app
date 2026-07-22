import BottomSheet from './BottomSheet.jsx'
import { useRadar } from '../state/radar.js'
import { computeStats } from '../lib/stats.js'
import { statusOf } from '../config/statuses.js'

function Tile({ value, label }) {
  return (
    <div className="card" style={{ padding: 12, textAlign: 'center' }}>
      <p className="tile-number mono-nums">{value}</p>
      <p className="muted tiny" style={{ marginTop: 2, lineHeight: 1.2 }}>{label}</p>
    </div>
  )
}

/** Activity statistics: relances/week + pipeline breakdown. */
export default function StatsSheet({ open, onClose }) {
  const { doc, today } = useRadar()
  const stats = computeStats(doc, today, 8)
  const maxWeek = Math.max(1, ...stats.byWeek.map((w) => w.count))

  return (
    <BottomSheet open={open} onClose={onClose} title="Statistiques">
      <div className="stack-5" style={{ paddingTop: 4 }}>
        <div className="grid-3">
          <Tile value={stats.totals.relancesLast7} label="relances (7 j)" />
          <Tile value={stats.totals.relancesTotal} label="relances (total)" />
          <Tile value={stats.totals.won} label="gagnés" />
        </div>

        <section>
          <h3 className="section-title" style={{ marginBottom: 8 }}>
            Relances par semaine
          </h3>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 6,
              height: 96,
            }}
          >
            {stats.byWeek.map((w) => (
              <div
                key={w.weekStart}
                className="flex-1"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
              >
                <div style={{ display: 'flex', width: '100%', flex: 1, alignItems: 'flex-end' }}>
                  <div
                    style={{
                      width: '100%',
                      borderRadius: '4px 4px 0 0',
                      background: 'var(--primary)',
                      height: `${(w.count / maxWeek) * 100}%`,
                      minHeight: w.count ? 4 : 0,
                    }}
                    title={`${w.count} relance${w.count > 1 ? 's' : ''}`}
                  />
                </div>
                <span className="mono-nums faint" style={{ fontSize: 10 }}>
                  {w.count}
                </span>
                <span className="faint" style={{ fontSize: 9 }}>
                  {w.weekStart.slice(8, 10)}/{w.weekStart.slice(5, 7)}
                </span>
              </div>
            ))}
          </div>
          <p className="faint" style={{ marginTop: 4, textAlign: 'center', fontSize: 11 }}>
            8 dernières semaines (lundi de chaque semaine)
          </p>
        </section>

        <section>
          <h3 className="section-title" style={{ marginBottom: 8 }}>
            Entreprises par statut ({stats.totals.companies})
          </h3>
          {stats.perStatus.length === 0 ? (
            <p className="muted small">Aucune entreprise pour l’instant.</p>
          ) : (
            <ul className="stack-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {stats.perStatus.map((s) => (
                <li key={s.key} className="row" style={{ '--pill-hue': statusOf(s.key).color }}>
                  <span className="status-dot" />
                  <span className="flex-1 truncate small muted">{s.label}</span>
                  <span className="mono-nums small" style={{ fontWeight: 600 }}>
                    {s.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </BottomSheet>
  )
}
