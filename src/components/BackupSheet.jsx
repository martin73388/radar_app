import { useRef, useState } from 'react'
import BottomSheet from './BottomSheet.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { useRadar } from '../state/radar.js'
import { exportJSON, parseImport } from '../storage/index.js'
import { downloadText } from '../lib/download.js'
import { copyText } from '../lib/clipboard.js'
import { formatFR, todayLocal } from '../lib/dates.js'
import { IconDownload, IconUpload, IconCopy } from '../ui/icons.jsx'

const IMPORT_ERRORS = {
  empty: 'Le fichier est vide.',
  'not-json': 'Ce contenu n’est pas un JSON valide.',
  'not-radar': 'Ce contenu ne ressemble pas à une sauvegarde Radar.',
  'newer-version':
    'Cette sauvegarde vient d’une version plus récente de Radar. Ferme et rouvre l’app pour la mettre à jour, puis réessaie.',
  'migration-failed': 'Sauvegarde illisible — tes données n’ont pas été modifiées.',
  'invalid-shape': 'Sauvegarde invalide — tes données n’ont pas été modifiées.',
  'duplicate-ids':
    'Sauvegarde invalide (identifiants dupliqués) — tes données n’ont pas été modifiées.',
}

/** Sauvegarde: the §5 export/import APIs, reachable from the TABLEAU header. */
export default function BackupSheet({ open, onClose }) {
  const { doc, actions, readOnly, showToast } = useRadar()
  const fileRef = useRef(null)
  const [pasted, setPasted] = useState('')
  const [importError, setImportError] = useState(null)
  const [pending, setPending] = useState(null) // parsed import awaiting confirm

  function doExportDownload() {
    downloadText(`radar-backup-${todayLocal()}.json`, exportJSON(doc))
    actions.markExported()
    showToast({ message: 'Sauvegarde téléchargée ✅' })
  }

  function doExportCopy() {
    copyText(exportJSON(doc)).then((ok) => {
      if (ok) {
        actions.markExported()
        showToast({ message: 'Sauvegarde copiée ✅' })
      } else {
        showToast({ message: 'Copie impossible — utilise Télécharger', kind: 'error' })
      }
    })
  }

  function receiveText(text) {
    setImportError(null)
    const r = parseImport(text)
    if (!r.ok) {
      setImportError(IMPORT_ERRORS[r.error] ?? 'Sauvegarde illisible.')
      return
    }
    setPending(r)
  }

  function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    file.text().then(receiveText, () => setImportError('Impossible de lire le fichier.'))
  }

  function confirmImport() {
    const r = actions.importDoc(pending.doc)
    setPending(null)
    if (!r.ok) {
      setImportError('Import impossible (stockage indisponible ?). Données inchangées.')
      return
    }
    setPasted('')
    onClose()
    showToast({
      message: 'Import terminé ✅',
      action: r.snapshotKey
        ? {
            label: 'Annuler',
            onClick: () => {
              const undo = actions.undoImport(r.snapshotKey)
              showToast(
                undo.ok
                  ? { message: 'Import annulé — données restaurées.' }
                  : { message: 'Impossible de restaurer.', kind: 'error' },
              )
            },
          }
        : undefined,
    })
  }

  const lastExport = doc.settings.lastExportAt

  return (
    <BottomSheet open={open} onClose={onClose} title="Sauvegarde">
      <div className="space-y-6 pt-1">
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Exporter
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            Tes données ne vivent que sur cet appareil. Exporte régulièrement
            une copie de secours.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={doExportDownload}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-teal-500 text-sm font-semibold text-slate-950 active:bg-teal-400"
            >
              <IconDownload className="h-5 w-5" /> Télécharger
            </button>
            <button
              type="button"
              onClick={doExportCopy}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-800 text-sm font-medium text-slate-200 active:bg-slate-700"
            >
              <IconCopy className="h-5 w-5" /> Copier
            </button>
          </div>
          <p className="mt-2 font-mono text-xs tabular-nums text-slate-500">
            Dernier export :{' '}
            {lastExport ? formatFR(lastExport.slice(0, 10)) : 'jamais'}
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Importer
          </h3>
          {readOnly ? (
            <p className="mt-1 text-sm text-slate-400">
              Lecture seule — mets d’abord l’app à jour (ferme et rouvre-la).
            </p>
          ) : (
            <>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 text-sm font-medium text-slate-200 active:bg-slate-800"
                >
                  <IconUpload className="h-5 w-5" /> Choisir un fichier…
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={onFile}
                  className="hidden"
                />
                <textarea
                  rows={3}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="…ou colle ici le contenu d’une sauvegarde"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 placeholder:font-sans placeholder:text-sm placeholder:text-slate-600 focus:border-teal-500/60 focus:outline-none"
                />
                {pasted.trim() && (
                  <button
                    type="button"
                    onClick={() => receiveText(pasted)}
                    className="h-11 w-full rounded-xl bg-slate-800 text-sm font-medium text-slate-200 active:bg-slate-700"
                  >
                    Vérifier et importer
                  </button>
                )}
              </div>
              {importError && (
                <p className="mt-2 text-sm font-medium text-rose-300">{importError}</p>
              )}
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        title="Remplacer les données ?"
        message={
          pending
            ? `Importer ${pending.counts.companies} entreprise${pending.counts.companies > 1 ? 's' : ''} et ${pending.counts.contacts} contact${pending.counts.contacts > 1 ? 's' : ''} — remplace tes ${doc.companies.length} entreprise${doc.companies.length > 1 ? 's' : ''} et ${doc.contacts.length} contact${doc.contacts.length > 1 ? 's' : ''} actuels. Tu pourras annuler juste après l’import.`
            : ''
        }
        confirmLabel="Importer"
        onCancel={() => setPending(null)}
        onConfirm={confirmImport}
      />
    </BottomSheet>
  )
}
