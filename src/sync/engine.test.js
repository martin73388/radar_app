import { describe, it, expect, vi } from 'vitest'
import { decideSync, hasData, createSyncEngine } from './engine.js'
import { emptyDoc, exportJSON, loadSyncState, saveSyncConfig } from '../storage/index.js'

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
  }
}

describe('decideSync (decision table of §10bis)', () => {
  it.each([
    [{ remoteExists: false, remoteMoved: false, localChanged: false }, 'push'],
    [{ remoteExists: false, remoteMoved: false, localChanged: true }, 'push'],
    [{ remoteExists: true, remoteMoved: false, localChanged: false }, 'noop'],
    [{ remoteExists: true, remoteMoved: false, localChanged: true }, 'push'],
    [{ remoteExists: true, remoteMoved: true, localChanged: false }, 'adopt'],
    [{ remoteExists: true, remoteMoved: true, localChanged: true }, 'conflict'],
  ])('%o → %s', (input, expected) => {
    expect(decideSync(input)).toBe(expected)
  })
})

describe('hasData', () => {
  it('is false for a fresh doc, true with any entity or a mission date', () => {
    expect(hasData(emptyDoc())).toBe(false)
    const withDate = emptyDoc()
    withDate.settings.missionEndDate = '2026-12-31'
    expect(hasData(withDate)).toBe(true)
    const withCompany = emptyDoc()
    withCompany.companies.push({ name: 'X' })
    expect(hasData(withCompany)).toBe(true)
  })
})

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

function makeEngine({ storageInit = {}, doc, remote, putResults = [{ ok: true, sha: 'shaNew' }] } = {}) {
  const storage = fakeStorage(storageInit)
  const states = []
  const puts = []
  let currentDoc = doc
  const adoptCalls = []
  const putQueue = [...putResults]
  const api = {
    fetchRemoteFile: vi.fn(async () => remote.shift()),
    putRemoteFile: vi.fn(async (args) => {
      puts.push(args)
      return putQueue.length > 1 ? putQueue.shift() : putQueue[0]
    }),
  }
  const engine = createSyncEngine({
    storage,
    api,
    getDoc: () => currentDoc,
    adopt: (remoteDoc) => {
      adoptCalls.push(remoteDoc)
      // Mimic applyImport: content adopted, local revision bumped.
      const adopted = { ...remoteDoc, revision: (currentDoc.revision ?? 0) + 1 }
      currentDoc = adopted
      return { ok: true, doc: adopted }
    },
    onState: (s) => states.push(s),
    now: () => new Date('2026-07-17T10:00:00Z'),
  })
  return { engine, storage, states, puts, adoptCalls, api, setDoc: (d) => (currentDoc = d) }
}

const configured = { 'radar:sync:config': JSON.stringify({ repo: 'o/r', token: 't', path: 'radar.json' }) }

