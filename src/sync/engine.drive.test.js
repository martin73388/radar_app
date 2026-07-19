import { describe, it, expect, vi } from 'vitest'
import { createSyncEngine, createSyncLock } from './engine.js'
import { isValidDriveConfig } from './drive.js'
import {
  emptyDoc,
  loadDriveSyncConfig,
  saveDriveSyncConfig,
  loadDriveSyncState,
  saveDriveSyncState,
  clearDriveSync,
} from '../storage/index.js'

function fakeStorage(init = {}) {
  const map = new Map(Object.entries(init))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
    _raw: (k) => (map.has(k) ? map.get(k) : null),
  }
}

function localDoc(revision, name) {
  const doc = emptyDoc()
  doc.revision = revision
  if (name) {
    doc.companies.push({
      id: 'cmp_1',
      name,
      sector: '',
      city: '',
      notes: '',
      type: 'freelance',
      status: 'to_contact',
      priority: false,
      createdAt: null,
      updatedAt: null,
    })
  }
  return doc
}

function remotePayload(name) {
  const { revision: _r, ...payload } = localDoc(0, name)
  return JSON.stringify(payload)
}

// The Drive-adapter wiring exactly as App.jsx instantiates the second engine.
function driveEngine({ storage, api, getDoc, adopt, onState, lock, now }) {
  return createSyncEngine({
    storage,
    api,
    getDoc,
    adopt,
    onState,
    lock,
    now,
    loadConfig: loadDriveSyncConfig,
    saveConfig: saveDriveSyncConfig,
    clearConfig: clearDriveSync,
    loadState: loadDriveSyncState,
    saveState: saveDriveSyncState,
    isValidConfig: isValidDriveConfig,
    normalizeConfig: (c) => ({
      url: c.url.trim(),
      secret: c.secret.trim(),
      path: c.path || 'radar.json',
    }),
    sameTarget: (a, b) => a.url === b.url,
  })
}

const driveConfigured = {
  'radar:sync:drive:config': JSON.stringify({
    url: 'https://script.google.com/macros/s/AK/exec',
    secret: 's',
    path: 'radar.json',
  }),
}

describe('engine driven by the Drive adapter', () => {
  it('persists the CAS token under radar:sync:drive:state as lastSyncedVersion', async () => {
    const storage = fakeStorage(driveConfigured)
    const states = []
    const engine = driveEngine({
      storage,
      api: {
        fetchRemoteFile: async () => ({ ok: true, exists: false }),
        putRemoteFile: async () => ({ ok: true, sha: 'v-drive-1' }),
      },
      getDoc: () => localDoc(4, 'Wandercraft'),
      adopt: () => ({ ok: true, doc: localDoc(5, 'X') }),
      onState: (s) => states.push(s),
      now: () => new Date('2026-07-19T09:00:00Z'),
    })
    await engine.syncNow()
    expect(states.at(-1).status).toBe('synced')
    // Uniform engine field maps back to the Drive-specific storage key.
    expect(loadDriveSyncState(storage).lastSyncedSha).toBe('v-drive-1')
    const rawState = JSON.parse(storage._raw('radar:sync:drive:state'))
    expect(rawState.lastSyncedVersion).toBe('v-drive-1') // NOT lastSyncedSha
    expect(rawState.lastSyncedRevision).toBe(4)
    // The Drive keys are separate — the GitHub keys are never touched.
    expect(storage._raw('radar:sync:config')).toBeNull()
    expect(storage._raw('radar:sync:state')).toBeNull()
  })

  it('adopts a remote Drive file into the empty local, keyed by version', async () => {
    const storage = fakeStorage(driveConfigured)
    const adopts = []
    const engine = driveEngine({
      storage,
      api: {
        fetchRemoteFile: async () => ({
          ok: true,
          exists: true,
          sha: 'v-remote',
          text: remotePayload('Exotec'),
        }),
        putRemoteFile: async () => ({ ok: true, sha: 'unused' }),
      },
      getDoc: () => localDoc(0, null),
      adopt: (d) => {
        adopts.push(d)
        return { ok: true, doc: localDoc(1, 'Exotec') }
      },
      onState: () => {},
      now: () => new Date('2026-07-19T09:00:00Z'),
    })
    await engine.syncNow()
    expect(adopts).toHaveLength(1)
    expect(adopts[0].companies[0].name).toBe('Exotec')
    expect(loadDriveSyncState(storage).lastSyncedSha).toBe('v-remote')
  })

  it('configure() validates the Drive shape and stores config under the Drive key', () => {
    const storage = fakeStorage()
    const engine = driveEngine({
      storage,
      api: { fetchRemoteFile: () => new Promise(() => {}), putRemoteFile: async () => ({}) },
      getDoc: () => localDoc(1, 'X'),
      adopt: () => ({ ok: true, doc: localDoc(2, 'X') }),
      onState: () => {},
    })
    expect(engine.configure({ url: 'http://not-https', secret: 's' })).toBe(false)
    expect(engine.configure({ url: 'https://ok.test/exec', secret: '' })).toBe(false)
    expect(engine.configure({ url: '  https://ok.test/exec  ', secret: '  s3  ' })).toBe(true)
    expect(loadDriveSyncConfig(storage)).toEqual({
      url: 'https://ok.test/exec',
      secret: 's3',
      path: 'radar.json',
    })
  })
})

