import { describe, it, expect, beforeEach } from 'vitest'
import { createEngine } from './engine.js'
import { mergeStates, canonicalize, serialize, isRadarFile } from './merge.js'
import { ConflictError, AuthError } from './errors.js'

// ---- Radar fixtures (valid for parseImport: schemaVersion + shapes) ----
const T = (n) => new Date(1750000000000 + n * 1000).toISOString()

function company(id, u, extra = {}) {
  return {
    id,
    name: id,
    sector: '',
    city: '',
    notes: '',
    type: 'freelance',
    status: 'to_contact',
    priority: false,
    links: [],
    history: [],
    createdAt: T(0),
    updatedAt: T(u),
    ...extra,
  }
}

function doc({ companies = [], contacts = [], deleted = [], settings, activityLog = [] } = {}) {
  return {
    schemaVersion: 1,
    settings: settings ?? { missionEndDate: null, lastExportAt: null },
    companies,
    contacts,
    activityLog,
    deleted,
  }
}

function fakeStore(initial) {
  let s = canonicalize(initial || doc())
  const calls = { replaces: 0 }
  return {
    calls,
    getSnapshot: () => s,
    replaceState: (next) => {
      calls.replaces++
      s = canonicalize(next)
      return { ok: true, doc: s }
    },
  }
}

function failingStore(initial, error = 'conflict') {
  let s = canonicalize(initial || doc())
  return {
    getSnapshot: () => s,
    replaceState: () => ({ ok: false, error }),
  }
}

// Configurable fake remote with a compare-and-swap "server".
function fakeRemote(opts = {}) {
  let content = opts.content ? JSON.parse(JSON.stringify(opts.content)) : null
  // canonicalRaw: serve raw text exactly as serialize() would write it.
  const rawOf = (c) => (opts.canonicalRaw ? serialize(c) : JSON.stringify(c))
  let version = content ? 'v1' : null
  let counter = content ? 1 : 0
  const style = opts.style || 'github'
  let injectConflict = opts.injectConflict || null
  const calls = { reads: 0, writes: 0 }
  const conflict = (withContent) =>
    style === 'drive'
      ? new ConflictError('conflict', { version, content: withContent ? JSON.parse(JSON.stringify(content)) : null })
      : new ConflictError('conflict', { version: null, content: null })
  return {
    calls,
    peek: () => content,
    isConfigured: () => opts.configured !== false,
    async read() {
      calls.reads++
      if (content == null) return { exists: false, version: null, content: null, raw: null }
      return { exists: true, version, content: JSON.parse(JSON.stringify(content)), raw: rawOf(content) }
    },
    async write(cfg, text, base) {
      calls.writes++
      if (injectConflict && version != null) {
        content = injectConflict(content) // a competing device wrote first
        counter++
        version = 'v' + counter
        injectConflict = null
        throw conflict(true)
      }
      if (version != null && base !== version) throw conflict(true)
      content = JSON.parse(text)
      counter++
      version = 'v' + counter
      return { version }
    },
  }
}

function engineWith(store, github, drive, onStatus = () => {}) {
  return createEngine({
    store,
    github,
    drive,
    getGithubConfig: () => ({}),
    getDriveConfig: () => ({}),
    onStatus,
  })
}

beforeEach(() => {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  }
})

describe('dual-remote push', () => {
  it('pushes local state to BOTH remotes and both end identical', async () => {
    const store = fakeStore(doc({ companies: [company('c1', 5)] }))
    const gh = fakeRemote()
    const dr = fakeRemote()
    await engineWith(store, gh, dr).sync('test')

    expect(gh.calls.writes).toBeGreaterThanOrEqual(1)
    expect(dr.calls.writes).toBeGreaterThanOrEqual(1)
    expect(isRadarFile(gh.peek())).toBe(true)
    expect(serialize(gh.peek())).toBe(serialize(store.getSnapshot()))
    expect(serialize(dr.peek())).toBe(serialize(store.getSnapshot()))
  })

  it('pulls newer remote data, merges, and pushes the union back', async () => {
    const store = fakeStore(doc({ companies: [company('local', 5)] }))
    const gh = fakeRemote({ content: doc({ companies: [company('remote', 9)] }) })
    const dr = fakeRemote()
    await engineWith(store, gh, dr).sync('test')

    const local = store.getSnapshot()
    expect(local.companies.map((c) => c.id).sort()).toEqual(['local', 'remote'])
    expect(serialize(gh.peek())).toBe(serialize(local))
    expect(serialize(dr.peek())).toBe(serialize(local))
  })

  it('skips the write when the remote already holds identical bytes', async () => {
    const state = doc({ companies: [company('c1', 5)] })
    const store = fakeStore(state)
    const gh = fakeRemote({ content: canonicalize(state), canonicalRaw: true })
    let status
    await engineWith(store, gh, fakeRemote({ configured: false }), (s) => (status = s)).sync('test')
    expect(gh.calls.writes).toBe(0) // byte-identical -> no commit churn
    expect(status.github.state).toBe('ok')
  })
})