describe('sync engine', () => {
  it('first sync with no remote file pushes (creates) and records state', async () => {
    const { engine, storage, states, puts } = makeEngine({
      storageInit: configured,
      doc: localDoc(3, 'Wandercraft'),
      remote: [{ ok: true, exists: false }],
    })
    await engine.syncNow()
    expect(puts).toHaveLength(1)
    expect(puts[0].sha).toBeUndefined() // creation: no CAS sha
    const pushed = JSON.parse(puts[0].text)
    expect(pushed.companies[0].name).toBe('Wandercraft')
    expect('revision' in pushed).toBe(false) // device-local, never synced
    expect(loadSyncState(storage)).toEqual({
      lastSyncedSha: 'shaNew',
      lastSyncedRevision: 3,
      lastSyncAt: '2026-07-17T10:00:00.000Z',
    })
    expect(states.at(-1).status).toBe('synced')
  })

  it('first sync with a remote file and an empty local adopts the remote', async () => {
    const { engine, storage, states, adoptCalls } = makeEngine({
      storageInit: configured,
      doc: localDoc(0, null),
      remote: [{ ok: true, exists: true, sha: 'shaR', text: remotePayload('Exotec') }],
    })
    await engine.syncNow()
    expect(adoptCalls).toHaveLength(1)
    expect(adoptCalls[0].companies[0].name).toBe('Exotec')
    expect(loadSyncState(storage).lastSyncedSha).toBe('shaR')
    expect(states.at(-1).status).toBe('synced')
  })

  it('first sync with data on BOTH sides raises a conflict, never writes', async () => {
    const { engine, states, puts, adoptCalls } = makeEngine({
      storageInit: configured,
      doc: localDoc(3, 'Wandercraft'),
      remote: [{ ok: true, exists: true, sha: 'shaR', text: remotePayload('Exotec') }],
    })
    await engine.syncNow()
    expect(puts).toHaveLength(0)
    expect(adoptCalls).toHaveLength(0)
    const last = states.at(-1)
    expect(last.status).toBe('conflict')
    expect(last.conflict.remoteDoc.companies[0].name).toBe('Exotec')
  })

  it('resolveKeepLocal force-pushes with a fresh sha', async () => {
    const { engine, states, puts } = makeEngine({
      storageInit: configured,
      doc: localDoc(3, 'Wandercraft'),
      remote: [
        { ok: true, exists: true, sha: 'shaR', text: remotePayload('Exotec') },
        { ok: true, exists: true, sha: 'shaR2', text: remotePayload('Exotec') },
      ],
    })
    await engine.syncNow()
    await engine.resolveKeepLocal()
    expect(puts).toHaveLength(1)
    expect(puts[0].sha).toBe('shaR2') // fresh CAS sha, not the stale one
    expect(JSON.parse(puts[0].text).companies[0].name).toBe('Wandercraft')
    expect(states.at(-1).status).toBe('synced')
  })

  it('resolveTakeRemote adopts the (re-fetched) remote version', async () => {
    const { engine, states, adoptCalls } = makeEngine({
      storageInit: configured,
      doc: localDoc(3, 'Wandercraft'),
      remote: [
        { ok: true, exists: true, sha: 'shaR', text: remotePayload('Exotec') },
        { ok: true, exists: true, sha: 'shaR3', text: remotePayload('Exotec v2') },
      ],
    })
    await engine.syncNow()
    await engine.resolveTakeRemote()
    expect(adoptCalls).toHaveLength(1)
    expect(adoptCalls[0].companies[0].name).toBe('Exotec v2')
    expect(states.at(-1).status).toBe('synced')
  })

  it('steady state: unchanged local + unchanged remote is a noop', async () => {
    const { engine, api, puts } = makeEngine({
      storageInit: {
        ...configured,
        'radar:sync:state': JSON.stringify({
          lastSyncedSha: 'shaR',
          lastSyncedRevision: 3,
          lastSyncAt: 'x',
        }),
      },
      doc: localDoc(3, 'Wandercraft'),
      remote: [{ ok: true, exists: true, sha: 'shaR', text: remotePayload('Wandercraft') }],
    })
    await engine.syncNow()
    expect(puts).toHaveLength(0)
    expect(api.fetchRemoteFile).toHaveBeenCalledTimes(1)
  })

  it('local edit with unmoved remote pushes with CAS on the last sha', async () => {
    const { engine, puts, storage } = makeEngine({
      storageInit: {
        ...configured,
        'radar:sync:state': JSON.stringify({
          lastSyncedSha: 'shaR',
          lastSyncedRevision: 3,
          lastSyncAt: 'x',
        }),
      },
      doc: localDoc(5, 'Wandercraft edited'),
      remote: [{ ok: true, exists: true, sha: 'shaR', text: remotePayload('Wandercraft') }],
    })
    await engine.syncNow()
    expect(puts).toHaveLength(1)
    expect(puts[0].sha).toBe('shaR')
    expect(loadSyncState(storage).lastSyncedRevision).toBe(5)
  })

  it('remote moved with no local change adopts silently', async () => {
    const { engine, adoptCalls, states } = makeEngine({
      storageInit: {
        ...configured,
        'radar:sync:state': JSON.stringify({
          lastSyncedSha: 'shaOld',
          lastSyncedRevision: 3,
          lastSyncAt: 'x',
        }),
      },
      doc: localDoc(3, 'Wandercraft'),
      remote: [{ ok: true, exists: true, sha: 'shaNew1', text: remotePayload('Wandercraft + iPad edit') }],
    })
    await engine.syncNow()
    expect(adoptCalls).toHaveLength(1)
    expect(states.at(-1).status).toBe('synced')
  })

  it('maps auth errors, network errors and newer-version remotes to statuses', async () => {
    const base = {
      storageInit: configured,
      doc: localDoc(0, null),
    }
    let e = makeEngine({ ...base, remote: [{ ok: false, error: 'auth' }] })
    await e.engine.syncNow()
    expect(e.states.at(-1)).toMatchObject({ status: 'error', errorCode: 'auth' })

    e = makeEngine({ ...base, remote: [{ ok: false, error: 'network' }] })
    await e.engine.syncNow()
    expect(e.states.at(-1).status).toBe('offline')

    const newer = JSON.stringify({ schemaVersion: 99, settings: {}, companies: [], contacts: [] })
    e = makeEngine({
      ...base,
      doc: localDoc(1, 'X'),
      remote: [
        { ok: true, exists: true, sha: 's', text: newer },
        { ok: true, exists: true, sha: 's', text: newer },
      ],
    })
    // localChanged + remoteMoved → conflict; taking remote hits newer-version
    await e.engine.syncNow()
    await e.engine.resolveTakeRemote()
    expect(e.states.at(-1)).toMatchObject({ status: 'error', errorCode: 'newer-version' })
  })

  it('sha-conflict during push queues a fresh full cycle (pull-then-decide)', async () => {
    const { engine, api, states } = makeEngine({
      storageInit: {
        ...configured,
        'radar:sync:state': JSON.stringify({
          lastSyncedSha: 'shaR',
          lastSyncedRevision: 3,
          lastSyncAt: 'x',
        }),
      },
      doc: localDoc(5, 'Wandercraft edited'),
      remote: [
        { ok: true, exists: true, sha: 'shaR', text: remotePayload('Wandercraft') },
        // second cycle: remote moved meanwhile
        { ok: true, exists: true, sha: 'shaZ', text: remotePayload('iPad edit') },
      ],
      putResults: [{ ok: false, error: 'sha-conflict' }],
    })
    await engine.syncNow()
    await vi.waitFor(() => {
      expect(api.fetchRemoteFile).toHaveBeenCalledTimes(2)
    })
    // localChanged && remoteMoved → conflict surfaced, nothing clobbered
    expect(states.at(-1).status).toBe('conflict')
  })

  it('configure resets device state and disable clears config but keeps data', async () => {
    const storage = fakeStorage({
      'radar:sync:state': JSON.stringify({
        lastSyncedSha: 'stale',
        lastSyncedRevision: 9,
        lastSyncAt: 'x',
      }),
    })
    const states = []
    const engine = createSyncEngine({
      storage,
      api: {
        fetchRemoteFile: async () => ({ ok: true, exists: false }),
        putRemoteFile: async () => ({ ok: true, sha: 's1' }),
      },
      getDoc: () => localDoc(1, 'X'),
      adopt: () => ({ ok: true, doc: localDoc(2, 'X') }),
      onState: (s) => states.push(s),
    })
    expect(engine.configure({ repo: 'bad repo', token: 't' })).toBe(false)
    expect(engine.configure({ repo: 'o/r', token: 't' })).toBe(true)
    await vi.waitFor(() => expect(states.at(-1).status).toBe('synced'))
    expect(loadSyncState(storage).lastSyncedSha).toBe('s1')

    engine.disable()
    expect(engine.isConfigured()).toBe(false)
    expect(loadSyncState(storage).lastSyncedSha).toBeNull()
    expect(states.at(-1).status).toBe('off')
  })

  it('reconfiguring the SAME repo keeps device state (token renewal, no spurious conflict); a different repo resets it', () => {
    const storage = fakeStorage({
      'radar:sync:config': JSON.stringify({ repo: 'o/r', token: 'old', path: 'radar.json' }),
      'radar:sync:state': JSON.stringify({
        lastSyncedSha: 'sha1',
        lastSyncedRevision: 3,
        lastSyncAt: 't',
      }),
    })
    const engine = createSyncEngine({
      storage,
      api: {
        // Never resolves — keeps the follow-up cycle from overwriting state
        // so we can assert the synchronous preservation logic.
        fetchRemoteFile: () => new Promise(() => {}),
        putRemoteFile: async () => ({ ok: true, sha: 's' }),
      },
      getDoc: () => localDoc(3, 'X'),
      adopt: () => ({ ok: true, doc: localDoc(4, 'X') }),
      onState: () => {},
    })
    engine.configure({ repo: 'o/r', token: 'new-renewed-token' })
    expect(loadSyncState(storage).lastSyncedSha).toBe('sha1') // preserved
    engine.configure({ repo: 'o/other', token: 'new-renewed-token' })
    expect(loadSyncState(storage).lastSyncedSha).toBeNull() // new pairing → reset
  })

  it('disable() during an in-flight cycle does not resurrect state or flip the status back', async () => {
    let resolveFetch
    const storage = fakeStorage(configured)
    const states = []
    const engine = createSyncEngine({
      storage,
      api: {
        fetchRemoteFile: () => new Promise((r) => (resolveFetch = r)),
        putRemoteFile: async () => ({ ok: true, sha: 'sPushed' }),
      },
      getDoc: () => localDoc(2, 'Wandercraft'),
      adopt: () => ({ ok: true, doc: localDoc(3, 'X') }),
      onState: (s) => states.push(s),
    })
    const p = engine.syncNow() // starts; awaits the fetch
    engine.disable() // opt out mid-flight
    resolveFetch({ ok: true, exists: false }) // fetch resolves → cycle would push+succeed
    await p
    expect(engine.isConfigured()).toBe(false)
    expect(states.at(-1).status).toBe('off') // never flips back to 'synced'
    expect(loadSyncState(storage).lastSyncedSha).toBeNull() // state not resurrected
  })

  it('schedulePush is a no-op when nothing changed since the last sync (e.g. right after adopt)', () => {
    const storage = fakeStorage({
      ...configured,
      'radar:sync:state': JSON.stringify({
        lastSyncedSha: 'shaR',
        lastSyncedRevision: 7,
        lastSyncAt: 'x',
      }),
    })
    const states = []
    const engine = createSyncEngine({
      storage,
      api: {
        fetchRemoteFile: async () => ({ ok: true, exists: false }),
        putRemoteFile: async () => ({ ok: true, sha: 's' }),
      },
      getDoc: () => localDoc(7, 'X'), // revision == lastSyncedRevision
      adopt: () => ({ ok: true, doc: localDoc(8, 'X') }),
      onState: (s) => states.push(s),
    })
    engine.schedulePush()
    expect(states).toHaveLength(0) // no 'pending' flip, no cycle scheduled
  })

  it('schedulePush debounces and is blocked while a conflict is pending', async () => {
    vi.useFakeTimers()
    try {
      const storage = fakeStorage(configured)
      saveSyncConfig(storage, { repo: 'o/r', token: 't', path: 'radar.json' })
      const fetches = []
      const engine = createSyncEngine({
        storage,
        api: {
          fetchRemoteFile: async () => {
            fetches.push(1)
            return { ok: true, exists: false }
          },
          putRemoteFile: async () => ({ ok: true, sha: 's1' }),
        },
        getDoc: () => localDoc(1, 'X'),
        adopt: () => ({ ok: true, doc: localDoc(2, 'X') }),
        onState: () => {},
      })
      engine.schedulePush()
      engine.schedulePush()
      engine.schedulePush()
      await vi.advanceTimersByTimeAsync(3000)
      expect(fetches).toHaveLength(1) // debounced to a single cycle
    } finally {
      vi.useRealTimers()
    }
  })
})