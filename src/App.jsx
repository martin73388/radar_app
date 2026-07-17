import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createStore, makeId, exportJSON, DATA_KEY } from './storage/index.js'
import { createSyncEngine } from './sync/engine.js'
import { todayLocal } from './lib/dates.js'
import { downloadText } from './lib/download.js'
import { copyText } from './lib/clipboard.js'
import { RadarContext, UiContext } from './state/radar.js'
import TabBar from './components/TabBar.jsx'
import Banner from './components/Banner.jsx'
import Toast from './components/Toast.jsx'
import UpdateToast from './components/UpdateToast.jsx'
import Tableau from './screens/Tableau.jsx'
import Entreprises from './screens/Entreprises.jsx'
import Contacts from './screens/Contacts.jsx'

const nowISO = () => new Date().toISOString()

export default function App() {
  const storeRef = useRef(null)
  if (!storeRef.current) storeRef.current = createStore(window.localStorage)
  const store = storeRef.current

  const [doc, setDoc] = useState(store.initial.doc)
  const [saveError, setSaveError] = useState(null) // 'conflict' | 'write-failed' | null
  const [readOnly, setReadOnly] = useState(store.readOnly)
  // A newer app version wrote the data mid-session (PWA update in another tab).
  const [newerVersionDetected, setNewerVersionDetected] = useState(false)
  const [corruptDismissed, setCorruptDismissed] = useState(false)
  const [toast, setToast] = useState(null)
  const [tab, setTab] = useState('tableau')
  const [cmd, setCmd] = useState(null)
  const [sheetCount, setSheetCount] = useState(0)

  const docRef = useRef(doc)
  docRef.current = doc
  const saveErrorRef = useRef(saveError)
  saveErrorRef.current = saveError

  // ----- opt-in GitHub sync (ARCHITECTURE.md §10bis) -----
  const syncRef = useRef(null)
  if (!syncRef.current) {
    syncRef.current = createSyncEngine({
      storage: window.localStorage,
      getDoc: () => docRef.current,
      // Adopting a remote version = an import: snapshot first, revision guard.
      adopt: (remoteDoc) => {
        const r = store.applyImport(remoteDoc)
        if (r.ok) {
          setDoc(r.doc)
          setSaveError(null)
        } else if (r.error === 'conflict') {
          setSaveError('conflict')
        }
        return r
      },
      onState: (s) => setSyncState(s),
    })
  }
  const sync = syncRef.current
  const [syncState, setSyncState] = useState(() => sync.getState())

  // ----- today, refreshed across midnight and app resume -----
  const [today, setToday] = useState(() => todayLocal())
  useEffect(() => {
    const refresh = () => setToday((prev) => (prev === todayLocal() ? prev : todayLocal()))
    const id = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const showToast = useCallback((t) => setToast({ ...t, key: Date.now() }), [])
  const dismissToast = useCallback(() => setToast(null), [])

  // ----- mutations: write-through, every failure surfaced -----
  const mutate = useCallback(
    (fn) => {
      const next = fn(docRef.current)
      const r = store.save(next)
      if (r.ok) {
        setDoc(r.doc)
        setSaveError(null)
      } else if (r.error === 'conflict') {
        // Refuse to clobber another tab's writes; keep local state as-is.
        setSaveError('conflict')
      } else if (r.error === 'write-failed') {
        // Keep the user's changes in memory; persistent banner + retry on
        // every subsequent mutation.
        setDoc(next)
        setSaveError('write-failed')
      } else if (r.error === 'newer-version') {
        setReadOnly(true)
        setNewerVersionDetected(true)
      } else if (r.error === 'read-only') {
        showToast({ message: 'Lecture seule — modification impossible', kind: 'error' })
      }
      return r
    },
    [store, showToast],
  )

  // ----- adopt writes from other tabs when we have nothing pending -----
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== DATA_KEY && e.key !== null) return
      if (saveErrorRef.current) return // keep the conflict/failure banner
      const r = store.reload()
      if (r.status === 'ok' || r.status === 'fresh') {
        setDoc(r.doc)
      } else if (r.status === 'newer-version') {
        // Show the newer data, but this tab must never write again.
        setDoc(r.doc)
        setReadOnly(true)
        setNewerVersionDetected(true)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [store])

  // ----- sync triggers: launch, app resume, back online, local mutations -----
  useEffect(() => {
    if (sync.isConfigured()) sync.syncNow()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && sync.isConfigured()) {
        sync.syncNow()
      }
    }
    const onOnline = () => {
      if (sync.isConfigured()) sync.syncNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [sync])

  useEffect(() => {
    sync.schedulePush()
  }, [doc, sync])

  const actions = useMemo(() => {
    const updateContact = (id, patch) =>
      mutate((d) => ({
        ...d,
        contacts: d.contacts.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: nowISO() } : p,
        ),
      }))
    return {
      setMissionEndDate: (date) =>
        mutate((d) => ({ ...d, settings: { ...d.settings, missionEndDate: date } })),
      markExported: () =>
        mutate((d) => ({ ...d, settings: { ...d.settings, lastExportAt: nowISO() } })),
      addCompany: (data) =>
        mutate((d) => ({
          ...d,
          companies: [
            ...d.companies,
            { ...data, id: makeId('cmp'), createdAt: nowISO(), updatedAt: nowISO() },
          ],
        })),
      updateCompany: (id, patch) =>
        mutate((d) => ({
          ...d,
          companies: d.companies.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: nowISO() } : c,
          ),
        })),
      // Deleting a company NEVER deletes its contacts: links become free text.
      deleteCompany: (id) =>
        mutate((d) => {
          const company = d.companies.find((c) => c.id === id)
          return {
            ...d,
            companies: d.companies.filter((c) => c.id !== id),
            contacts: d.contacts.map((p) =>
              p.companyId === id
                ? {
                    ...p,
                    companyId: null,
                    companyName: company?.name ?? p.companyName,
                    updatedAt: nowISO(),
                  }
                : p,
            ),
          }
        }),
      addContact: (data) =>
        mutate((d) => ({
          ...d,
          contacts: [
            ...d.contacts,
            { ...data, id: makeId('cnt'), createdAt: nowISO(), updatedAt: nowISO() },
          ],
        })),
      updateContact,
      deleteContact: (id) =>
        mutate((d) => ({ ...d, contacts: d.contacts.filter((p) => p.id !== id) })),
      markFollowUpDone: (id) => updateContact(id, { lastContact: todayLocal() }),
      reschedule: (id, date) => updateContact(id, { nextFollowUp: date }),
      importDoc: (importedDoc) => {
        const r = store.applyImport(importedDoc)
        if (r.ok) {
          setDoc(r.doc)
          setSaveError(null)
        } else if (r.error === 'conflict') {
          setSaveError('conflict')
        }
        return r
      },
      undoImport: (snapshotKey) => {
        const r = store.undoImport(snapshotKey)
        if (r.ok) setDoc(r.doc)
        return r
      },
    }
  }, [mutate, store])

  const incSheet = useCallback(() => setSheetCount((n) => n + 1), [])
  const decSheet = useCallback(() => setSheetCount((n) => Math.max(0, n - 1)), [])
  const uiValue = useMemo(
    () => ({ sheetCount, incSheet, decSheet }),
    [sheetCount, incSheet, decSheet],
  )

  const navigate = useCallback((nextTab, nextCmd = null) => {
    setTab(nextTab)
    setCmd(nextCmd)
  }, [])
  const consumeCmd = useCallback(() => setCmd(null), [])

  const radarValue = useMemo(
    () => ({ doc, actions, readOnly, today, showToast, syncState, syncEngine: sync }),
    [doc, actions, readOnly, today, showToast, syncState, sync],
  )

  const status = store.initial.status
  const exportInMemory = () =>
    downloadText(`radar-backup-${todayLocal()}.json`, exportJSON(docRef.current))

  return (
    <RadarContext.Provider value={radarValue}>
      <UiContext.Provider value={uiValue}>
        <div className="min-h-dvh bg-slate-950 text-slate-100">
          <main
            className="mx-auto max-w-md px-4 pb-32"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
          >
            <div className="space-y-3">
              {status === 'recovered-corrupt' && !corruptDismissed && (
                <Banner
                  tone="error"
                  onDismiss={() => setCorruptDismissed(true)}
                  actions={[
                    ...(store.initial.backupKey
                      ? [
                          {
                            label: 'Télécharger la sauvegarde brute',
                            onClick: () => {
                              const raw = store.getRaw(store.initial.backupKey)
                              if (raw != null)
                                downloadText(`radar-donnees-brutes-${todayLocal()}.json`, raw)
                            },
                          },
                          {
                            label: 'Copier',
                            onClick: () => {
                              const raw = store.getRaw(store.initial.backupKey)
                              if (raw != null)
                                copyText(raw).then((ok) =>
                                  showToast(
                                    ok
                                      ? { message: 'Copié ✅' }
                                      : { message: 'Copie impossible', kind: 'error' },
                                  ),
                                )
                            },
                          },
                        ]
                      : []),
                  ]}
                >
                  ⚠️ Les données enregistrées étaient illisibles au démarrage.
                  Rien n’a été supprimé : une copie brute a été conservée —
                  récupère-la ci-dessous (tu peux l’envoyer à Claude pour la
                  réparer). L’app repart sur une base vide.
                </Banner>
              )}
              {status === 'newer-version' && (
                <Banner tone="warn">
                  Ces données viennent d’une version plus récente de Radar.
                  <strong> Lecture seule</strong> pour ne rien abîmer — ferme et
                  rouvre l’app pour la mettre à jour.
                </Banner>
              )}
              {newerVersionDetected && status !== 'newer-version' && (
                <Banner
                  tone="warn"
                  actions={[
                    {
                      label: 'Voir les données à jour',
                      onClick: () => {
                        const r = store.reload()
                        setDoc(r.doc)
                        setSaveError(null)
                      },
                    },
                    { label: 'Exporter ma copie', onClick: exportInMemory },
                  ]}
                >
                  Les données ont été mises à jour par une version plus récente
                  de Radar (autre onglet). <strong>Lecture seule</strong> ici —
                  ferme et rouvre l’app pour continuer.
                </Banner>
              )}
              {status === 'storage-unavailable' && (
                <Banner tone="error">
                  ⚠️ Stockage indisponible sur cet appareil : tes modifications
                  ne seront <strong>pas enregistrées</strong>.
                </Banner>
              )}
              {saveError === 'write-failed' && (
                <Banner
                  tone="error"
                  actions={[
                    { label: 'Exporter mes données', onClick: exportInMemory },
                    {
                      label: 'Réessayer',
                      onClick: () => {
                        const r = store.save(docRef.current)
                        if (r.ok) {
                          setDoc(r.doc)
                          setSaveError(null)
                          showToast({ message: 'Enregistré ✅' })
                        } else if (r.error === 'conflict') {
                          setSaveError('conflict')
                        } else if (r.error === 'newer-version') {
                          setReadOnly(true)
                          setNewerVersionDetected(true)
                          setSaveError(null)
                        } else {
                          showToast({
                            message:
                              'Toujours impossible d’enregistrer — exporte tes données.',
                            kind: 'error',
                          })
                        }
                      },
                    },
                  ]}
                >
                  ⚠️ Impossible d’enregistrer (stockage plein ?). Tes dernières
                  modifications ne sont <strong>pas sauvegardées</strong> —
                  exporte-les maintenant.
                </Banner>
              )}
              {syncState.status === 'conflict' && (
                <Banner
                  tone="warn"
                  actions={[
                    {
                      label: 'Garder cet appareil',
                      onClick: () => sync.resolveKeepLocal(),
                    },
                    {
                      label: 'Prendre l’autre version',
                      onClick: () => sync.resolveTakeRemote(),
                    },
                    { label: 'Exporter ma copie', onClick: exportInMemory },
                  ]}
                >
                  <strong>Conflit de synchronisation</strong> : les données ont
                  changé ici ET sur l’autre appareil. Choisis la version à
                  garder — l’autre sera remplacée (une copie de secours locale
                  est prise avant tout remplacement).
                </Banner>
              )}
              {saveError === 'conflict' && (
                <Banner
                  tone="warn"
                  actions={[
                    {
                      label: 'Recharger',
                      onClick: () => {
                        const r = store.reload()
                        setDoc(r.doc)
                        setSaveError(null)
                        if (r.status === 'newer-version') {
                          setReadOnly(true)
                          setNewerVersionDetected(true)
                        }
                      },
                    },
                    { label: 'Exporter ma copie', onClick: exportInMemory },
                  ]}
                >
                  Données modifiées dans un autre onglet. Ta dernière action n’a
                  pas été enregistrée pour ne rien écraser — recharge pour
                  repartir de la version à jour.
                </Banner>
              )}
            </div>

            <div className={status === 'recovered-corrupt' || saveError ? 'mt-4' : ''}>
              {tab === 'tableau' && <Tableau navigate={navigate} />}
              {tab === 'entreprises' && (
                <Entreprises cmd={cmd} onCmdConsumed={consumeCmd} />
              )}
              {tab === 'contacts' && <Contacts cmd={cmd} onCmdConsumed={consumeCmd} />}
            </div>
          </main>

          <TabBar tab={tab} onChange={(t) => navigate(t)} />
          <Toast toast={toast} onDismiss={dismissToast} />
          <UpdateToast />
        </div>
      </UiContext.Provider>
    </RadarContext.Provider>
  )
}
