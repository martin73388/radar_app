import { describe, it, expect } from 'vitest'
import {
  mergeStates,
  canonicalize,
  serialize,
  isRadarFile,
  stableStringify,
  ts,
} from './merge.js'

// ---- Radar fixtures. updatedAt is an ISO string, as written by the app. ----
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
    updatedAt: typeof u === 'number' ? T(u) : u,
    ...extra,
  }
}

function contact(id, u, extra = {}) {
  return {
    id,
    name: id,
    companyId: null,
    companyName: '',
    role: '',
    linkedin: '',
    notes: '',
    history: [],
    lastContact: null,
    nextFollowUp: null,
    createdAt: T(0),
    updatedAt: typeof u === 'number' ? T(u) : u,
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

const ids = (list) => list.map((x) => x.id)

describe('isRadarFile guard (spec a: companies[] + contacts[] arrays, no app field)', () => {
  it('accepts a radar file', () => {
    expect(isRadarFile(doc())).toBe(true)
    expect(isRadarFile({ companies: [], contacts: [] })).toBe(true) // minimal
  })
  it('rejects null / foreign shapes', () => {
    expect(isRadarFile(null)).toBe(false)
    expect(isRadarFile([])).toBe(false)
    expect(isRadarFile({ app: 'cockpit', todos: [], habits: [], deleted: [] })).toBe(false) // cockpit-data.json
    expect(isRadarFile({ companies: {}, contacts: [] })).toBe(false)
    expect(isRadarFile({ companies: [] })).toBe(false)
  })
})

describe('ts coercion (fix c: non-numeric updatedAt stays commutative)', () => {
  it('coerces ISO strings, epoch numbers and numeric strings; 0 on garbage', () => {
    expect(ts(1750000000000)).toBe(1750000000000)
    expect(ts('1750000000000')).toBe(1750000000000)
    expect(ts(T(5))).toBe(1750000005000)
    expect(ts(undefined)).toBe(0)
    expect(ts(null)).toBe(0)
    expect(ts('garbage')).toBe(0)
    expect(ts(NaN)).toBe(0)
  })
})

describe('last-writer-wins per entity', () => {
  it('keeps the entity with the greater updatedAt, whole object', () => {
    const a = doc({ companies: [company('c1', 5, { notes: 'A', status: 'contacted' })] })
    const b = doc({ companies: [company('c1', 9, { notes: 'B', status: 'won' })] })
    const m = mergeStates(a, b)
    expect(m.companies).toHaveLength(1)
    expect(m.companies[0].notes).toBe('B')
    expect(m.companies[0].status).toBe('won')
  })

  it('unions distinct ids across both sides', () => {
    const a = doc({ companies: [company('c1', 5)], contacts: [contact('p1', 5)] })
    const b = doc({ companies: [company('c2', 5)], contacts: [contact('p2', 5)] })
    const m = mergeStates(a, b)
    expect(ids(m.companies).sort()).toEqual(['c1', 'c2'])
    expect(ids(m.contacts).sort()).toEqual(['p1', 'p2'])
  })

  it('mixed timestamp types (ISO vs epoch number) still pick the newer side', () => {
    const a = doc({ companies: [company('c1', T(5), { notes: 'iso-old' })] })
    const b = doc({ companies: [company('c1', 1750000009000, { notes: 'epoch-new' })] })
    const m1 = mergeStates(a, b)
    const m2 = mergeStates(b, a)
    expect(m1).toEqual(m2)
    expect(m1.companies[0].notes).toBe('epoch-new')
  })

  it('links are replaced wholesale with the winner (no link-level union)', () => {
    const a = doc({ companies: [company('c1', 5, { links: [{ id: 'l1', url: 'https://a' }] })] })
    const b = doc({ companies: [company('c1', 9, { links: [{ id: 'l2', url: 'https://b' }] })] })
    expect(mergeStates(a, b).companies[0].links.map((l) => l.id)).toEqual(['l2'])
  })
})

describe('history union (append-only timeline never loses a note)', () => {
  it('a note taken on the losing side survives the merge', () => {
    const noteA = { id: 'e1', at: T(3), kind: 'note', text: 'note appareil A' }
    const noteB = { id: 'e2', at: T(4), kind: 'note', text: 'note appareil B' }
    const a = doc({ companies: [company('c1', 5, { history: [noteA] })] })
    const b = doc({ companies: [company('c1', 9, { history: [noteB], notes: 'winner' })] })
    const m = mergeStates(a, b)
    expect(m.companies[0].notes).toBe('winner') // whole-object LWW for scalars…
    expect(m.companies[0].history.map((h) => h.id)).toEqual(['e1', 'e2']) // …union for history
  })

  it('history entries dedupe by id and sort by timestamp', () => {
    const e1 = { id: 'e1', at: T(2), kind: 'note', text: 'x' }
    const e2 = { id: 'e2', at: T(1), kind: 'note', text: 'y' }
    const a = doc({ contacts: [contact('p1', 5, { history: [e1, e2] })] })
    const b = doc({ contacts: [contact('p1', 5, { history: [e1] })] })
    const m = mergeStates(a, b)
    expect(m.contacts[0].history.map((h) => h.id)).toEqual(['e2', 'e1'])
  })
})

describe('tombstones (root.deleted[])', () => {
  it('a newer delete suppresses an older entity and is retained', () => {
    const a = doc({ companies: [company('c1', 5)] })
    const b = doc({ deleted: [{ id: 'c1', at: ts(T(10)), kind: 'company' }] })
    const m = mergeStates(a, b)
    expect(m.companies).toHaveLength(0)
    expect(m.deleted).toEqual([{ id: 'c1', at: ts(T(10)), kind: 'company' }])
  })

  it('prevents resurrection when re-merged with the old copy', () => {
    const withCompany = doc({ companies: [company('c1', 5)] })
    const deletedState = doc({ deleted: [{ id: 'c1', at: ts(T(10)), kind: 'company' }] })
    const merged = mergeStates(withCompany, deletedState)
    const remerged = mergeStates(merged, withCompany) // old device pushes c1 again
    expect(remerged.companies).toHaveLength(0)
  })

  it('an edit newer than the delete wins and prunes the obsolete tombstone', () => {
    const edited = doc({ companies: [company('c1', 20, { notes: 'revived' })] })
    const deletedState = doc({ deleted: [{ id: 'c1', at: ts(T(10)), kind: 'company' }] })
    const m = mergeStates(edited, deletedState)
    expect(m.companies).toHaveLength(1)
    expect(m.companies[0].notes).toBe('revived')
    expect(m.deleted).toHaveLength(0)
  })

  it('works for contacts too, and keeps the latest tombstone when both deleted', () => {
    const a = doc({
      contacts: [contact('p1', 5)],
      deleted: [{ id: 'p2', at: 4, kind: 'contact' }],
    })
    const b = doc({ deleted: [{ id: 'p1', at: ts(T(10)), kind: 'contact' }, { id: 'p2', at: 8, kind: 'contact' }] })
    const m = mergeStates(a, b)
    expect(m.contacts).toHaveLength(0)
    expect(m.deleted).toEqual([
      { id: 'p2', at: 8, kind: 'contact' },
      { id: 'p1', at: ts(T(10)), kind: 'contact' },
    ])
  })
})

describe('settings LWW (additive settings.updatedAt stamp)', () => {
  it('the block with the greater stamp wins whole', () => {
    const a = doc({ settings: { missionEndDate: '2026-10-01', lastExportAt: null, updatedAt: 100 } })
    const b = doc({ settings: { missionEndDate: '2026-12-31', lastExportAt: null, updatedAt: 200 } })
    expect(mergeStates(a, b).settings.missionEndDate).toBe('2026-12-31')
    expect(mergeStates(b, a).settings.missionEndDate).toBe('2026-12-31')
  })

  it('legacy blocks without a stamp merge deterministically (commutative)', () => {
    const a = doc({ settings: { missionEndDate: '2026-10-01', lastExportAt: null } })
    const b = doc({ settings: { missionEndDate: '2026-12-31', lastExportAt: null } })
    expect(mergeStates(a, b)).toEqual(mergeStates(b, a))
  })

  it('an export on one device never reverts newer settings from the other', () => {
    // Phone sets the mission date (newer stamp)… iPad merely exports later.
    const phone = doc({
      settings: { missionEndDate: '2026-12-31', lastExportAt: null, updatedAt: 300 },
    })
    const ipad = doc({
      settings: { missionEndDate: '2026-10-01', lastExportAt: T(50), updatedAt: 100 },
    })
    const m1 = mergeStates(phone, ipad)
    expect(m1.settings.missionEndDate).toBe('2026-12-31') // phone's change kept
    expect(m1.settings.lastExportAt).toBe(T(50)) // ipad's export stamp kept
    expect(mergeStates(ipad, phone)).toEqual(m1) // commutative
  })
})

describe('activityLog union', () => {
  it('unions entries and keeps distinct ids even on the same day', () => {
    const e1 = { id: 'a1', type: 'relance', date: '2026-07-19', contactId: 'p1' }
    const e2 = { id: 'a2', type: 'relance', date: '2026-07-19', contactId: 'p1' }
    const m = mergeStates(doc({ activityLog: [e1] }), doc({ activityLog: [e2] }))
    expect(m.activityLog).toHaveLength(2)
  })

  it('dedupes identical legacy (id-less) tuples', () => {
    const e = { type: 'relance', date: '2026-07-19', contactId: 'p1' }
    const m = mergeStates(doc({ activityLog: [e] }), doc({ activityLog: [{ ...e }] }))
    expect(m.activityLog).toHaveLength(1)
  })

  it('same-key diverging entries pick a deterministic winner (commutative, no ping-pong)', () => {
    const e1 = { id: 'a1', type: 'relance', date: '2026-07-19', contactId: 'p1', extra: 'AAA' }
    const e2 = { id: 'a1', type: 'relance', date: '2026-07-19', contactId: 'p1', extra: 'ZZZ' }
    const m1 = mergeStates(doc({ activityLog: [e1] }), doc({ activityLog: [e2] }))
    const m2 = mergeStates(doc({ activityLog: [e2] }), doc({ activityLog: [e1] }))
    expect(m1).toEqual(m2)
    expect(m1.activityLog).toHaveLength(1)
  })
})

describe('cross-device company deletion vs concurrent contact edit', () => {
  it('keeps the free-text company name and drops the dangling companyId', () => {
    // Device A deleted the company: contact converted to free text.
    const a = doc({
      contacts: [contact('p1', 5, { companyId: null, companyName: 'ACME' })],
      deleted: [{ id: 'cmp1', at: ts(T(6)), kind: 'company' }],
    })
    // Device B edited the same contact LATER, still linked to the company.
    const b = doc({
      companies: [company('cmp1', 1)],
      contacts: [contact('p1', 9, { companyId: 'cmp1', companyName: '', role: 'CTO' })],
    })
    const m = mergeStates(a, b)
    expect(mergeStates(b, a)).toEqual(m) // commutative
    expect(m.companies).toHaveLength(0) // deletion wins (tombstone newer)
    const p = m.contacts[0]
    expect(p.role).toBe('CTO') // B's edit wins the whole object…
    expect(p.companyId).toBeNull() // …but the dangling link is cleared
    expect(p.companyName).toBe('ACME') // and the association survives as text
  })
})

describe('determinism', () => {
  it('is commutative', () => {
    const a = doc({
      companies: [company('c1', 5), company('c3', 2)],
      contacts: [contact('p1', 3)],
      deleted: [{ id: 'x', at: 7, kind: 'company' }],
    })
    const b = doc({
      companies: [company('c1', 9), company('c2', 1)],
      contacts: [contact('p2', 4)],
      deleted: [{ id: 'y', at: 2, kind: 'contact' }],
    })
    expect(mergeStates(a, b)).toEqual(mergeStates(b, a))
  })

  it('breaks equal-timestamp ties deterministically (commutative)', () => {
    const a = doc({ companies: [company('c1', 5, { notes: 'AAA' })] })
    const b = doc({ companies: [company('c1', 5, { notes: 'ZZZ' })] })
    expect(mergeStates(a, b)).toEqual(mergeStates(b, a))
  })

  it('is idempotent (merge with self == canonicalize)', () => {
    const a = doc({ companies: [company('c2', 2), company('c1', 5)], contacts: [contact('p1', 3)] })
    expect(mergeStates(a, a)).toEqual(canonicalize(a))
    const m = mergeStates(a, a)
    expect(mergeStates(m, m)).toEqual(m)
  })

  it('two identical devices emit a byte-identical file regardless of ordering', () => {
    const a = doc({ companies: [company('c1', 5), company('c2', 6, { createdAt: T(1) })] })
    const b = doc({ companies: [company('c2', 6, { createdAt: T(1) }), company('c1', 5)] })
    expect(serialize(a)).toBe(serialize(b))
    expect(serialize(mergeStates(a, b))).toBe(serialize(a))
  })

  it('never serializes revision or exportedAt (device-local / export stamp)', () => {
    const a = { ...doc({ companies: [company('c1', 5)] }), revision: 42, exportedAt: T(9) }
    const text = serialize(a)
    expect(text).not.toContain('"revision"')
    expect(text).not.toContain('"exportedAt"')
    const parsed = JSON.parse(text)
    expect(parsed.companies[0].name).toBe('c1') // §4: companies[].name intact
    expect(parsed.companies[0].id).toBe('c1') // §4: companies[].id intact
  })

  it('preserves unknown additive fields (root and entity) through merge', () => {
    const a = doc({ companies: [company('c1', 5, { futureField: 'kept' })] })
    a.futureRoot = { x: 1 }
    const m = mergeStates(a, doc())
    expect(m.futureRoot).toEqual({ x: 1 })
    expect(m.companies[0].futureField).toBe('kept')
  })

  it('canonicalize de-duplicates ids so idempotency holds for dup-id input', () => {
    const dup = doc({ companies: [company('c1', 5, { notes: 'old' }), company('c1', 9, { notes: 'new' })] })
    const c = canonicalize(dup)
    expect(c.companies).toHaveLength(1)
    expect(c.companies[0].notes).toBe('new')
    expect(mergeStates(dup, dup)).toEqual(c)
  })

  it('stableStringify is key-order independent', () => {
    expect(stableStringify({ a: 1, b: [1, 2] })).toBe(stableStringify({ b: [1, 2], a: 1 }))
  })
})
