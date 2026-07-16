import { describe, it, expect } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  DATA_KEY,
  emptyDoc,
  makeId,
  looksLikeDoc,
  validateDoc,
  hasDuplicateIds,
  migrateDoc,
  load,
  exportJSON,
  parseImport,
  createStore,
} from './index.js'

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
    _map: map,
  }
}

function docWithData() {
  const doc = emptyDoc()
  doc.settings.missionEndDate = '2026-12-31'
  doc.companies.push({
    id: makeId('cmp'),
    name: 'Wandercraft',
    sector: 'Exosquelettes',
    city: 'Paris',
    notes: 'recontacter après l’été',
    type: 'freelance',
    status: 'in_discussion',
    priority: true,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-10T10:00:00.000Z',
  })
  doc.contacts.push({
    id: makeId('cnt'),
    name: 'Jane Doe',
    companyId: doc.companies[0].id,
    companyName: '',
    role: 'CTO',
    notes: 'très réactive',
    lastContact: '2026-07-10',
    nextFollowUp: '2026-07-17',
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-10T10:00:00.000Z',
  })
  return doc
}

describe('load', () => {
  it('returns a fresh empty document when the key is missing', () => {
    const s = fakeStorage()
    const r = load(s)
    expect(r.status).toBe('fresh')
    expect(r.doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(r.doc.settings.missionEndDate).toBeNull() // no invented data
    expect(r.doc.companies).toEqual([])
    expect(r.doc.contacts).toEqual([])
  })

  it('round-trips a saved document', () => {
    const s = fakeStorage()
    const store = createStore(s)
    const saved = store.save(docWithData())
    expect(saved.ok).toBe(true)
    const r = load(s)
    expect(r.status).toBe('ok')
    expect(r.doc.companies[0].name).toBe('Wandercraft')
    expect(r.doc.contacts[0].nextFollowUp).toBe('2026-07-17')
  })

  it('quarantines unparseable JSON without destroying it', () => {
    const s = fakeStorage({ [DATA_KEY]: '{broken' })
    const r = load(s)
    expect(r.status).toBe('recovered-corrupt')
    expect(r.backupKey).toMatch(/^radar:data:corrupt:/)
    expect(s.getItem(r.backupKey)).toBe('{broken')
    expect(r.doc.companies).toEqual([])
  })

  it('quarantines parseable JSON that fails shape validation', () => {
    const bad = JSON.stringify({ schemaVersion: 1, companies: 'nope', contacts: [] })
    const s = fakeStorage({ [DATA_KEY]: bad })
    const r = load(s)
    expect(r.status).toBe('recovered-corrupt')
    expect(s.getItem(r.backupKey)).toBe(bad)
  })

  it('quarantines a current-version doc with invalid entry data', () => {
    const bad = JSON.stringify({
      schemaVersion: 1,
      revision: 0,
      settings: { missionEndDate: 'demain', lastExportAt: null },
      companies: [],
      contacts: [],
    })
    const s = fakeStorage({ [DATA_KEY]: bad })
    expect(load(s).status).toBe('recovered-corrupt')
  })

  it('keeps only the most recent corrupt backup (retention 1)', () => {
    const s = fakeStorage({
      'radar:data:corrupt:1': 'old-junk',
      [DATA_KEY]: '{broken',
    })
    const r = load(s)
    expect(s.getItem('radar:data:corrupt:1')).toBeNull()
    expect(s.getItem(r.backupKey)).toBe('{broken')
  })

  it('enters read-only mode on a newer schemaVersion and never writes', () => {
    const newer = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      revision: 42,
      settings: {},
      companies: [],
      contacts: [],
    })
    const s = fakeStorage({ [DATA_KEY]: newer })
    const r = load(s)
    expect(r.status).toBe('newer-version')
    const store = createStore(s)
    expect(store.readOnly).toBe(true)
    expect(store.save(emptyDoc())).toEqual({ ok: false, error: 'read-only' })
    expect(s.getItem(DATA_KEY)).toBe(newer) // untouched
  })

  it('quarantines an older version it has no migration for', () => {
    const v0 = JSON.stringify({ schemaVersion: 0, companies: [], contacts: [] })
    const s = fakeStorage({ [DATA_KEY]: v0 })
    const r = load(s)
    expect(r.status).toBe('recovered-corrupt')
    expect(s.getItem(r.backupKey)).toBe(v0)
  })
})