describe('compare-and-swap conflict handling (fix e)', () => {
  it('drive conflict (carries content): re-merges from payload and retries', async () => {
    const store = fakeStore(doc({ companies: [company('mine', 5)] }))
    const dr = fakeRemote({
      style: 'drive',
      content: doc({ companies: [company('base', 1)] }),
      injectConflict: (c) => mergeStates(c, doc({ companies: [company('other', 20)] })),
    })
    await engineWith(store, fakeRemote({ configured: false }), dr).sync('test')

    const ids = dr.peek().companies.map((c) => c.id).sort()
    expect(ids).toEqual(['base', 'mine', 'other']) // no lost update
    expect(dr.calls.writes).toBe(2) // first conflicted, second succeeded
  })

  it('github conflict (no content): re-pulls, merges, retries', async () => {
    const store = fakeStore(doc({ companies: [company('mine', 5)] }))
    const gh = fakeRemote({
      style: 'github',
      content: doc({ companies: [company('base', 1)] }),
      injectConflict: (c) => mergeStates(c, doc({ companies: [company('other', 20)] })),
    })
    await engineWith(store, gh, fakeRemote({ configured: false })).sync('test')

    const ids = gh.peek().companies.map((c) => c.id).sort()
    expect(ids).toEqual(['base', 'mine', 'other'])
    expect(gh.calls.reads).toBeGreaterThanOrEqual(2) // initial pull + conflict re-read
  })

  it('gives up after bounded retries and reports a conflict state', async () => {
    const store = fakeStore(doc({ companies: [company('mine', 5)] }))
    // A remote that ALWAYS conflicts (its version moves on every write attempt).
    let v = 1
    const gh = {
      isConfigured: () => true,
      async read() {
        return { exists: true, version: 'v' + v, content: doc(), raw: JSON.stringify(doc()) }
      },
      async write() {
        v++
        throw new ConflictError('conflict', { version: null, content: null })
      },
    }
    let status
    await engineWith(store, gh, fakeRemote({ configured: false }), (s) => (status = s)).sync('test')
    expect(status.github.state).toBe('conflict')
    expect(v).toBeLessThanOrEqual(7) // bounded (MAX_CONFLICT_RETRIES + 1 attempts)
  })
})

describe('foreign-file guard (fix a — Radar side: never clobber cockpit-data.json)', () => {
  it('never overwrites a remote that is not a Radar file', async () => {
    const foreign = { app: 'cockpit', version: 1, todos: [{ id: 't1', title: 'x' }], habits: [], deleted: [] }
    const store = fakeStore(doc({ companies: [company('c1', 5)] }))
    const gh = fakeRemote({ content: foreign })
    let status
    await engineWith(store, gh, fakeRemote({ configured: false }), (s) => (status = s)).sync('test')

    expect(gh.calls.writes).toBe(0)
    expect(gh.peek()).toEqual(foreign) // untouched
    expect(status.github.state).toBe('blocked')
  })

  it('does NOT overwrite a remote whose conflict payload is a foreign file', async () => {
    // Drive conflict carries the competing content; if that content is foreign
    // we must abort the write, not clobber it (the conflict-resume path guard).
    const store = fakeStore(doc({ companies: [company('mine', 5)] }))
    const dr = fakeRemote({
      style: 'drive',
      content: doc({ companies: [company('base', 1)] }),
      injectConflict: () => ({ app: 'cockpit', todos: [], habits: [] }), // competing writer put a foreign file
    })
    let status
    await engineWith(store, fakeRemote({ configured: false }), dr, (s) => (status = s)).sync('test')
    expect(dr.peek()).toEqual({ app: 'cockpit', todos: [], habits: [] }) // untouched
    expect(dr.calls.writes).toBe(1) // only the attempt that conflicted; no overwrite
    expect(status.drive.state).toBe('blocked')
  })

  it('blocks even when the gateway returns already-parsed (raw null) content', async () => {
    const foreign = { app: 'carnet', projects: [{ id: 'p1' }] }
    let writes = 0
    const drive = {
      isConfigured: () => true,
      async read() {
        return { exists: true, version: 'v1', content: foreign, raw: null } // parsed, no raw text
      },
      async write() {
        writes++
        return { version: 'v2' }
      },
    }
    const store = fakeStore(doc({ companies: [company('c1', 5)] }))
    let status
    await engineWith(store, fakeRemote({ configured: false }), drive, (s) => (status = s)).sync('test')
    expect(writes).toBe(0)
    expect(status.drive.state).toBe('blocked')
  })

  it('blocks a radar-shaped file that fails the import gate (no schemaVersion)', async () => {
    const almostRadar = { companies: [{ id: 'c1', name: 'ACME' }], contacts: [] }
    const store = fakeStore(doc({ companies: [company('mine', 5)] }))
    const gh = fakeRemote({ content: almostRadar })
    let status
    await engineWith(store, gh, fakeRemote({ configured: false }), (s) => (status = s)).sync('test')
    expect(gh.calls.writes).toBe(0)
    expect(gh.peek()).toEqual(almostRadar)
    expect(status.github.state).toBe('blocked')
  })
})

