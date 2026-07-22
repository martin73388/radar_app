import { useEffect, useState } from 'react'
import { STATUSES, TYPES } from '../config/statuses.js'
import { useRadar } from '../state/radar.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import LinksEditor from './LinksEditor.jsx'
import HistoryTimeline from './HistoryTimeline.jsx'
import { IconStar, IconTrash } from '../ui/icons.jsx'

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
    <form onSubmit={submit} className="stack-3" style={{ paddingTop: 8 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="flex-1">
          <label htmlFor="cmp-name" className="label">
            Nom *
          </label>
          <input
            id="cmp-name"
            className="input"
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
          className="icon-btn"
          style={{
            flex: 'none',
            ...(priority
              ? {
                  color: 'var(--warning)',
                  background: 'var(--warning-bg)',
                  borderColor: 'color-mix(in srgb, var(--warning) 40%, transparent)',
                }
              : { color: 'var(--text-faint)' }),
          }}
        >
          <IconStar filled={priority} />
        </button>
      </div>

      <div className="grid-2">
        <div>
          <label htmlFor="cmp-sector" className="label">
            Secteur
          </label>
          <input
            id="cmp-sector"
            className="input"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            placeholder="Robotique"
          />
        </div>
        <div>
          <label htmlFor="cmp-city" className="label">
            Ville
          </label>
          <input
            id="cmp-city"
            className="input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Paris"
          />
        </div>
      </div>

      <div>
        <span className="label">Type</span>
        <div
          className="segmented"
          role="group"
          aria-label="Type"
          style={{ display: 'flex', width: '100%' }}
        >
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={type === t.key}
              onClick={() => setType(t.key)}
              style={{ flex: 1, height: 38 }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="cmp-status" className="label">
          Statut
        </label>
        <select
          id="cmp-status"
          className="select"
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
        <label htmlFor="cmp-notes" className="label">
          Notes
        </label>
        <textarea
          id="cmp-notes"
          rows={3}
          className="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Contexte, technos, contacts à trouver…"
        />
      </div>

      <div>
        <span className="label">Annonces & liens</span>
        <p className="muted tiny" style={{ marginBottom: 8 }}>
          Colle ici les offres (LinkedIn ou autre) pour les sortir de tes mails.
          La date de publication t’aide à juger l’urgence.
        </p>
        <LinksEditor value={links} onChange={setLinks} />
      </div>

      <button type="submit" className="btn btn-primary btn-tall">
        {editing ? 'Enregistrer' : 'Ajouter l’entreprise'}
      </button>

      {editing && (
        <div>
          <span className="label">Suivi</span>
          <p className="muted tiny" style={{ marginBottom: 8 }}>
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
          className="btn btn-ghost btn-mid"
          style={{ color: 'var(--danger)' }}
        >
          <IconTrash size={16} /> Supprimer l’entreprise
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
