import { describe, it, expect } from 'vitest'
import { syncStatusLabel, syncDotClass, combineSyncState } from './labels.js'

describe('syncStatusLabel', () => {
  it('describes the engine states in French', () => {
    expect(syncStatusLabel({ state: 'disabled' })).toBe('Désactivée')
    expect(syncStatusLabel({ state: 'syncing' })).toBe('Synchronisation…')
    expect(syncStatusLabel({ state: 'ok', at: null })).toBe('À jour')
    expect(syncStatusLabel({ state: 'ok', at: Date.now() })).toContain('À jour')
    expect(syncStatusLabel({ state: 'offline' })).toContain('Hors ligne')
    expect(syncStatusLabel({ state: 'conflict' })).toContain('Conflit')
  })

  it('picks remote-specific wording for auth, defaulting to GitHub', () => {
    const auth = { state: 'auth' }
    expect(syncStatusLabel(auth)).toContain('Jeton')
    expect(syncStatusLabel(auth, 'github')).toContain('Jeton')
    expect(syncStatusLabel(auth, 'drive')).toContain('Secret')
  })

  it('surfaces the engine message for blocked and error states', () => {
    expect(syncStatusLabel({ state: 'blocked', message: 'Fichier distant invalide.' })).toBe(
      'Fichier distant invalide.',
    )
    expect(syncStatusLabel({ state: 'error', message: 'GitHub PUT 500' })).toBe('GitHub PUT 500')
    expect(syncStatusLabel({ state: 'blocked' })).toContain('bloquée')
  })
})

describe('combineSyncState (single ⚙️ dot for two remotes)', () => {
  it('surfaces the most attention-needing state', () => {
    expect(combineSyncState('ok', 'auth')).toBe('auth')
    expect(combineSyncState('blocked', 'ok')).toBe('blocked')
    expect(combineSyncState('ok', 'syncing')).toBe('syncing')
    expect(combineSyncState('offline', 'ok')).toBe('offline')
    expect(combineSyncState('error', 'syncing')).toBe('error')
  })

  it('ignores a disabled remote so the active one shows through', () => {
    expect(combineSyncState('disabled', 'ok')).toBe('ok')
    expect(combineSyncState('ok', 'disabled')).toBe('ok')
    expect(combineSyncState('disabled', 'disabled')).toBe('disabled')
  })

  it('produces a dot class consistent with the worse remote', () => {
    expect(syncDotClass(combineSyncState('ok', 'error'))).toBe('sync-dot-bad')
    expect(syncDotClass(combineSyncState('disabled', 'disabled'))).toBeNull()
    expect(syncDotClass('ok')).toBe('sync-dot-ok')
    expect(syncDotClass('syncing')).toBe('sync-dot-busy')
  })
})
