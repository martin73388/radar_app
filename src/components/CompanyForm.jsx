import { useEffect, useState } from 'react'
import { STATUSES, TYPES } from '../config/statuses.js'
import { useRadar } from '../state/radar.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import LinksEditor from './LinksEditor.jsx'
import HistoryTimeline from './HistoryTimeline.jsx'
import { IconStar, IconTrash } from '../ui/icons.jsx'

const inputCls =
  'h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-[15px] text-slate-100 placeholder:text-slate-600 focus:border-teal-500/60 focus:outline-none'

/** Add/edit company form (lives in a bottom sheet). */
export default function CompanyForm({ company, onSave, onDelete, onClose, onDirtyChange }) {
  const { doc, actions } = useRadar()
  const editing = Boolean(company)
  const [name, setName] = useState(company?.name ?? '')
  const [sector, setSector] = useState(company?.sector ?? '')
  const [city, setCity] = useState(company?.city ?? '')
  const [notes, setNotes] = useState(company?.notes ?? '')
  const [type, setType] = useState(company?.type ?? 'freelance')
  const [status, setStatus] = useState(company?.status ?? 'to_contact')
  const [priority, setPriority] = useState(company?.priority ?? false)
  const [links, setLinks] = useState(company?.links ?? [])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const linkedContacts = editing
    ? doc.contacts.filter((p) => p.companyId === company.id).length
    : 0
  // History is read live from the document so immediately-appended notes show
  // without needing to save/reopen the form.
  const liveHistory = editing
    ? (doc.companies.find((c) => c.id === company.id)?.history ?? [])
    : []

  // Report unsaved edits so the sheet can guard backdrop/X dismissal.
  const dirty =
    name !== (company?.name ?? '') ||
    sector !== (company?.sector ?? '') ||
    city !== (company?.city ?? '') ||
    notes !== (company?.notes ?? '') ||
    type !== (company?.type ?? 'freelance') ||
    status !== (company?.status ?? 'to_contact') ||
    priority !== (company?.priority ?? false) ||
    JSON.stringify(links) !== JSON.stringify(company?.links ?? [])
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    // Drop blank link rows; keep the rest.
    const cleanLinks = links
      .map((l) => ({ ...l, url: l.url.trim(), label: l.label.trim() }))
      .filter((l) => l.url || l.label)
    onSave({ name: name.trim(), sector, city, notes, type, status, priority, links: cleanLinks })
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4 pt-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="cmp-name" className="mb-1 block text-sm font-medium text-slate-300">
            Nom *
          </label>
          <input
            id="cmp-name"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Wandercraft"
            required
          />
        </div>
        <button
          type="button"
          onClick={() => setPriority(!priority)}
          aria-pressed={priority}
          aria-label="Priorité"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
            priority
              ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
              : 'border-slate-800 bg-slate-950 text-slate-500'
          }`}
        >
          <IconStar filled={priority} className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cmp-sector" className="mb-1 block text-sm font-medium text-slate-300">
            Secteur
          </label>
          <input
            id="cmp-sector"
            className={inputCls}
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            placeholder="Robotique"
          />
        </div>
        <div>
          <label htmlFor="cmp-city" className="mb-1 block text-sm font-medium text-slate-300">
            Ville
          </label>
          <input
            id="cmp-city"
            className={inputCls}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Paris"
          />
        </div>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-300">Type</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Type">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={type === t.key}
              onClick={() => setType(t.key)}
              className={`h-11 rounded-xl border text-sm font-medium ${
                type === t.key
                  ? 'border-teal-500/50 bg-teal-500/15 text-teal-300'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="cmp-status" className="mb-1 block text-sm font-medium text-slate-300">
          Statut
        </label>
        <select
          id="cmp-status"
          className={inputCls}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="cmp-notes" className="mb-1 block text-sm font-medium text-slate-300">
          Notes
        </label>
        <textarea
          id="cmp-notes"
          rows={3}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[15px] text-slate-100 placeholder:text-slate-600 focus:border-teal-500/60 focus:outline-none"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Contexte, technos, contacts à trouver…"
        />
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-300">
          Annonces & liens
        </span>
        <p className="mb-2 text-xs text-slate-500">
          Colle ici les offres (LinkedIn ou autre) pour les sortir de tes mails.
          La date de publication t’aide à juger l’urgence.
        </p>
        <LinksEditor value={links} onChange={setLinks} />
      </div>

      <button
        type="submit"
        className="h-12 w-full rounded-xl bg-teal-500 text-[15px] font-semibold text-slate-950 active:bg-teal-400"
      >
        {editing ? 'Enregistrer' : 'Ajouter l’entreprise'}
      </button>

      {editing && (
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-300">Suivi</span>
          <p className="mb-2 text-xs text-slate-500">
            Historique horodaté de tes mouvements. Les notes ajoutées ici sont
            enregistrées immédiatement.
          </p>
          <HistoryTimeline
            entries={liveHistory}
            onAddNote={(text) => actions.addCompanyNote(company.id, text)}
          />
        </div>
      )}

      {editing && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-rose-400 active:bg-rose-500/10"
        >
          <IconTrash className="h-4 w-4" /> Supprimer l’entreprise
        </button>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Supprimer ${company?.name} ?`}
        message={
          linkedContacts > 0
            ? `Ses ${linkedContacts} contact${linkedContacts > 1 ? 's' : ''} ser${linkedContacts > 1 ? 'ont' : 'a'} conservé${linkedContacts > 1 ? 's' : ''} (nom d’entreprise gardé en texte). Cette action est définitive.`
            : 'Cette action est définitive.'
        }
        confirmLabel="Supprimer"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          onDelete()
          onClose()
        }}
      />
    </form>
  )
}