describe('schema-version guard (fix b)', () => {
  it('blocks a newer-schema payload arriving via a Drive CONFLICT (retry path)', async () => {
    const v99 = { ...doc({ companies: [company('future', 9)] }), schemaVersion: 99 }
    const store = fakeStore(doc({ companies: [company('mine', 5)] }))
    const dr = fakeRemote({
      style: 'drive',
      content: doc({ companies: [company('base', 1)] }),
      injectConflict: () => v99, // competing writer upgraded the file mid-push
    })
    let status
    await engineWith(store, fakeRemote({ configured: false }), dr, (s) => (status = s)).sync('test')
    expect(dr.peek().schemaVersion).toBe(99) // untouched — never overwritten
    expect(dr.calls.writes).toBe(1) // only the attempt that conflicted
    expect(status.drive.state).toBe('blocked')
    // The valid pre-conflict content ('base') merged on the initial pull;
    // the v99 payload itself never did.
    expect(store.getSnapshot().companies.map((c) => c.id).sort()).toEqual(['base', 'mine'])
    expect(store.getSnapshot().companies.some((c) => c.id === 'future')).toBe(false)
  })

  it('never merges nor overwrites a newer-schema remote', async () => {
    const v2 = { ...doc({ companies: [company('future', 9)] }), schemaVersion: 99 }
    const store = fakeStore(doc({ companies: [company('mine', 5)] }))
    const gh = fakeRemote({ content: v2 })
    let status
    await engineWith(store, gh, fakeRemote({ configured: false }), (s) => (status = s)).sync('test')
    expect(gh.calls.writes).toBe(0)
    expect(gh.peek().schemaVersion).toBe(99) // untouched
    expect(store.getSnapshot().companies.map((c) => c.id)).toEqual(['mine']) // v99 data not pulled in
    expect(status.github.state).toBe('blocked')
    expect(status.github.message).toContain('plus récente')
  })
})

describe('local write safety', () => {
  it('a local revision conflict aborts the remote push (nothing laundered)', async () => {
    const store = failingStore(doc(), 'conflict')
    const gh = fakeRemote({ content: doc({ companies: [company('remote', 9)] }) })
    let status
    await engineWith(store, gh, fakeRemote({ configured: false }), (s) => (status = s)).sync('test')
    expect(gh.calls.writes).toBe(0) // merge could not land locally -> no push
    expect(status.github.state).toBe('offline') // transient, retried next cycle
  })
})

describe('auth classification', () => {
  it('an AuthError surfaces as the auth state', async () => {
    const gh = {
      isConfigured: () => true,
      async read() {
        throw new AuthError('GitHub : jeton refusé ou droits insuffisants.')
      },
      async write() {},
    }
    let status
    await engineWith(fakeStore(doc()), gh, fakeRemote({ configured: false }), (s) => (status = s)).sync('test')
    expect(status.github.state).toBe('auth')
  })
})

describe('offline', () => {
  it('does no network when offline and reports offline status', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const store = fakeStore(doc({ companies: [company('c1', 5)] }))
    const gh = fakeRemote()
    const dr = fakeRemote()
    let status
    await engineWith(store, gh, dr, (s) => (status = s)).sync('test')

    expect(gh.calls.reads + gh.calls.writes).toBe(0)
    expect(dr.calls.reads + dr.calls.writes).toBe(0)
    expect(status.github.state).toBe('offline')
    expect(status.drive.state).toBe('offline')
  })
})

describe('disabled remotes', () => {
  it('reports disabled and touches nothing when no remote is configured', async () => {
    const gh = fakeRemote({ configured: false })
    const dr = fakeRemote({ configured: false })
    let status
    await engineWith(fakeStore(doc()), gh, dr, (s) => (status = s)).sync('test')
    expect(gh.calls.reads + gh.calls.writes).toBe(0)
    expect(dr.calls.reads + dr.calls.writes).toBe(0)
    expect(status.github.state).toBe('disabled')
    expect(status.drive.state).toBe('disabled')
  })
})
