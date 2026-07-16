import { useEffect, useState } from 'react'
import { useRadar } from '../state/radar.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import DateField from './DateField.jsx'
import { IconTrash } from '../ui/icons.jsx'

const inputCls =
  'h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-[15px] text-slate-100 placeholder:text-slate-600 focus:border-teal-500/60 focus:outline-none'

/**
 * Add/edit contact form. Company: link to a record (select) OR free text —
 * validated by Martin (Phase 1).
 */
export default function ContactForm({ contact, onSave, onDelete, onClose, onDirtyChange }) {
  const { doc } = useRadar()
  const editing = Boolean(contact)
  const [name, setName] = useState(contact?.name ?? '')
  const [companyId, setCompanyId] = useState(contact?.companyId ?? '')
  const [companyName, setCompanyName] = useState(contact?.companyName ?? '')
  const [role, setRole] = useState(contact?.role ?? '')
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
      notes,
      lastContact,
      nextFollowUp,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4 pt-2">
      <div>
        <label htmlFor="cnt-name" className="mb-1 block text-sm font-medium text-slate-300">
          Nom *
        </label>
        <input
          id="cnt-name"
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          required
        />
      </div>

      <div>
        <label htmlFor="cnt-company" className="mb-1 block text-sm font-medium text-slate-300">
          Entreprise
        </label>
        <select
          id="cnt-company"
          className={inputCls}
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
            className={`${inputCls} mt-2`}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="…ou saisis un nom en texte libre"
          />
        )}
      </div>

      <div>
        <label htmlFor="cnt-role" className="mb-1 block text-sm font-medium text-slate-300">
          Rôle
        </label>
        <input
          id="cnt-role"
          className={inputCls}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="CTO, recruteuse, lead robotique…"
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
        <label htmlFor="cnt-notes" className="mb-1 block text-sm font-medium text-slate-300">
          Notes
        </label>
        <textarea
          id="cnt-notes"
          rows={3}
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[15px] text-slate-100 placeholder:text-slate-600 focus:border-teal-500/60 focus:outline-none"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Où vous vous êtes parlé, sujets, ton…"
        />
      </div>

      <button
        type="submit"
        className="h-12 w-full rounded-xl bg-teal-500 text-[15px] font-semibold text-slate-950 active:bg-teal-400"
      >
        {editing ? 'Enregistrer' : 'Ajouter le contact'}
      </button>

      {editing && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-rose-400 active:bg-rose-500/10"
        >
          <IconTrash className="h-4 w-4" /> Supprimer le contact
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