describe('createSyncLock', () => {
  it('runs submitted tasks strictly one at a time (no interleave)', async () => {
    const lock = createSyncLock()
    const trace = []
    let active = 0
    const task = (label) => async () => {
      active++
      expect(active).toBe(1) // never two at once
      trace.push(`${label}:start`)
      await Promise.resolve()
      await Promise.resolve()
      trace.push(`${label}:end`)
      active--
    }
    // Submit B before A finishes; the lock must serialize them in FIFO order.
    const pA = lock(task('A'))
    const pB = lock(task('B'))
    await Promise.all([pA, pB])
    expect(trace).toEqual(['A:start', 'A:end', 'B:start', 'B:end'])
  })

  it('a rejecting task does not wedge the lock for the next one', async () => {
    const lock = createSyncLock()
    const trace = []
    await lock(async () => {
      trace.push('one')
      throw new Error('boom')
    }).catch(() => trace.push('caught'))
    await lock(async () => {
      trace.push('two')
    })
    expect(trace).toEqual(['one', 'caught', 'two'])
  })

  it('two engines sharing one lock never overlap their cycles (no adoption race)', async () => {
    const lock = createSyncLock()
    let inFlight = 0
    let maxConcurrent = 0
    const makeApi = () => ({
      fetchRemoteFile: async () => {
        inFlight++
        maxConcurrent = Math.max(maxConcurrent, inFlight)
        await Promise.resolve()
        await Promise.resolve()
        inFlight--
        return { ok: true, exists: false }
      },
      putRemoteFile: async () => ({ ok: true, sha: 's' }),
    })
    const mk = (storageInit, accessorsWrapper) =>
      accessorsWrapper({
        storage: fakeStorage(storageInit),
        api: makeApi(),
        getDoc: () => localDoc(1, 'X'),
        adopt: () => ({ ok: true, doc: localDoc(2, 'X') }),
        onState: () => {},
        lock,
      })
    const gh = createSyncEngine({
      storage: fakeStorage({
        'radar:sync:config': JSON.stringify({ repo: 'o/r', token: 't', path: 'radar.json' }),
      }),
      api: makeApi(),
      getDoc: () => localDoc(1, 'X'),
      adopt: () => ({ ok: true, doc: localDoc(2, 'X') }),
      onState: () => {},
      lock,
    })
    const drive = mk(driveConfigured, driveEngine)
    await Promise.all([gh.syncNow(), drive.syncNow()])
    expect(maxConcurrent).toBe(1) // cycles never ran concurrently
  })
})
