import { useEffect, useRef, useState } from 'react'
import { useRadar } from '../state/radar.js'
import { STATUSES, TYPES, statusOf } from '../config/statuses.js'
import SearchBar from '../components/SearchBar.jsx'
import CompanyCard from '../components/CompanyCard.jsx'
import CompanyForm from '../components/CompanyForm.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
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
  // Initialized from cmd so a pipeline tap never flashes the unfiltered list.
  const [statusFilter, setStatusFilter] = useState(cmd?.statusFilter ?? null)
  const [sheet, setSheet] = useState(
    cmd?.openForm && !readOnly ? { company: null } : null,
  ) // { company: object | null }
  const [formDirty, setFormDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const statusRowRef = useRef(null)

  function openSheet(s) {
    setFormDirty(false)
    setSheet(s)
  }
  function closeSheet() {
    setSheet(null)
    setFormDirty(false)
    setConfirmClose(false)
  }
  // Backdrop/X never silently discard typed input.
  const requestClose = () => (formDirty ? setConfirmClose(true) : closeSheet())

  useEffect(() => {
    if (!cmd) return
    if (cmd.statusFilter) setStatusFilter(cmd.statusFilter)
    if (cmd.openForm && !readOnly) openSheet({ company: null })
    onCmdConsumed()
  }, [cmd, onCmdConsumed, readOnly])

  // Keep the active status chip visible (a pipeline tap can select a status
  // whose chip is scrolled out of view).
  useEffect(() => {
    if (!statusFilter || !statusRowRef.current) return
    statusRowRef.current
      .querySelector(`[data-status="${statusFilter}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [statusFilter])

  const q = search.trim().toLowerCase()
  const filtered = doc.companies
    .filter((c) => (q ? matches(c, q) : true))
    .filter((c) => (typeFilter ? c.type === typeFilter : true))
    .filter((c) => (statusFilter ? c.status === statusFilter : true))
    .sort(
      (a, b) =>
        Number(b.priority) - Number(a.priority) || a.name.localeCompare(b.name, 'fr'),
    )

  return (
    <div className="stack-3">
      <h1 className="screen-title">Entreprises</h1>
      <SearchBar value={search} onChange={setSearch} placeholder="Rechercher…" />

      <div className="chip-row">
        {TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={typeFilter === t.key}
            onClick={() => setTypeFilter(typeFilter === t.key ? null : t.key)}
            className="filter-chip"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div ref={statusRowRef} className="chip-row">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            data-status={s.key}
            aria-pressed={statusFilter === s.key}
            onClick={() => setStatusFilter(statusFilter === s.key ? null : s.key)}
            className="filter-chip"
          >
            {s.label}
          </button>
        ))}
      </div>

      {statusFilter && !STATUSES.some((s) => s.key === statusFilter) && (
        <button
          type="button"
          aria-pressed="true"
          onClick={() => setStatusFilter(null)}
          className="filter-chip"
        >
          {statusOf(statusFilter).label} ✕
        </button>
      )}

      {doc.companies.length === 0 ? (
        <EmptyState
          icon={<IconBuilding size={40} />}
          title="Aucune entreprise pour l’instant"
          hint="Ajoute ta première cible avec le bouton +"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconBuilding size={40} />}
          title="Aucun résultat"
          hint="Modifie la recherche ou les filtres"
        />
      ) : (
        <ul className="stack-2" style={{ listStyle: 'none', margin: 0, padding: '0 0 10rem' }}>
          {filtered.map((c) => (
            <li key={c.id}>
              <CompanyCard
                company={c}
                onClick={() => !readOnly && openSheet({ company: c })}
              />
            </li>
          ))}
        </ul>
      )}

      {!readOnly && <Fab label="Ajouter une entreprise" onClick={() => openSheet({ company: null })} />}

      <BottomSheet
        open={Boolean(sheet)}
        onClose={requestClose}
        title={sheet?.company ? 'Modifier l’entreprise' : 'Nouvelle entreprise'}
      >
        {sheet && (
          <CompanyForm
            company={sheet.company}
            onClose={closeSheet}
            onDirtyChange={setFormDirty}
            onSave={(data) =>
              sheet.company
                ? actions.updateCompany(sheet.company.id, data)
                : actions.addCompany(data)
            }
            onDelete={() => sheet.company && actions.deleteCompany(sheet.company.id)}
          />
        )}
      </BottomSheet>

      <ConfirmDialog
        open={confirmClose}
        title="Abandonner les modifications ?"
        message="Les champs saisis ne seront pas enregistrés."
        confirmLabel="Abandonner"
        onCancel={() => setConfirmClose(false)}
        onConfirm={closeSheet}
      />
    </div>
  )
}
