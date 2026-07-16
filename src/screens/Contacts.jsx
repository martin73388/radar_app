import { useEffect, useState } from 'react'
import { useRadar } from '../state/radar.js'
import { compareByFollowUpUrgency } from '../lib/dates.js'
import SearchBar from '../components/SearchBar.jsx'
import ContactCard from '../components/ContactCard.jsx'
import ContactForm from '../components/ContactForm.jsx'
import ReschedulePrompt from '../components/ReschedulePrompt.jsx'
import BottomSheet from '../components/BottomSheet.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import Fab from '../components/Fab.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { IconUsers } from '../ui/icons.jsx'

export default function Contacts({ cmd, onCmdConsumed }) {
  const { doc, actions, readOnly } = useRadar()
  const [search, setSearch] = useState('')
  // Initialized from cmd so an onboarding tap opens the form immediately.
  const [sheet, setSheet] = useState(
    cmd?.openForm && !readOnly ? { contact: null } : null,
  ) // { contact: object | null }
  const [rescheduling, setRescheduling] = useState(null)
  const [formDirty, setFormDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

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
    if (cmd.openForm && !readOnly) openSheet({ contact: null })
    onCmdConsumed()
  }, [cmd, onCmdConsumed, readOnly])

  const companiesById = new Map(doc.companies.map((c) => [c.id, c]))
  const q = search.trim().toLowerCase()
  const filtered = doc.contacts
    .filter((p) => {
      if (!q) return true
      const companyLabel =
        (p.companyId && companiesById.get(p.companyId)?.name) || p.companyName
      return `${p.name} ${companyLabel} ${p.role} ${p.notes}`.toLowerCase().includes(q)
    })
    .sort(compareByFollowUpUrgency)

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-slate-100">Contacts</h1>
      <SearchBar value={search} onChange={setSearch} placeholder="Rechercher…" />

      {doc.contacts.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-10 w-10" />}
          title="Aucun contact pour l’instant"
          hint="Ajoute un premier contact avec le bouton +"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-10 w-10" />}
          title="Aucun résultat"
          hint="Modifie la recherche"
        />
      ) : (
        <ul className="space-y-2 pb-40">
          {filtered.map((p) => (
            <li key={p.id}>
              <ContactCard
                contact={p}
                onClick={() => !readOnly && openSheet({ contact: p })}
                onDone={() => {
                  actions.markFollowUpDone(p.id)
                  setRescheduling(p)
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {!readOnly && <Fab label="Ajouter un contact" onClick={() => openSheet({ contact: null })} />}

      <BottomSheet
        open={Boolean(sheet)}
        onClose={requestClose}
        title={sheet?.contact ? 'Modifier le contact' : 'Nouveau contact'}
      >
        {sheet && (
          <ContactForm
            contact={sheet.contact}
            onClose={closeSheet}
            onDirtyChange={setFormDirty}
            onSave={(data) =>
              sheet.contact
                ? actions.updateContact(sheet.contact.id, data)
                : actions.addContact(data)
            }
            onDelete={() => sheet.contact && actions.deleteContact(sheet.contact.id)}
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

      <ReschedulePrompt
        contact={rescheduling}
        onPick={(date) => {
          actions.reschedule(rescheduling.id, date)
          setRescheduling(null)
        }}
        onClose={() => setRescheduling(null)}
      />
    </div>
  )
}
