// Sync engine — ARCHITECTURE.md §10bis. Local-first: sync failures never
// block the app; conflicts are never resolved silently.

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
 * remoteMoved: remote sha differs from the last synced sha
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

const PUSH_DEBOUNCE_MS = 2500

/**
 * @param deps.storage  Storage for config/state keys
 * @param deps.api      { fetchRemoteFile, putRemoteFile } (injectable in tests)
 * @param deps.getDoc   () => current in-memory document
 * @param deps.adopt    (remoteDoc) => ({ ok, doc?, error? }) — snapshots then
 *                      replaces the local document (App wires applyImport)
 * @param deps.onState  (state) => void
 * @param deps.now      () => Date
 */
export function createSyncEngine({
  storage,
  api = githubApi,
  getDoc,
  adopt,
  onState,
  now = () => new Date(),
}) {
  let state = {
    status: loadSyncConfig(storage) ? 'pending' : 'off',
    errorCode: null,
    lastSyncAt: loadSyncState(storage).lastSyncAt,
    conflict: null, // { remoteDoc, remoteSha }
  }
  let busy = false
  let queued = false
  let pushTimer = null

  function setState(patch) {
    state = { ...state, ...patch }
    onState({ ...state })
  }

  function fail(errorCode) {
    setState({
      status: errorCode === 'network' ? 'offline' : 'error',
      errorCode: errorCode === 'network' ? null : errorCode,
    })
  }

  function succeed() {
    setState({
      status: 'synced',
      errorCode: null,
      conflict: null,
      lastSyncAt: loadSyncState(storage).lastSyncAt,
    })
  }

  async function doPush(config, sha) {
    const doc = getDoc()
    // `revision` is a device-local counter — syncing it would make every
    // adopt dirty the file again and ping-pong commits between devices.
    const { revision: _deviceLocal, ...payload } = doc
    const r = await api.putRemoteFile({
      ...config,
      text: JSON.stringify(payload, null, 2),
      sha: sha ?? undefined,
      message: 'Radar sync',
    })
    if (!r.ok) {
      if (r.error === 'sha-conflict') {
        // Remote moved while we were pushing — re-run the full cycle.
        queued = true
        setState({ status: 'pending', errorCode: null })
        return
      }
      fail(r.error)
      return
    }
    saveSyncState(storage, {
      lastSyncedSha: r.sha,
      lastSyncedRevision: doc.revision,
      lastSyncAt: now().toISOString(),
    })
    succeed()
  }

  function doAdopt(remoteDoc, remoteSha) {
    const res = adopt(remoteDoc)
    if (!res.ok) {
      fail('local')
      return
    }
    saveSyncState(storage, {
      lastSyncedSha: remoteSha,
      lastSyncedRevision: res.doc.revision,
      lastSyncAt: now().toISOString(),
    })
    succeed()
  }

  async function cycle() {
    const config = loadSyncConfig(storage)
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
    if (!remote.ok) {
      fail(remote.error)
      return
    }

    const syncState = loadSyncState(storage)
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
      succeed()
      return
    }
    if (action === 'push') {
      await doPush(config, remote.exists ? remote.sha : null)
      return
    }

    const parsed = parseImport(remote.text)
    if (!parsed.ok) {
      fail(parsed.error === 'newer-version' ? 'newer-version' : 'remote-invalid')
      return
    }
    if (action === 'adopt') {
      doAdopt(parsed.doc, remote.sha)
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
      await task()
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
    isConfigured: () => Boolean(loadSyncConfig(storage)),
    getConfig: () => loadSyncConfig(storage),

    syncNow: () => run(cycle),

    /** Debounced push after a local mutation. */
    schedulePush: () => {
      if (!loadSyncConfig(storage)) return
      if (state.status === 'conflict') return // blocked until resolved
      setState({ status: 'pending', errorCode: null })
      clearTimeout(pushTimer)
      pushTimer = setTimeout(() => run(cycle), PUSH_DEBOUNCE_MS)
    },

    /** Validate + store the config, then run the first sync. */
    configure: (config) => {
      if (!isValidRepo(config.repo)) return false
      saveSyncConfig(storage, {
        repo: config.repo,
        token: config.token,
        path: config.path || 'radar.json',
      })
      // Fresh pairing: forget any previous device state.
      saveSyncState(storage, {
        lastSyncedSha: null,
        lastSyncedRevision: null,
        lastSyncAt: null,
      })
      run(cycle)
      return true
    },

    /** Stop syncing; local data stays untouched. */
    disable: () => {
      clearTimeout(pushTimer)
      clearSync(storage)
      setState({ status: 'off', errorCode: null, conflict: null, lastSyncAt: null })
    },

    /** Conflict resolution: force-push this device's data. */
    resolveKeepLocal: () =>
      run(async () => {
        if (!state.conflict) return
        const config = loadSyncConfig(storage)
        if (!config) return
        setState({ status: 'syncing', conflict: null })
        const remote = await api.fetchRemoteFile(config) // fresh sha for CAS
        if (!remote.ok) {
          fail(remote.error)
          return
        }
        await doPush(config, remote.exists ? remote.sha : null)
      }),

    /** Conflict resolution: adopt the remote version (snapshot first). */
    resolveTakeRemote: () =>
      run(async () => {
        if (!state.conflict) return
        const config = loadSyncConfig(storage)
        if (!config) return
        setState({ status: 'syncing', conflict: null })
        const remote = await api.fetchRemoteFile(config) // may have moved again
        if (!remote.ok) {
          fail(remote.error)
          return
        }
        if (!remote.exists) {
          // Nothing remote anymore — push local instead.
          await doPush(config, null)
          return
        }
        const parsed = parseImport(remote.text)
        if (!parsed.ok) {
          fail(parsed.error === 'newer-version' ? 'newer-version' : 'remote-invalid')
          return
        }
        doAdopt(parsed.doc, remote.sha)
      }),
  }
}