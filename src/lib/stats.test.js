import { describe, it, expect } from 'vitest'
import { weekStart, relancesByWeek, companiesByStatus, computeStats } from './stats.js'
import { emptyDoc } from '../storage/index.js'

describe('weekStart', () => {
  it('returns the Monday of the ISO week', () => {
    // 2026-07-15 is a Wednesday → Monday is 2026-07-13
    expect(weekStart('2026-07-15')).toBe('2026-07-13')
    expect(weekStart('2026-07-13')).toBe('2026-07-13') // Monday itself
    expect(weekStart('2026-07-19')).toBe('2026-07-13') // Sunday → same Monday
    expect(weekStart('2026-07-20')).toBe('2026-07-20') // next Monday
  })
  it('handles month/year boundaries', () => {
    // 2027-01-01 is a Friday → Monday 2026-12-28
    expect(weekStart('2027-01-01')).toBe('2026-12-28')
  })
})

describe('relancesByWeek', () => {
  const log = [
    { type: 'relance', date: '2026-07-15' }, // this week (Mon 07-13)
    { type: 'relance', date: '2026-07-16' }, // this week
    { type: 'relance', date: '2026-07-08' }, // last week (Mon 07-06)
    { type: 'relance', date: '2026-05-01' }, // older, outside 8-week window from 07-15
  ]
  it('buckets entries into the trailing N weeks, oldest→newest', () => {
    const weeks = relancesByWeek(log, '2026-07-15', 8)
    expect(weeks).toHaveLength(8)
    expect(weeks.at(-1)).toEqual({ weekStart: '2026-07-13', count: 2 })
    expect(weeks.at(-2)).toEqual({ weekStart: '2026-07-06', count: 1 })
    // The May entry is outside the 8-week window → not counted anywhere here.
    expect(weeks.reduce((a, b) => a + b.count, 0)).toBe(3)
  })
  it('is all-zero for an empty log', () => {
    const weeks = relancesByWeek([], '2026-07-15', 4)
    expect(weeks.every((w) => w.count === 0)).toBe(true)
  })
  it('ignores malformed entries', () => {
    const weeks = relancesByWeek([{}, null, { date: 5 }, { date: '2026-07-15' }], '2026-07-15', 2)
    expect(weeks.at(-1).count).toBe(1)
  })
})

describe('companiesByStatus', () => {
  it('counts by status in pipeline order, then unknowns', () => {
    const companies = [
      { status: 'won' },
      { status: 'to_contact' },
      { status: 'to_contact' },
      { status: 'from_the_future' },
    ]
    const res = companiesByStatus(companies)
    const map = Object.fromEntries(res.map((r) => [r.key, r.count]))
    expect(map.to_contact).toBe(2)
    expect(map.won).toBe(1)
    expect(map.from_the_future).toBe(1)
    // to_contact (first in pipeline) comes before won; unknown last
    expect(res[0].key).toBe('to_contact')
    expect(res.at(-1).key).toBe('from_the_future')
  })
})

describe('computeStats', () => {
  it('summarises totals including relances in the last 7 days and wins', () => {
    const doc = emptyDoc()
    doc.companies.push({ status: 'won' }, { status: 'to_contact' })
    doc.contacts.push({ id: 'c1' }, { id: 'c2' })
    doc.activityLog.push(
      { type: 'relance', date: '2026-07-15' }, // today → last 7
      { type: 'relance', date: '2026-07-10' }, // within 7
      { type: 'relance', date: '2026-07-01' }, // outside 7
    )
    const s = computeStats(doc, '2026-07-15', 8)
    expect(s.totals).toMatchObject({
      companies: 2,
      contacts: 2,
      relancesTotal: 3,
      relancesLast7: 2,
      won: 1,
    })
    expect(s.byWeek).toHaveLength(8)
  })
})
