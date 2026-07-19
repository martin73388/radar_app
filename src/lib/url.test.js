import { describe, it, expect } from 'vitest'
import { safeHref } from './url.js'

describe('safeHref', () => {
  it('adds https:// to a bare host/path', () => {
    expect(safeHref('linkedin.com/in/jane')).toBe('https://linkedin.com/in/jane')
    expect(safeHref('www.example.com/jobs/1')).toBe('https://www.example.com/jobs/1')
  })
  it('keeps an existing http(s) scheme', () => {
    expect(safeHref('http://ex.com')).toBe('http://ex.com/')
    expect(safeHref('https://ex.com/a')).toBe('https://ex.com/a')
  })
  it('rejects empty, non-string and dangerous schemes', () => {
    expect(safeHref('')).toBeNull()
    expect(safeHref('   ')).toBeNull()
    expect(safeHref(null)).toBeNull()
    expect(safeHref('javascript:alert(1)')).toBeNull()
  })
})
