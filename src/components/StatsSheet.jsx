import BottomSheet from './BottomSheet.jsx'
import { useRadar } from '../state/radar.js'
import { computeStats } from '../lib/stats.js'

function Tile({ value, label }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-center">
      <p className="font-mono text-2xl font-bold tabular-nums text-slate-100">{value}</p>
      <p className="mt-0.5 text-xs leading-tight text-slate-400">{label}</p>
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
      <div className="space-y-6 pt-1">
        <div className="grid grid-cols-3 gap-2">
          <Tile value={stats.totals.relancesLast7} label="relances (7 j)" />
          <Tile value={stats.totals.relancesTotal} label="relances (total)" />
          <Tile value={stats.totals.won} label="gagnés" />
        </div>

        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Relances par semaine
          </h3>
          <div className="flex items-end justify-between gap-1.5" style={{ height: 96 }}>
            {stats.byWeek.map((w) => (
              <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-teal-500/80"
                    style={{ height: `${(w.count / maxWeek) * 100}%`, minHeight: w.count ? 4 : 0 }}
                    title={`${w.count} relance${w.count > 1 ? 's' : ''}`}
                  />
                </div>
                <span className="font-mono text-[10px] tabular-nums text-slate-500">
                  {w.count}
                </span>
                <span className="text-[9px] text-slate-600">
                  {w.weekStart.slice(8, 10)}/{w.weekStart.slice(5, 7)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-center text-[11px] text-slate-500">
            8 dernières semaines (lundi de chaque semaine)
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Entreprises par statut ({stats.totals.companies})
          </h3>
          {stats.perStatus.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune entreprise pour l’instant.</p>
          ) : (
            <ul className="space-y-1.5">
              {stats.perStatus.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                  <span className="flex-1 truncate text-sm text-slate-300">{s.label}</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-slate-100">
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
