import { describe, it, expect } from 'vitest'
import { syncStatusLabel, syncDotClass, combineSyncStatus } from './labels.js'

describe('syncStatusLabel', () => {
  it('describes the common statuses in French', () => {
    expect(syncStatusLabel({ status: 'off' })).toBe('Désactivée')
    expect(syncStatusLabel({ status: 'syncing' })).toBe('Synchronisation…')
    expect(syncStatusLabel({ status: 'pending' })).toBe('Modifications en attente d’envoi')
    expect(syncStatusLabel({ status: 'synced', lastSyncAt: null })).toBe('À jour')
    expect(syncStatusLabel({ status: 'offline' })).toContain('Hors ligne')
    expect(syncStatusLabel({ status: 'conflict' })).toContain('Conflit')
  })

  it('picks remote-specific wording for auth/api errors, defaulting to GitHub', () => {
    const auth = { status: 'error', errorCode: 'auth' }
    expect(syncStatusLabel(auth)).toContain('Jeton') // default = github
    expect(syncStatusLabel(auth, 'github')).toContain('Jeton')
    expect(syncStatusLabel(auth, 'drive')).toContain('Secret')

    const api = { status: 'error', errorCode: 'api' }
    expect(syncStatusLabel(api, 'github')).toContain('GitHub')
    expect(syncStatusLabel(api, 'drive')).toContain('passerelle Drive')
  })

  it('uses shared wording for remote-agnostic errors', () => {
    const invalid = { status: 'error', errorCode: 'remote-invalid' }
    expect(syncStatusLabel(invalid, 'github')).toBe(syncStatusLabel(invalid, 'drive'))
    const newer = { status: 'error', errorCode: 'newer-version' }
    expect(syncStatusLabel(newer, 'drive')).toContain('plus récente')
  })
})

describe('combineSyncStatus (single ⚙️ dot for two remotes)', () => {
  it('surfaces the most attention-needing status', () => {
    expect(combineSyncStatus('synced', 'conflict')).toBe('conflict')
    expect(combineSyncStatus('error', 'synced')).toBe('error')
    expect(combineSyncStatus('synced', 'pending')).toBe('pending')
    expect(combineSyncStatus('offline', 'synced')).toBe('offline')
    expect(combineSyncStatus('conflict', 'error')).toBe('conflict')
  })

  it('ignores an unconfigured (off) remote so the active one shows through', () => {
    expect(combineSyncStatus('off', 'synced')).toBe('synced')
    expect(combineSyncStatus('synced', 'off')).toBe('synced')
    expect(combineSyncStatus('off', 'off')).toBe('off')
    expect(combineSyncStatus('off', 'pending')).toBe('pending')
  })

  it('produces a dot class consistent with the worse remote', () => {
    expect(syncDotClass(combineSyncStatus('synced', 'error'))).toBe('bg-rose-400')
    expect(syncDotClass(combineSyncStatus('off', 'off'))).toBeNull()
  })
})