describe('migrations', () => {
  const fakeMigrations = {
    0: (d) => ({
      ...d,
      schemaVersion: 1,
      settings: { missionEndDate: null, lastExportAt: null },
    }),
  }

  it('runs the ordered chain up to the current version', () => {
    const migrated = migrateDoc(
      { schemaVersion: 0, companies: [], contacts: [] },
      fakeMigrations,
    )
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('throws when a step is missing', () => {
    expect(() =>
      migrateDoc({ schemaVersion: 0, companies: [], contacts: [] }, {}),
    ).toThrow()
  })

  it('backs up the pre-migration payload, then persists the migrated doc', () => {
    const v0 = JSON.stringify({ schemaVersion: 0, companies: [], contacts: [] })
    const s = fakeStorage({ [DATA_KEY]: v0 })
    const r = load(s, { migrations: fakeMigrations })
    expect(r.status).toBe('ok')
    expect(s.getItem('radar:data:backup:v0')).toBe(v0) // untouched copy
    const persisted = JSON.parse(s.getItem(DATA_KEY))
    expect(persisted.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    // Revision bumped so old-code tabs fail the guard instead of clobbering.
    expect(persisted.revision).toBe(1)
  })
})

describe('unknown-field preservation (forward compatibility)', () => {
  it('keeps unknown fields through load()', () => {
    const doc = docWithData()
    doc.companies[0].linkedinUrl = 'https://linkedin.com/company/wandercraft'
    doc.contacts[0].phone = '+33 6 12 34 56 78'
    doc.settings.theme = 'dark'
    doc.futureTopLevel = { a: 1 }
    const s = fakeStorage({ [DATA_KEY]: JSON.stringify(doc) })
    const r = load(s)
    expect(r.status).toBe('ok')
    expect(r.doc.companies[0].linkedinUrl).toBe(
      'https://linkedin.com/company/wandercraft',
    )
    expect(r.doc.contacts[0].phone).toBe('+33 6 12 34 56 78')
    expect(r.doc.settings.theme).toBe('dark')
    expect(r.doc.futureTopLevel).toEqual({ a: 1 })
  })

  it('keeps unknown fields through export → import, minus the exportedAt stamp', () => {
    const doc = docWithData()
    doc.companies[0].linkedinUrl = 'https://example.com'
    const r = parseImport(exportJSON(doc))
    expect(r.ok).toBe(true)
    expect(r.doc.companies[0].linkedinUrl).toBe('https://example.com')
    expect('exportedAt' in r.doc).toBe(false) // stamp stripped, round trip symmetric
  })
})

describe('newer-version protection mid-session', () => {
  it('save refuses and latches read-only when a newer schema was stored meanwhile', () => {
    const s = fakeStorage()
    const store = createStore(s)
    store.save(docWithData())
    const newer = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      revision: 99,
      settings: {},
      companies: [],
      contacts: [],
    })
    s.setItem(DATA_KEY, newer) // a newer app version wrote (PWA update in another tab)
    expect(store.save(emptyDoc())).toEqual({ ok: false, error: 'newer-version' })
    expect(store.readOnly).toBe(true)
    // Reload must not rebase the guard; every later write stays refused.
    expect(store.reload().status).toBe('newer-version')
    expect(store.save(emptyDoc())).toEqual({ ok: false, error: 'read-only' })
    expect(s.getItem(DATA_KEY)).toBe(newer) // never downgraded
  })
})

describe('undoImport guard', () => {
  it('refuses undo once storage moved past the imported revision', () => {
    const s = fakeStorage()
    const store = createStore(s)
    store.save(docWithData())
    const applied = store.applyImport(parseImport(exportJSON(emptyDoc())).doc)
    expect(applied.ok).toBe(true)
    store.save(docWithData()) // a later write supersedes the import
    expect(store.undoImport(applied.snapshotKey)).toEqual({
      ok: false,
      error: 'conflict',
    })
    // The later write survives.
    expect(JSON.parse(s.getItem(DATA_KEY)).companies).toHaveLength(1)
  })
})

describe('multi-tab revision guard', () => {
  it('increments the revision on every save', () => {
    const s = fakeStorage()
    const store = createStore(s)
    expect(store.save(emptyDoc()).doc.revision).toBe(1)
    expect(store.save(emptyDoc()).doc.revision).toBe(2)
  })

  it('refuses a save based on a stale revision (other-tab write)', () => {
    const s = fakeStorage()
    const tabA = createStore(s)
    tabA.save(docWithData())
    const tabB = createStore(s)
    tabA.save(docWithData()) // A writes again → B is now stale
    const r = tabB.save(emptyDoc())
    expect(r).toEqual({ ok: false, error: 'conflict' })
    // A's data must still be there.
    expect(JSON.parse(s.getItem(DATA_KEY)).companies).toHaveLength(1)
  })

  it('reload() rebases and allows saving again', () => {
    const s = fakeStorage()
    const tabA = createStore(s)
    const tabB = createStore(s)
    tabA.save(docWithData())
    expect(tabB.save(emptyDoc()).error).toBe('conflict')
    const r = tabB.reload()
    expect(r.doc.companies).toHaveLength(1)
    expect(tabB.save(r.doc).ok).toBe(true)
  })

  it('reports write failures instead of throwing', () => {
    const s = fakeStorage()
    const store = createStore(s)
    s.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(store.save(emptyDoc())).toEqual({ ok: false, error: 'write-failed' })
  })
})

describe('export → import round-trip', () => {
  it('re-imports an export identically (data, settings)', () => {
    const doc = docWithData()
    const r = parseImport(exportJSON(doc))
    expect(r.ok).toBe(true)
    expect(r.doc.companies).toEqual(doc.companies)
    expect(r.doc.contacts).toEqual(doc.contacts)
    expect(r.doc.settings.missionEndDate).toBe('2026-12-31')
    expect(r.counts).toEqual({ companies: 1, contacts: 1 })
  })

  it('rejects empty input and non-JSON', () => {
    expect(parseImport('').error).toBe('empty')
    expect(parseImport('   ').error).toBe('empty')
    expect(parseImport('not json at all').error).toBe('not-json')
  })

  it("rejects JSON that isn't a Radar document", () => {
    expect(parseImport('{"foo": 1}').error).toBe('not-radar')
    expect(parseImport('[1,2,3]').error).toBe('not-radar')
  })

  it('rejects a backup from a newer app version', () => {
    const newer = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      companies: [],
      contacts: [],
    })
    expect(parseImport(newer).error).toBe('newer-version')
  })

  it('rejects duplicate ids', () => {
    const doc = docWithData()
    doc.companies.push({ ...doc.companies[0] }) // same id twice
    expect(parseImport(JSON.stringify(doc)).error).toBe('duplicate-ids')
  })

  it('rejects invalid entry shapes without touching anything', () => {
    const doc = docWithData()
    doc.contacts[0].nextFollowUp = 'mardi prochain'
    expect(parseImport(JSON.stringify(doc)).error).toBe('invalid-shape')
  })
})

