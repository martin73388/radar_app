import { describe, it, expect } from 'vitest'
import {
  isValidDateStr,
  todayLocal,
  daysBetween,
  daysUntil,
  addDays,
  formatFR,
  countdownLabel,
  isDueSoon,
  dueLabel,
  rescheduleOptions,
  compareByFollowUpUrgency,
} from './dates.js'

describe('isValidDateStr', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDateStr('2026-07-15')).toBe(true)
    expect(isValidDateStr('2028-02-29')).toBe(true) // leap year
  })
  it('rejects impossible dates and bad shapes', () => {
    expect(isValidDateStr('2027-02-29')).toBe(false) // not a leap year
    expect(isValidDateStr('2026-13-01')).toBe(false)
    expect(isValidDateStr('2026-02-30')).toBe(false)
    expect(isValidDateStr('15/07/2026')).toBe(false)
    expect(isValidDateStr('2026-7-15')).toBe(false)
    expect(isValidDateStr('')).toBe(false)
    expect(isValidDateStr(null)).toBe(false)
    expect(isValidDateStr(20260715)).toBe(false)
  })
})

describe('todayLocal', () => {
  it('formats the local date with zero padding', () => {
    expect(todayLocal(new Date(2026, 6, 15, 23, 59))).toBe('2026-07-15')
    expect(todayLocal(new Date(2026, 0, 3, 0, 0))).toBe('2026-01-03')
  })
})

describe('daysBetween / daysUntil', () => {
  it('is 0 on the same day', () => {
    expect(daysBetween('2026-07-15', '2026-07-15')).toBe(0)
  })
  it('crosses month ends', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
    expect(daysBetween('2026-04-30', '2026-05-02')).toBe(2)
  })
  it('crosses year ends (Dec→Jan)', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2026-12-29', '2027-01-05')).toBe(7)
  })
  it('handles Feb 29 (leap year)', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1)
  })
  it('is exact across European DST transitions (2026: Mar 29, Oct 25)', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })
  it('is negative when the date is past', () => {
    expect(daysUntil('2026-07-10', '2026-07-15')).toBe(-5)
    expect(daysUntil('2026-12-31', '2026-07-15')).toBe(169)
  })
})

describe('addDays', () => {
  it('adds within a month', () => {
    expect(addDays('2026-07-15', 3)).toBe('2026-07-18')
  })
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-29', 3)).toBe('2027-01-01')
    expect(addDays('2026-12-29', 7)).toBe('2027-01-05')
    expect(addDays('2026-12-29', 14)).toBe('2027-01-12')
  })
  it('handles Feb 29 and negative offsets', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('is exact across DST transitions', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
  })
})

describe('formatFR', () => {
  it('renders DD/MM/YYYY', () => {
    expect(formatFR('2026-07-15')).toBe('15/07/2026')
  })
})

describe('countdownLabel', () => {
  it('renders J−XX / Jour J / J+XX', () => {
    expect(countdownLabel(167)).toBe('J−167')
    expect(countdownLabel(0)).toBe('Jour J')
    expect(countdownLabel(-3)).toBe('J+3')
  })
})

describe('isDueSoon (due within ≤2 days, overdue included)', () => {
  it('includes 2 days ahead and everything before', () => {
    expect(isDueSoon(2)).toBe(true)
    expect(isDueSoon(1)).toBe(true)
    expect(isDueSoon(0)).toBe(true)
    expect(isDueSoon(-10)).toBe(true)
  })
  it('excludes 3+ days ahead', () => {
    expect(isDueSoon(3)).toBe(false)
  })
})

describe('dueLabel', () => {
  it('labels overdue / today / tomorrow / future', () => {
    expect(dueLabel(-3)).toBe('En retard de 3 j')
    expect(dueLabel(-1)).toBe('En retard de 1 j')
    expect(dueLabel(0)).toBe("Aujourd'hui")
    expect(dueLabel(1)).toBe('Demain')
    expect(dueLabel(2)).toBe('Dans 2 j')
  })
})

describe('rescheduleOptions (+3/+7/+14 counted from TODAY)', () => {
  it('offsets from the given today, not any previous date', () => {
    expect(rescheduleOptions('2026-07-15')).toEqual([
      { offset: 3, date: '2026-07-18' },
      { offset: 7, date: '2026-07-22' },
      { offset: 14, date: '2026-07-29' },
    ])
  })
})

describe('compareByFollowUpUrgency', () => {
  it('sorts overdue → upcoming → no follow-up, ties by name', () => {
    const contacts = [
      { name: 'Zoé', nextFollowUp: null },
      { name: 'Anna', nextFollowUp: '2026-07-20' },
      { name: 'Bob', nextFollowUp: '2026-07-10' },
      { name: 'Alice', nextFollowUp: null },
      { name: 'Caro', nextFollowUp: '2026-07-10' },
    ]
    const sorted = [...contacts].sort(compareByFollowUpUrgency)
    expect(sorted.map((c) => c.name)).toEqual([
      'Bob',
      'Caro',
      'Anna',
      'Alice',
      'Zoé',
    ])
  })
})
