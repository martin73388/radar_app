// Sync engine — ARCHITECTURE.md §10bis / §10ter. Local-first: sync failures
// never block the app; conflicts are never resolved silently.
//
// The engine is REMOTE-AGNOSTIC. By default it drives the GitHub remote
// (config/state accessors + api below), unchanged from the original design.
// A second instance can drive another remote (e.g. Google Drive via an Apps
// Script gateway) by injecting its own `api`, config/state accessors and
// validators — see src/sync/drive.js and App.jsx. Two instances sharing one
// `lock` never run cycles concurrently, so adoptions can't race.

import {
  loadSyncConfig,
  saveSyncConfig,
  loadSyncState,
  saveSyncState,
  clearSync,
  parseImport,
} from '../storage/index.js'
import * as githubApi from './github.js'
import { isValidRepo } from './github.js'

export { isValidRepo }

/**
 * Pure decision core.
 * localChanged: local revision moved since last successful sync
 *   (first sync: "has any data").
 * remoteMoved: remote sha/version differs from the last synced one
 *   (first sync with an existing file: true).
 */
export function decideSync({ remoteExists, remoteMoved, localChanged }) {
  if (!remoteExists) return 'push'
  if (!remoteMoved) return localChanged ? 'push' : 'noop'
  return localChanged ? 'conflict' : 'adopt'
}

export function hasData(doc) {
  return (
    doc.companies.length > 0 ||
    doc.contacts.length > 0 ||
    doc.settings.missionEndDate != null
  )
}

/**
 * A cross-engine serializer: pass the SAME lock to several engines so their
 * cycles run one at a time (a cycle that adopts mutates the shared local doc,
 * so overlapping cycles must never interleave).
 */
export function createSyncLock() {
  let tail = Promise.resolve()
  return (fn) => {
    const result = tail.then(() => fn())
    tail = result.then(
      () => {},
      () => {},
    )
    return result
  }
}

const PUSH_DEBOUNCE_MS = 2500

// Default (GitHub) accessors — keep the original behavior byte-for-byte.
const GH = {
  loadConfig: (s) => loadSyncConfig(s),
  saveConfig: (s, c) => saveSyncConfig(s, c),
  clearConfig: (s) => clearSync(s),
  loadState: (s) => loadSyncState(s),
  saveState: (s, st) => saveSyncState(s, st),
  isValidConfig: (c) => isValidRepo(c.repo),
  normalizeConfig: (c) => ({ repo: c.repo, token: c.token, path: c.path || 'radar.json' }),
  sameTarget: (a, b) =>
    a.repo === b.repo && (a.path || 'radar.json') === (b.path || 'radar.json'),
}

/**
 * @param deps.storage  Storage for config/state keys
 * @param deps.api      { fetchRemoteFile, putRemoteFile } (injectable in tests / per remote)
 * @param deps.getDoc   () => current in-memory document
 * @param deps.adopt    (remoteDoc) => ({ ok, doc?, error? }) — snapshots then
 *                      replaces the local document (App wires applyImport)
 * @param deps.onState  (state) => void
 * @param deps.now      () => Date
 * @param deps.lock     shared serializer (default: run immediately)
 * @param deps.loadConfig/saveConfig/clearConfig/loadState/saveState  storage accessors
 * @param deps.isValidConfig/normalizeConfig/sameTarget  config helpers
 */