describe('import snapshot / undo', () => {
  it('snapshots the current data before import and restores it on undo', () => {
    const s = fakeStorage()
    const store = createStore(s)
    store.save(docWithData())

    const imported = parseImport(exportJSON(emptyDoc()))
    const applied = store.applyImport(imported.doc)
    expect(applied.ok).toBe(true)
    expect(applied.snapshotKey).toMatch(/^radar:data:pre-import:/)
    expect(JSON.parse(s.getItem(DATA_KEY)).companies).toHaveLength(0)

    const undone = store.undoImport(applied.snapshotKey)
    expect(undone.ok).toBe(true)
    expect(undone.doc.companies[0].name).toBe('Wandercraft')
    expect(JSON.parse(s.getItem(DATA_KEY)).companies).toHaveLength(1)
  })
})

describe('validation helpers', () => {
  it('looksLikeDoc gates the basic shape', () => {
    expect(looksLikeDoc(emptyDoc())).toBe(true)
    expect(looksLikeDoc(null)).toBe(false)
    expect(looksLikeDoc({ schemaVersion: '1', companies: [], contacts: [] })).toBe(false)
  })
  it('validateDoc checks entries and dates', () => {
    expect(validateDoc(docWithData())).toBe(true)
    const bad = docWithData()
    bad.companies[0].name = 42
    expect(validateDoc(bad)).toBe(false)
  })
  it('hasDuplicateIds detects collisions across both collections', () => {
    const doc = docWithData()
    expect(hasDuplicateIds(doc)).toBe(false)
    doc.contacts[0].id = doc.companies[0].id
    expect(hasDuplicateIds(doc)).toBe(true)
  })
})
