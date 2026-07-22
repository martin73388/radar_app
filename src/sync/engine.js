// Sync orchestration — ported from cockpit_app/src/sync/engine.js, adapted to
// Radar. On every cycle (launch / visible / online / manual / debounced push)
// we synchronise against BOTH remotes:
//   pull GitHub -> merge ; pull Drive -> merge ; then push GitHub AND Drive.
// Writes use compare-and-swap; a stale base -> re-pull + merge + re-push,
// bounded by MAX_CONFLICT_RETRIES. A remote whose current file is NOT a valid
// Radar file — or whose schemaVersion is newer than this build — is NEVER
// merged nor overwritten ('blocked' status), on the pull path AND on the
// conflict-retry path (fixes (a) and (b) from the Cockpit review).
//
// Local safety: the merged document goes through the SAME validation gate as
// a manual import (parseImport: migration, shape, duplicate ids) before it
// ever replaces local state, and the local write keeps the storage module's
// revision guard (a stale tab still cannot clobber another tab).

import * as githubRemote from './github.js'
import * as driveRemote from './drive.js'
import { mergeStates, isRadarFile, serialize } from './merge.js'
import { parseImport } from '../storage/index.js'
import { ConflictError, AuthError, SyncError } from './errors.js'

export { isValidRepo } from './github.js'
export { isValidDriveConfig } from './drive.js'

const MAX_CONFLICT_RETRIES = 4
const PUSH_DEBOUNCE_MS = 2500

// A remote file we must not clobber: it exists, has real content, but isn't
// ours. "Real content" means non-blank raw text OR a parsed non-null body — so
// a gateway that returns already-parsed JSON can't slip a foreign file past us.
function hasContent(r) {
  if (r.raw != null) return r.raw.trim().length > 0
  return r.content != null
}
function isForeign(r) {
  return !!(r && r.exists && hasContent(r) && !isRadarFile(r.content))
}

/**
 * Validation gate for remote Radar content: same rules as a manual import
 * (older schema migrated, strict shape check, duplicate ids rejected,
 * newer schema refused). Returns { ok, doc } | { ok:false, error }.
 */
function gateRemote(r) {
  const text = typeof r.raw === 'string' && r.raw.trim() ? r.raw : JSON.stringify(r.content)
  return parseImport(text)
}

function blockedMessage(error, content) {
  if (error === 'newer-version') {
    const v = content?.schemaVersion
    return `Fichier distant d'une version plus récente de Radar${v ? ` (v${v})` : ''} — mets l'app à jour. Écriture bloquée.`
  }
  return 'Fichier distant invalide — écriture bloquée, rien n’a été modifié.'
}

function classify(e) {
  if (e instanceof AuthError) return 'auth'
  if (e instanceof ConflictError) return 'conflict'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  if (e instanceof SyncError && e.transient) return 'offline'
  if (e && e.blocked) return 'blocked'
  return 'error'
}

/**
 * @param deps.store  { getSnapshot: () => doc, replaceState: (doc) => {ok, error?} }
 *                    replaceState MUST keep the storage revision guard.
 * @param deps.github / deps.drive   remote modules { isConfigured, read, write }
 * @param deps.getGithubConfig / deps.getDriveConfig  () => cfg | null
 * @param deps.onStatus  (status) => void
 */
