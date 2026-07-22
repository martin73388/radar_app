import { useRef, useState } from 'react'
import BottomSheet from './BottomSheet.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import { useRadar } from '../state/radar.js'
import {
  exportJSON,
  parseImport,
  saveSyncConfig,
  clearSync,
  saveDriveSyncConfig,
  clearDriveSync,
} from '../storage/index.js'
import { downloadText } from '../lib/download.js'
import { copyText } from '../lib/clipboard.js'
import { formatFR, todayLocal } from '../lib/dates.js'
import { isValidRepo, isValidDriveConfig } from '../sync/engine.js'
import { syncStatusLabel } from '../sync/labels.js'
import { IconDownload, IconUpload, IconCopy } from '../ui/icons.jsx'

const UNDO_ERRORS = {
  conflict:
    'Impossible d’annuler : les données ont déjà changé depuis l’import.',
  'read-only': 'Lecture seule — annulation impossible.',
  'write-failed': 'Impossible de restaurer (stockage indisponible ?).',
}

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

const THEMES = [
  { key: 'system', label: 'Système' },
  { key: 'light', label: 'Clair' },
  { key: 'dark', label: 'Sombre' },
]

/** Sauvegarde: export/import + the two sync remotes + theme, from the ⚙️. */
export default function BackupSheet({ open, onClose }) {
  const { doc, actions, readOnly, showToast, syncStatus, syncEngine, theme, setTheme } =
    useRadar()
  const fileRef = useRef(null)
  const [pasted, setPasted] = useState('')
  const [importError, setImportError] = useState(null)
  const [pending, setPending] = useState(null) // parsed import awaiting confirm
  const [ghConfigured, setGhConfigured] = useState(
    () => syncStatus.github.state !== 'disabled',
  )
  const [drConfigured, setDrConfigured] = useState(
    () => syncStatus.drive.state !== 'disabled',
  )
  const [repoInput, setRepoInput] = useState('')
  const [tokenInput, setTokenInput] = useState('')
  const [syncError, setSyncError] = useState(null)
  const [driveUrlInput, setDriveUrlInput] = useState('')
  const [driveSecretInput, setDriveSecretInput] = useState('')
  const [driveError, setDriveError] = useState(null)

  // The engine reads configs straight from storage on each cycle; the two
  // *Configured flags only drive which form this sheet shows.
  const ghOn = ghConfigured || syncStatus.github.state !== 'disabled'
  const drOn = drConfigured || syncStatus.drive.state !== 'disabled'

  function activateSync() {
    const repo = repoInput.trim()
    const token = tokenInput.trim()
    if (!isValidRepo(repo)) {
      setSyncError('Format attendu : utilisateur/dépôt (ex. martin73388/radar_core)')
      return
    }
    if (!token) {
      setSyncError('Colle ton jeton d’accès GitHub (fine-grained PAT).')
      return
    }
    setSyncError(null)
    setTokenInput('')
    saveSyncConfig(window.localStorage, { repo, token, path: 'radar.json' })
    setGhConfigured(true)
    syncEngine.sync('configure')
    showToast({ message: 'Synchro GitHub activée — première synchronisation…' })
  }

  function disableSync() {
    clearSync(window.localStorage)
    setGhConfigured(false)
    syncEngine.sync('disable') // refreshes the status to 'disabled'
    showToast({ message: 'Synchro GitHub désactivée — tes données locales sont conservées.' })
  }

  function activateDriveSync() {
    const url = driveUrlInput.trim()
    const secret = driveSecretInput.trim()
    if (!isValidDriveConfig({ url, secret })) {
      setDriveError(
        !/^https:\/\/\S+$/i.test(url)
          ? 'URL attendue : https://… (déploiement Apps Script « Web App »).'
          : 'Colle le secret partagé de la passerelle.',
      )
      return
    }
    setDriveError(null)
    setDriveSecretInput('')
    saveDriveSyncConfig(window.localStorage, { url, secret, path: 'radar.json' })
    setDrConfigured(true)
    syncEngine.sync('configure')
    showToast({ message: 'Synchro Drive activée — première synchronisation…' })
  }

  function disableDriveSync() {
    clearDriveSync(window.localStorage)
    setDrConfigured(false)
    syncEngine.sync('disable')
    showToast({ message: 'Synchro Drive désactivée — tes données locales sont conservées.' })
  }

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
                  : {
                      message: UNDO_ERRORS[undo.error] ?? 'Impossible de restaurer.',
                      kind: 'error',
                    },
              )
            },
          }
        : undefined,
    })
  }

  const lastExport = doc.settings.lastExportAt

  return (
    <BottomSheet open={open} onClose={onClose} title="Sauvegarde & réglages">
      <div className="stack-5" style={{ paddingTop: 4 }}>
        <section>
          <h3 className="section-title">Thème</h3>
          <div className="segmented" style={{ marginTop: 10 }} role="group" aria-label="Thème">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={theme === t.key}
                onClick={() => setTheme(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="section-title">Exporter</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            Exporte régulièrement une copie de secours de tes données.
          </p>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <button type="button" onClick={doExportDownload} className="btn btn-primary btn-tall">
              <IconDownload /> Télécharger
            </button>
            <button type="button" onClick={doExportCopy} className="btn btn-tall">
              <IconCopy /> Copier
            </button>
          </div>
          <p className="faint tiny mono-nums" style={{ marginTop: 8 }}>
            Dernier export :{' '}
            {lastExport ? formatFR(todayLocal(new Date(lastExport))) : 'jamais'}
          </p>
        </section>

        <section>
          <h3 className="section-title">Importer</h3>
          {readOnly ? (
            <p className="muted small" style={{ marginTop: 4 }}>
              Lecture seule — mets d’abord l’app à jour (ferme et rouvre-la).
            </p>
          ) : (
            <>
              <div className="stack-2" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="btn btn-tall"
                >
                  <IconUpload /> Choisir un fichier…
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={onFile}
                  className="sr-only"
                />
                <textarea
                  rows={3}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="…ou colle ici le contenu d’une sauvegarde"
                  className="textarea"
                />
                {pasted.trim() && (
                  <button
                    type="button"
                    onClick={() => receiveText(pasted)}
                    className="btn btn-mid"
                  >
                    Vérifier et importer
                  </button>
                )}
              </div>
              {importError && (
                <p className="danger-text" style={{ marginTop: 8 }}>{importError}</p>
              )}
            </>
          )}
        </section>

        <section>
          <h3 className="section-title">Synchronisation GitHub (téléphone ↔ iPad)</h3>
          {ghOn ? (
            <>
              <p className="muted small" style={{ marginTop: 4 }}>
                {syncStatusLabel(syncStatus.github, 'github')}
              </p>
              <div className="grid-2" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => syncEngine.sync('manual')}
                  className="btn btn-primary btn-tall"
                >
                  Synchroniser maintenant
                </button>
                <button type="button" onClick={disableSync} className="btn btn-tall">
                  Désactiver
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 4 }}>
                Partage tes données entre appareils via un{' '}
                <strong>dépôt GitHub privé</strong> que tu possèdes. Le jeton
                reste sur cet appareil — jamais dans le code de l’app. (Guide
                dans le README.)
              </p>
              <div className="stack-2" style={{ marginTop: 12 }}>
                <input
                  aria-label="Dépôt privé GitHub"
                  className="input"
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="utilisateur/dépôt (ex. martin73388/radar_core)"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                />
                <input
                  aria-label="Jeton d’accès GitHub"
                  type="password"
                  className="input"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="github_pat_…"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                />
                <button type="button" onClick={activateSync} className="btn btn-primary btn-tall">
                  Activer la synchro
                </button>
                {syncError && <p className="danger-text">{syncError}</p>}
              </div>
            </>
          )}
        </section>

        <section>
          <h3 className="section-title">Synchronisation Drive (Cockpit)</h3>
          {drOn ? (
            <>
              <p className="muted small" style={{ marginTop: 4 }}>
                {syncStatusLabel(syncStatus.drive, 'drive')}
              </p>
              <div className="grid-2" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => syncEngine.sync('manual')}
                  className="btn btn-primary btn-tall"
                >
                  Synchroniser maintenant
                </button>
                <button type="button" onClick={disableDriveSync} className="btn btn-tall">
                  Désactiver
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 4 }}>
                Synchronise aussi vers <strong>Google Drive</strong> via ta
                passerelle Apps Script (le Cockpit). L’URL et le secret restent
                sur cet appareil — jamais dans le code. GitHub reste actif en
                parallèle : Drive s’ajoute, il ne remplace rien.
              </p>
              <div className="stack-2" style={{ marginTop: 12 }}>
                <input
                  aria-label="URL de la passerelle Drive"
                  className="input"
                  value={driveUrlInput}
                  onChange={(e) => setDriveUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/…/exec"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="url"
                />
                <input
                  aria-label="Secret de la passerelle Drive"
                  type="password"
                  className="input"
                  value={driveSecretInput}
                  onChange={(e) => setDriveSecretInput(e.target.value)}
                  placeholder="secret partagé"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                />
                <button
                  type="button"
                  onClick={activateDriveSync}
                  className="btn btn-primary btn-tall"
                >
                  Activer la synchro Drive
                </button>
                {driveError && <p className="danger-text">{driveError}</p>}
              </div>
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