export function createSyncEngine({
  storage,
  api = githubApi,
  getDoc,
  adopt,
  onState,
  now = () => new Date(),
  lock = (fn) => fn(),
  loadConfig = GH.loadConfig,
  saveConfig = GH.saveConfig,
  clearConfig = GH.clearConfig,
  loadState = GH.loadState,
  saveState = GH.saveState,
  isValidConfig = GH.isValidConfig,
  normalizeConfig = GH.normalizeConfig,
  sameTarget = GH.sameTarget,
}) {
  let state = {
    status: loadConfig(storage) ? 'pending' : 'off',
    errorCode: null,
    lastSyncAt: loadState(storage).lastSyncAt,
    conflict: null, // { remoteDoc, remoteSha }
  }
  let busy = false
  let queued = false
  let pushTimer = null
  // Cancellation generation: disable()/configure() bump it so a cycle that is
  // mid-flight when the user opts out (or reconfigures) can no longer write
  // state or flip the status — its terminal writes become no-ops.
  let epoch = 0

  function setState(patch) {
    state = { ...state, ...patch }
    onState({ ...state })
  }

  const alive = (gen) => gen === epoch

  function fail(gen, errorCode) {
    if (!alive(gen)) return
    setState({
      status: errorCode === 'network' ? 'offline' : 'error',
      errorCode: errorCode === 'network' ? null : errorCode,
    })
  }

  function succeed(gen) {
    if (!alive(gen)) return
    setState({
      status: 'synced',
      errorCode: null,
      conflict: null,
      lastSyncAt: loadState(storage).lastSyncAt,
    })
  }

  async function doPush(config, sha, gen) {
    const doc = getDoc()
    // `revision` is a device-local counter — syncing it would make every
    // adopt dirty the file again and ping-pong commits between remotes/devices.
    const { revision: _deviceLocal, ...payload } = doc
    const r = await api.putRemoteFile({
      ...config,
      text: JSON.stringify(payload, null, 2),
      sha: sha ?? undefined,
      message: 'Radar sync',
    })
    if (!alive(gen)) return
    if (!r.ok) {
      if (r.error === 'sha-conflict') {
        // Remote moved while we were pushing — re-run the full cycle.
        queued = true
        setState({ status: 'pending', errorCode: null })
        return
      }
      fail(gen, r.error)
      return
    }
    saveState(storage, {
      lastSyncedSha: r.sha,
      lastSyncedRevision: doc.revision,
      lastSyncAt: now().toISOString(),
    })
    succeed(gen)
  }

  function doAdopt(remoteDoc, remoteSha, gen) {
    if (!alive(gen)) return
    const res = adopt(remoteDoc)
    if (!res.ok) {
      fail(gen, 'local')
      return
    }
    saveState(storage, {
      lastSyncedSha: remoteSha,
      lastSyncedRevision: res.doc.revision,
      lastSyncAt: now().toISOString(),
    })
    succeed(gen)
  }

  async function cycle() {
    const gen = epoch
    const config = loadConfig(storage)
    if (!config) {
      setState({ status: 'off', conflict: null })
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState({ status: 'offline', errorCode: null })
      return
    }
    setState({ status: 'syncing', errorCode: null })

    const remote = await api.fetchRemoteFile(config)
    if (!alive(gen)) return
    if (!remote.ok) {
      fail(gen, remote.error)
      return
    }

    const syncState = loadState(storage)
    const doc = getDoc()
    const localChanged =
      syncState.lastSyncedRevision == null
        ? hasData(doc)
        : doc.revision !== syncState.lastSyncedRevision
    const remoteMoved = remote.exists
      ? syncState.lastSyncedSha == null || remote.sha !== syncState.lastSyncedSha
      : false
    const action = decideSync({
      remoteExists: remote.exists,
      remoteMoved,
      localChanged,
    })

    if (action === 'noop') {
      succeed(gen)
      return
    }
    if (action === 'push') {
      await doPush(config, remote.exists ? remote.sha : null, gen)
      return
    }

    // Adoption (and conflict preview) goes through the SAME strict validation
    // as a manual import: not-JSON / not-a-Radar-doc / newer-version are all
    // rejected — never adopt garbage from a remote.
    const parsed = parseImport(remote.text)
    if (!parsed.ok) {
      fail(gen, parsed.error === 'newer-version' ? 'newer-version' : 'remote-invalid')
      return
    }
    if (action === 'adopt') {
      doAdopt(parsed.doc, remote.sha, gen)
      return
    }
    setState({
      status: 'conflict',
      conflict: { remoteDoc: parsed.doc, remoteSha: remote.sha },
    })
  }

  async function run(task) {
    if (busy) {
      queued = true
      return
    }
    busy = true
    try {
      // The shared lock serializes cycles across engines (no adoption races).
      await lock(() => task())
    } finally {
      busy = false
      if (queued) {
        queued = false
        run(cycle)
      }
    }
  }

  return {
    getState: () => ({ ...state }),
    isConfigured: () => Boolean(loadConfig(storage)),
    getConfig: () => loadConfig(storage),

    syncNow: () => run(cycle),

    /** Debounced push after a local mutation. */
    schedulePush: () => {
      if (!loadConfig(storage)) return
      if (state.status === 'conflict') return // blocked until resolved
      // Nothing new to push (e.g. the doc just changed because we adopted a
      // remote version) → don't flip to 'pending' or run a pointless cycle.
      const syncState = loadState(storage)
      if (
        syncState.lastSyncedRevision != null &&
        getDoc().revision === syncState.lastSyncedRevision
      ) {
        return
      }
      setState({ status: 'pending', errorCode: null })
      clearTimeout(pushTimer)
      pushTimer = setTimeout(() => run(cycle), PUSH_DEBOUNCE_MS)
    },

    /** Validate + store the config, then run the first sync. */
    configure: (config) => {
      if (!isValidConfig(config)) return false
      const prev = loadConfig(storage)
      const toSave = normalizeConfig(config)
      saveConfig(storage, toSave)
      // Only forget device state on a NEW pairing. Re-entering the same target
      // (e.g. renewing a token/secret) keeps the sync anchor so it doesn't
      // trigger a spurious conflict against an unchanged remote.
      if (!prev || !sameTarget(prev, toSave)) {
        saveState(storage, {
          lastSyncedSha: null,
          lastSyncedRevision: null,
          lastSyncAt: null,
        })
      }
      epoch++ // cancel any in-flight cycle from a previous config
      run(cycle)
      return true
    },

    /** Stop syncing; local data stays untouched. */
    disable: () => {
      epoch++ // cancel any in-flight cycle so it can't resurrect state
      clearTimeout(pushTimer)
      clearConfig(storage)
      setState({ status: 'off', errorCode: null, conflict: null, lastSyncAt: null })
    },

    /** Conflict resolution: force-push this device's data. */
    resolveKeepLocal: () =>
      run(async () => {
        const gen = epoch
        if (!state.conflict) return
        const config = loadConfig(storage)
        if (!config) return
        setState({ status: 'syncing', conflict: null })
        const remote = await api.fetchRemoteFile(config) // fresh sha for CAS
        if (!alive(gen)) return
        if (!remote.ok) {
          fail(gen, remote.error)
          return
        }
        await doPush(config, remote.exists ? remote.sha : null, gen)
      }),

    /** Conflict resolution: adopt the remote version (snapshot first). */
    resolveTakeRemote: () =>
      run(async () => {
        const gen = epoch
        if (!state.conflict) return
        const config = loadConfig(storage)
        if (!config) return
        setState({ status: 'syncing', conflict: null })
        const remote = await api.fetchRemoteFile(config) // may have moved again
        if (!alive(gen)) return
        if (!remote.ok) {
          fail(gen, remote.error)
          return
        }
        if (!remote.exists) {
          // Nothing remote anymore — push local instead.
          await doPush(config, null, gen)
          return
        }
        const parsed = parseImport(remote.text)
        if (!parsed.ok) {
          fail(gen, parsed.error === 'newer-version' ? 'newer-version' : 'remote-invalid')
          return
        }
        doAdopt(parsed.doc, remote.sha, gen)
      }),
  }
}
