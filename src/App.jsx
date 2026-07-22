import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createStore,
  makeId,
  exportJSON,
  DATA_KEY,
  loadSyncConfig,
  loadDriveSyncConfig,
  loadThemePref,
  saveThemePref,
} from './storage/index.js'
import { createEngine } from './sync/engine.js'
import { statusOf } from './config/statuses.js'
import { todayLocal, dueSoonCount } from './lib/dates.js'
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

// Cockpit-style theme override: 'system' follows prefers-color-scheme via
// tokens.css; 'light'/'dark' pin the [data-theme] attribute (wins over system).
function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme)
  else root.removeAttribute('data-theme')
}

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
  const [theme, setThemeState] = useState(() => loadThemePref(window.localStorage))

  const docRef = useRef(doc)
  docRef.current = doc
  const saveErrorRef = useRef(saveError)
  saveErrorRef.current = saveError
  // Read-only latch (newer-version doc): this tab must never write — locally
  // NOR remotely. Syncing would re-stamp a v(n+1) document as v(n) on push.
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  // showToast is defined below; the sync engine (created once here) reaches it
  // through this ref so its closure never goes stale.
  const showToastRef = useRef(() => {})

  useEffect(() => applyTheme(theme), [theme])
  const setTheme = useCallback((t) => {
    setThemeState(t)
    saveThemePref(window.localStorage, t)
  }, [])

  // ----- opt-in sync: ONE merge-based engine driving BOTH remotes (GitHub +
  // Google Drive gateway) — ARCHITECTURE.md §10bis/§10ter, Cockpit pattern:
  // pull+merge each remote, then push both with compare-and-swap. -----
  const engineRef = useRef(null)
  if (!engineRef.current) {
    engineRef.current = createEngine({
      store: {
        getSnapshot: () => docRef.current,
        // The merged doc goes through the SAME revision-guarded save as any
        // mutation — a stale tab still cannot clobber another tab's writes.
        replaceState: (merged) => {
          const r = store.save(merged)
          if (r.ok) {
            // Synchronous ref update: the push phase of the SAME cycle must
            // serialize the merged doc, not wait for the next React render.
            docRef.current = r.doc
            setDoc(r.doc)
            setSaveError(null)
            showToastRef.current({ message: 'Données synchronisées depuis un autre appareil' })
          } else if (r.error === 'conflict') {
            setSaveError('conflict')
          }
          return r
        },
      },
      getGithubConfig: () => loadSyncConfig(window.localStorage),
      getDriveConfig: () => loadDriveSyncConfig(window.localStorage),
      onStatus: (s) => setSyncStatus(s),
    })
  }
  const engine = engineRef.current
  const [syncStatus, setSyncStatus] = useState(() => engine.getStatus())

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
  showToastRef.current = showToast
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

  // ----- sync triggers: launch, app resume, back online, local mutations.
  // Guarded while local persistence is unhealthy: a cycle pulls & merges into
  // the local doc, which must not happen over an unsaved/conflicted state. -----
  useEffect(() => {
    const syncNow = (reason) => {
      if (saveErrorRef.current || readOnlyRef.current) return
      engine.sync(reason)
    }
    syncNow('launch')
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncNow('visible')
    }
    const onOnline = () => syncNow('online')
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      engine.stop()
    }
  }, [engine])

  useEffect(() => {
    if (saveError || readOnly) return
    engine.scheduleSync('change')
  }, [doc, saveError, readOnly, engine])

  const actions = useMemo(() => {
    const updateContact = (id, patch) =>
      mutate((d) => ({
        ...d,
        contacts: d.contacts.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: nowISO() } : p,
        ),
      }))
    // settings is merged whole-block by LWW on this (additive) stamp.
    const stampSettings = (settings) => ({ ...settings, updatedAt: Date.now() })
    return {
      setMissionEndDate: (date) =>
        mutate((d) => ({
          ...d,
          settings: stampSettings({ ...d.settings, missionEndDate: date }),
        })),
      // NO settings.updatedAt stamp here: lastExportAt is pure metadata and
      // merges as max-of-both on its own (merge.js) — an export must never
      // drag stale user settings over the other device's newer ones.
      markExported: () =>
        mutate((d) => ({
          ...d,
          settings: { ...d.settings, lastExportAt: nowISO() },
        })),
      addCompany: (data) =>
        mutate((d) => ({
          ...d,
          companies: [
            ...d.companies,
            {
              links: [],
              history: [],
              ...data,
              id: makeId('cmp'),
              createdAt: nowISO(),
              updatedAt: nowISO(),
            },
          ],
        })),
      updateCompany: (id, patch) =>
        mutate((d) => ({
          ...d,
          companies: d.companies.map((c) => {
            if (c.id !== id) return c
            // Auto-log a status change into the immutable history timeline.
            const changed = patch.status && patch.status !== c.status
            const history = changed
              ? [
                  ...(c.history ?? []),
                  {
                    id: makeId('evt'),
                    at: nowISO(),
                    kind: 'status',
                    text: `Statut : ${statusOf(c.status).label} → ${statusOf(patch.status).label}`,
                  },
                ]
              : c.history
            return { ...c, ...patch, history, updatedAt: nowISO() }
          }),
        })),
      addCompanyNote: (id, text) =>
        mutate((d) => ({
          ...d,
          companies: d.companies.map((c) =>
            c.id === id
              ? {
                  ...c,
                  history: [
                    ...(c.history ?? []),
                    { id: makeId('evt'), at: nowISO(), kind: 'note', text },
                  ],
                  updatedAt: nowISO(),
                }
              : c,
          ),
        })),
      addContactNote: (id, text) =>
        mutate((d) => ({
          ...d,
          contacts: d.contacts.map((p) =>
            p.id === id
              ? {
                  ...p,
                  history: [
                    ...(p.history ?? []),
                    { id: makeId('evt'), at: nowISO(), kind: 'note', text },
                  ],
                  updatedAt: nowISO(),
                }
              : p,
          ),
        })),
      // Deleting a company NEVER deletes its contacts: links become free text.
      // A tombstone (root.deleted[]) stops other devices resurrecting it.
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
            deleted: [...(d.deleted ?? []), { id, at: Date.now(), kind: 'company' }],
          }
        }),
      addContact: (data) =>
        mutate((d) => ({
          ...d,
          contacts: [
            ...d.contacts,
            {
              history: [],
              ...data,
              id: makeId('cnt'),
              createdAt: nowISO(),
              updatedAt: nowISO(),
            },
          ],
        })),
      updateContact,
      deleteContact: (id) =>
        mutate((d) => ({
          ...d,
          contacts: d.contacts.filter((p) => p.id !== id),
          deleted: [...(d.deleted ?? []), { id, at: Date.now(), kind: 'contact' }],
        })),
      // Sets lastContact to today, appends a global stats entry AND a
      // timestamped entry in the contact's own history timeline.
      markFollowUpDone: (id) =>
        mutate((d) => {
          const day = todayLocal()
          return {
            ...d,
            contacts: d.contacts.map((p) =>
              p.id === id
                ? {
                    ...p,
                    lastContact: day,
                    history: [
                      ...(p.history ?? []),
                      { id: makeId('evt'), at: nowISO(), kind: 'relance', text: 'Relance faite' },
                    ],
                    updatedAt: nowISO(),
                  }
                : p,
            ),
            activityLog: [
              ...(d.activityLog ?? []),
              // id makes each event unique across devices (merge = union by id).
              { id: makeId('act'), type: 'relance', date: day, contactId: id },
            ],
          }
        }),
      reschedule: (id, date) => updateContact(id, { nextFollowUp: date }),
      importDoc: (importedDoc) => {
        // A manual import is a confirmed REPLACE. Tombstone every entity the
        // import removes, so sync propagates the removal instead of merging
        // the old records straight back from the remotes seconds later.
        const prev = docRef.current
        const kept = new Set(
          [...importedDoc.companies, ...importedDoc.contacts].map((e) => e.id),
        )
        const now = Date.now()
        const removedTombs = [
          ...prev.companies
            .filter((c) => !kept.has(c.id))
            .map((c) => ({ id: c.id, at: now, kind: 'company' })),
          ...prev.contacts
            .filter((p) => !kept.has(p.id))
            .map((p) => ({ id: p.id, at: now, kind: 'contact' })),
        ]
        const withTombs = removedTombs.length
          ? { ...importedDoc, deleted: [...(importedDoc.deleted ?? []), ...removedTombs] }
          : importedDoc
        const r = store.applyImport(withTombs)
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

  // ----- due-today badge: tab count + app-icon badge (Android/Chromium) -----
  const dueCount = useMemo(() => dueSoonCount(doc.contacts, today), [doc.contacts, today])
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    if (dueCount > 0 && navigator.setAppBadge) {
      navigator.setAppBadge(dueCount).catch(() => {})
    } else if (navigator.clearAppBadge) {
      navigator.clearAppBadge().catch(() => {})
    }
  }, [dueCount])

  const radarValue = useMemo(
    () => ({
      doc,
      actions,
      readOnly,
      today,
      showToast,
      syncStatus,
      syncEngine: engine,
      theme,
      setTheme,
    }),
    [doc, actions, readOnly, today, showToast, syncStatus, engine, theme, setTheme],
  )

  const status = store.initial.status
  const exportInMemory = () =>
    downloadText(`radar-backup-${todayLocal()}.json`, exportJSON(docRef.current))

  return (
    <RadarContext.Provider value={radarValue}>
      <UiContext.Provider value={uiValue}>
        <div className="app-shell">
          <main className="app-main">
            <div className="stack-3">
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
              {(syncStatus.github.state === 'blocked' || syncStatus.drive.state === 'blocked') && (
                <Banner tone="warn">
                  <strong>Synchro bloquée</strong> :{' '}
                  {syncStatus.github.state === 'blocked'
                    ? syncStatus.github.message
                    : syncStatus.drive.message}{' '}
                  Tes données locales sont intactes.
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

            <div className={status === 'recovered-corrupt' || saveError ? 'gap-top' : ''}>
              {tab === 'tableau' && <Tableau navigate={navigate} />}
              {tab === 'entreprises' && (
                <Entreprises cmd={cmd} onCmdConsumed={consumeCmd} />
              )}
              {tab === 'contacts' && <Contacts cmd={cmd} onCmdConsumed={consumeCmd} />}
            </div>
          </main>

          <TabBar tab={tab} onChange={(t) => navigate(t)} dueCount={dueCount} />
          <Toast toast={toast} onDismiss={dismissToast} />
          <UpdateToast />
        </div>
      </UiContext.Provider>
    </RadarContext.Provider>
  )
}
