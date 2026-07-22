import { useEffect, useState } from 'react'
import { useRadar } from '../state/radar.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import DateField from './DateField.jsx'
import HistoryTimeline from './HistoryTimeline.jsx'
import { IconTrash } from '../ui/icons.jsx'

/**
 * Add/edit contact form. Company: link to a record (select) OR free text —
 * validated by Martin (Phase 1).
 */
export default function ContactForm({ contact, onSave, onDelete, onClose, onDirtyChange }) {
  const { doc, actions } = useRadar()
  const editing = Boolean(contact)
  const liveHistory = editing
    ? (doc.contacts.find((p) => p.id === contact.id)?.history ?? [])
    : []
  const [name, setName] = useState(contact?.name ?? '')
  const [companyId, setCompanyId] = useState(contact?.companyId ?? '')
  const [companyName, setCompanyName] = useState(contact?.companyName ?? '')
  const [role, setRole] = useState(contact?.role ?? '')
  const [linkedin, setLinkedin] = useState(contact?.linkedin ?? '')
  const [notes, setNotes] = useState(contact?.notes ?? '')
  const [lastContact, setLastContact] = useState(contact?.lastContact ?? null)
  const [nextFollowUp, setNextFollowUp] = useState(contact?.nextFollowUp ?? null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const sortedCompanies = [...doc.companies].sort((a, b) =>
    a.name.localeCompare(b.name, 'fr'),
  )

  // Report unsaved edits so the sheet can guard backdrop/X dismissal.
  const dirty =
    name !== (contact?.name ?? '') ||
    companyId !== (contact?.companyId ?? '') ||
    companyName !== (contact?.companyName ?? '') ||
    role !== (contact?.role ?? '') ||
    linkedin !== (contact?.linkedin ?? '') ||
    notes !== (contact?.notes ?? '') ||
    lastContact !== (contact?.lastContact ?? null) ||
    nextFollowUp !== (contact?.nextFollowUp ?? null)
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      companyId: companyId || null,
      companyName: companyId ? '' : companyName.trim(),
      role,
      linkedin: linkedin.trim(),
      notes,
      lastContact,
      nextFollowUp,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="stack-3" style={{ paddingTop: 8 }}>
      <div>
        <label htmlFor="cnt-name" className="label">
          Nom *
        </label>
        <input
          id="cnt-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          required
        />
      </div>

      <div>
        <label htmlFor="cnt-company" className="label">
          Entreprise
        </label>
        <select
          id="cnt-company"
          className="select"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          <option value="">— Aucune fiche liée —</option>
          {sortedCompanies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {!companyId && (
          <input
            aria-label="Entreprise (texte libre)"
            className="input"
            style={{ marginTop: 8 }}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="…ou saisis un nom en texte libre"
          />
        )}
      </div>

      <div>
        <label htmlFor="cnt-role" className="label">
          Rôle
        </label>
        <input
          id="cnt-role"
          className="input"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="CTO, recruteuse, lead robotique…"
        />
      </div>

      <div>
        <label htmlFor="cnt-linkedin" className="label">
          LinkedIn
        </label>
        <input
          id="cnt-linkedin"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="input"
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          placeholder="https://www.linkedin.com/in/…"
        />
      </div>

      <DateField
        id="cnt-last"
        label="Dernier contact"
        value={lastContact}
        onChange={setLastContact}
      />
      <DateField
        id="cnt-next"
        label="Prochaine relance"
        value={nextFollowUp}
        onChange={setNextFollowUp}
      />

      <div>
        <label htmlFor="cnt-notes" className="label">
          Notes
        </label>
        <textarea
          id="cnt-notes"
          rows={3}
          className="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Où vous vous êtes parlé, sujets, ton…"
        />
      </div>

      <button type="submit" className="btn btn-primary btn-tall">
        {editing ? 'Enregistrer' : 'Ajouter le contact'}
      </button>

      {editing && (
        <div>
          <span className="label">Suivi</span>
          <p className="faint tiny" style={{ marginBottom: 8 }}>
            Historique horodaté (notes + relances). Les notes sont enregistrées
            immédiatement.
          </p>
          <HistoryTimeline
            entries={liveHistory}
            onAddNote={(text) => actions.addContactNote(contact.id, text)}
          />
        </div>
      )}

      {editing && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="btn btn-danger btn-mid"
        >
          <IconTrash size={16} /> Supprimer le contact
        </button>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Supprimer ${contact?.name} ?`}
        message="Cette action est définitive."
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