export function createEngine({
  store,
  github = githubRemote,
  drive = driveRemote,
  getGithubConfig,
  getDriveConfig,
  onStatus = () => {},
  debounceMs = PUSH_DEBOUNCE_MS,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (h) => clearTimeout(h),
}) {
  let running = false
  let queued = false
  let debounceHandle = null
  const listeners = []
  const status = {
    running: false,
    lastReason: null,
    github: { state: 'disabled', message: '', at: null },
    drive: { state: 'disabled', message: '', at: null },
  }

  function emit() {
    status.running = running
    const snapshot = { ...status, github: { ...status.github }, drive: { ...status.drive } }
    onStatus(snapshot)
    listeners.forEach((fn) => fn(snapshot))
  }
  function setRemote(which, state, message = '') {
    status[which] = { state, message, at: state === 'ok' ? Date.now() : status[which].at }
    emit()
  }
  function setRemoteError(which, e) {
    status[which] = { state: classify(e), message: e.message || String(e), at: status[which].at }
    emit()
  }

  // Replace the local document with a merged one — through the revision guard.
  // Skips the write when the merge changed nothing (loop damper).
  function applyMerged(merged, localText) {
    if (serialize(merged) === (localText ?? serialize(store.getSnapshot()))) return
    const r = store.replaceState(merged)
    if (!r.ok) {
      throw new SyncError(
        r.error === 'conflict'
          ? 'Écriture locale refusée (autre onglet actif) — nouvel essai au prochain cycle.'
          : 'Écriture locale impossible — synchro suspendue.',
        { transient: r.error === 'conflict' },
      )
    }
  }

  // Push with compare-and-swap; on conflict re-pull, merge, retry (bounded).
  async function pushCas(remote, cfg, baseVersion, remoteText) {
    let base = baseVersion
    let knownRemoteText = remoteText
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      const text = serialize(store.getSnapshot())
      // The remote already holds exactly this content — nothing to write.
      if (knownRemoteText != null && knownRemoteText === text) return base
      try {
        const { version } = await remote.write(cfg, text, base)
        return version
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e
        let remoteContent = e.content
        let remoteVersion = e.version
        let remoteRaw = null
        if (remoteContent == null) {
          const r = await remote.read(cfg)
          if (isForeign(r)) {
            const err = new SyncError('Conflit : le fichier distant n’est pas un fichier Radar — écriture annulée.')
            err.blocked = true
            throw err
          }
          remoteContent = r.content
          remoteVersion = r.version
          remoteRaw = r.raw
        }
        // Guard the conflict-retry path too: a Drive conflict payload can carry
        // a foreign or newer-schema file we must never merge nor overwrite.
        if (remoteContent != null) {
          if (!isRadarFile(remoteContent)) {
            const err = new SyncError('Conflit : le fichier distant n’est pas un fichier Radar — écriture annulée.')
            err.blocked = true
            throw err
          }
          const gate = gateRemote({ raw: remoteRaw, content: remoteContent })
          if (!gate.ok) {
            const err = new SyncError(`Conflit : ${blockedMessage(gate.error, remoteContent)}`)
            err.blocked = true
            throw err
          }
          applyMerged(mergeStates(store.getSnapshot(), gate.doc))
        }
        base = remoteVersion
        knownRemoteText = remoteRaw
      }
    }
    throw new ConflictError('Conflit persistant après plusieurs tentatives — nouvel essai au prochain cycle.')
  }

  // Pull one remote and merge it in. Returns { version, raw, blocked, usable }.
  async function pullMerge(which, remote, cfg) {
    setRemote(which, 'syncing')
    try {
      const r = await remote.read(cfg)
      if (isForeign(r)) {
        setRemote(which, 'blocked', 'Le fichier distant n’est pas un fichier Radar — écriture bloquée, rien n’a été modifié.')
        return { version: r.version, raw: null, blocked: true, usable: true }
      }
      if (r.exists && hasContent(r)) {
        const gate = gateRemote(r)
        if (!gate.ok) {
          setRemote(which, 'blocked', blockedMessage(gate.error, r.content))
          return { version: r.version, raw: null, blocked: true, usable: true }
        }
        applyMerged(mergeStates(store.getSnapshot(), gate.doc))
      }
      return { version: r.exists ? r.version : null, raw: r.exists ? r.raw : null, blocked: false, usable: true }
    } catch (e) {
      setRemoteError(which, e)
      return { version: null, raw: null, blocked: false, usable: false }
    }
  }

  async function runCycle() {
    const ghCfg = getGithubConfig()
    const drCfg = getDriveConfig()
    const ghOn = github.isConfigured(ghCfg)
    const drOn = drive.isConfigured(drCfg)

    if (!ghOn) setRemote('github', 'disabled')
    if (!drOn) setRemote('drive', 'disabled')
    if (!ghOn && !drOn) return

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (ghOn) setRemote('github', 'offline')
      if (drOn) setRemote('drive', 'offline')
      return
    }

    // Phase 1 — pulls + merges (both remotes land in the local document).
    let gh = { usable: false, blocked: false, version: null, raw: null }
    let dr = { usable: false, blocked: false, version: null, raw: null }
    if (ghOn) gh = await pullMerge('github', github, ghCfg)
    if (drOn) dr = await pullMerge('drive', drive, drCfg)

    // Phase 2 — push both (skip blocked/unusable; skip byte-identical writes).
    if (ghOn && gh.usable && !gh.blocked) {
      setRemote('github', 'syncing')
      try {
        await pushCas(github, ghCfg, gh.version, gh.raw)
        setRemote('github', 'ok')
      } catch (e) {
        setRemoteError('github', e)
      }
    }
    if (drOn && dr.usable && !dr.blocked) {
      setRemote('drive', 'syncing')
      try {
        await pushCas(drive, drCfg, dr.version, dr.raw)
        setRemote('drive', 'ok')
      } catch (e) {
        setRemoteError('drive', e)
      }
    }
  }

  async function sync(reason = 'manual') {
    if (running) {
      queued = true
      return status
    }
    running = true
    status.lastReason = reason
    emit()
    try {
      await runCycle()
    } finally {
      running = false
      emit()
      if (queued) {
        queued = false
        schedule(() => sync('coalesced'), 0)
      }
    }
    return status
  }

  function scheduleSync(reason = 'change') {
    if (debounceHandle) cancel(debounceHandle)
    debounceHandle = schedule(() => {
      debounceHandle = null
      sync(reason)
    }, debounceMs)
  }

  function stop() {
    if (debounceHandle) cancel(debounceHandle)
    debounceHandle = null
  }

  return {
    sync,
    scheduleSync,
    stop,
    getStatus: () => ({ ...status, github: { ...status.github }, drive: { ...status.drive } }),
    onStatusChange(fn) {
      listeners.push(fn)
      return () => {
        const i = listeners.indexOf(fn)
        if (i >= 0) listeners.splice(i, 1)
      }
    },
  }
}
