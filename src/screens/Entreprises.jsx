import { useEffect, useState } from 'react'
import { useRadar } from '../state/radar.js'
import { STATUSES, TYPES, statusOf } from '../config/statuses.js'
import SearchBar from '../components/SearchBar.jsx'
import CompanyCard from '../components/CompanyCard.jsx'
import CompanyForm from '../components/CompanyForm.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import Fab from '../components/Fab.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { IconBuilding } from '../ui/icons.jsx'

function matches(company, q) {
  const hay = `${company.name} ${company.sector} ${company.city} ${company.notes}`.toLowerCase()
  return hay.includes(q)
}

export default function Entreprises({ cmd, onCmdConsumed }) {
  const { doc, actions, readOnly } = useRadar()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState(null)
  const [statusFilter, setStatusFilter] = useState(null)
  const [sheet, setSheet] = useState(null) // { company: object | null }

  useEffect(() => {
    if (!cmd) return
    if (cmd.statusFilter) setStatusFilter(cmd.statusFilter)
    if (cmd.openForm && !readOnly) setSheet({ company: null })
    onCmdConsumed()
  }, [cmd, onCmdConsumed, readOnly])

  const q = search.trim().toLowerCase()
  const filtered = doc.companies
    .filter((c) => (q ? matches(c, q) : true))
    .filter((c) => (typeFilter ? c.type === typeFilter : true))
    .filter((c) => (statusFilter ? c.status === statusFilter : true))
    .sort(
      (a, b) =>
        Number(b.priority) - Number(a.priority) || a.name.localeCompare(b.name, 'fr'),
    )

  const chipCls = (active) =>
    `h-9 shrink-0 rounded-full border px-3 text-sm font-medium ${
      active
        ? 'border-teal-500/50 bg-teal-500/15 text-teal-300'
        : 'border-slate-800 bg-slate-900 text-slate-400'
    }`

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-slate-100">Entreprises</h1>
      <SearchBar value={search} onChange={setSearch} placeholder="Rechercher…" />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTypeFilter(typeFilter === t.key ? null : t.key)}
            className={chipCls(typeFilter === t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatusFilter(statusFilter === s.key ? null : s.key)}
            className={chipCls(statusFilter === s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {statusFilter && !STATUSES.some((s) => s.key === statusFilter) && (
        <button
          type="button"
          onClick={() => setStatusFilter(null)}
          className={chipCls(true)}
        >
          {statusOf(statusFilter).label} ✕
        </button>
      )}

      {doc.companies.length === 0 ? (
        <EmptyState
          icon={<IconBuilding className="h-10 w-10" />}
          title="Aucune entreprise pour l’instant"
          hint="Ajoute ta première cible avec le bouton +"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconBuilding className="h-10 w-10" />}
          title="Aucun résultat"
          hint="Modifie la recherche ou les filtres"
        />
      ) : (
        <ul className="space-y-2 pb-40">
          {filtered.map((c) => (
            <li key={c.id}>
              <CompanyCard
                company={c}
                onClick={() => !readOnly && setSheet({ company: c })}
              />
            </li>
          ))}
        </ul>
      )}

      {!readOnly && <Fab label="Ajouter une entreprise" onClick={() => setSheet({ company: null })} />}

      <BottomSheet
        open={Boolean(sheet)}
        onClose={() => setSheet(null)}
        title={sheet?.company ? 'Modifier l’entreprise' : 'Nouvelle entreprise'}
      >
        {sheet && (
          <CompanyForm
            company={sheet.company}
            onClose={() => setSheet(null)}
            onSave={(data) =>
              sheet.company
                ? actions.updateCompany(sheet.company.id, data)
                : actions.addCompany(data)
            }
            onDelete={() => sheet.company && actions.deleteCompany(sheet.company.id)}
          />
        )}
      </BottomSheet>
    </div>
  )
}
