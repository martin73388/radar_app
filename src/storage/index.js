// Single storage module — nothing else touches window.localStorage.
// Contract: ARCHITECTURE.md §5. Guarantees, in order of importance:
//   1. never destroy or silently transform user data (quarantine, backups)
//   2. never let a stale tab clobber another tab's writes (revision guard)
//   3. surface every failure to the UI instead of swallowing it

import { isValidDateStr } from '../lib/dates.js'
import { DEFAULT_STATUS, DEFAULT_TYPE } from '../config/statuses.js'

export const CURRENT_SCHEMA_VERSION = 1
export const DATA_KEY = 'radar:data'
const CORRUPT_PREFIX = 'radar:data:corrupt:'
const PRE_IMPORT_PREFIX = 'radar:data:pre-import:'
const MIGRATION_BACKUP_PREFIX = 'radar:data:backup:v'
// Device-local sync settings — NEVER part of the synced/exported document.
const SYNC_CONFIG_KEY = 'radar:sync:config' // { repo: 'owner/name', token, path }
const SYNC_STATE_KEY = 'radar:sync:state' // { lastSyncedSha, lastSyncedRevision }

// MIGRATIONS[n] migrates a vn document to v(n+1). v1 is the baseline.
export const MIGRATIONS = {}

export function makeId(prefix) {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  return `${prefix}_${uuid}`
}

export function emptyDoc() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    revision: 0,
    // A fresh document contains no invented data: no mission date yet.
    settings: { missionEndDate: null, lastExportAt: null },
    companies: [],
    contacts: [],
  }
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Structural gate: is this value shaped like a Radar document at all? */
export function looksLikeDoc(v) {
  return (
    isPlainObject(v) &&
    Number.isInteger(v.schemaVersion) &&
    v.schemaVersion >= 0 &&
    Array.isArray(v.companies) &&
    Array.isArray(v.contacts)
  )
}

/** Strict validation of a CURRENT-version document (post-migration). */
export function validateDoc(doc) {
  if (!looksLikeDoc(doc)) return false
  if (doc.settings !== undefined && !isPlainObject(doc.settings)) return false
  const md = doc.settings?.missionEndDate
  if (md != null && !isValidDateStr(md)) return false
  for (const c of doc.companies) {
    if (!isPlainObject(c) || typeof c.name !== 'string') return false
  }
  for (const p of doc.contacts) {
    if (!isPlainObject(p) || typeof p.name !== 'string') return false
    for (const field of ['lastContact', 'nextFollowUp']) {
      if (p[field] != null && !isValidDateStr(p[field])) return false
    }
  }
  return true
}

export function hasDuplicateIds(doc) {
  const ids = [...doc.companies, ...doc.contacts]
    .map((e) => e.id)
    .filter((id) => typeof id === 'string' && id)
  return new Set(ids).size !== ids.length
}

// Normalization PRESERVES unknown fields (a doc written by a slightly newer
// same-schema build must survive a round trip untouched); it only fills
// missing/invalid known fields with defaults.
function normalizeCompany(c) {
  return {
    ...c,
    id: typeof c.id === 'string' && c.id ? c.id : makeId('cmp'),
    name: c.name,
    sector: typeof c.sector === 'string' ? c.sector : '',
    city: typeof c.city === 'string' ? c.city : '',
    notes: typeof c.notes === 'string' ? c.notes : '',
    type: typeof c.type === 'string' && c.type ? c.type : DEFAULT_TYPE,
    status: typeof c.status === 'string' && c.status ? c.status : DEFAULT_STATUS,
    priority: Boolean(c.priority),
    createdAt: typeof c.createdAt === 'string' ? c.createdAt : null,
    updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : null,
  }
}

function normalizeContact(p) {
  return {
    ...p,
    id: typeof p.id === 'string' && p.id ? p.id : makeId('cnt'),
    name: p.name,
    companyId: typeof p.companyId === 'string' && p.companyId ? p.companyId : null,
    companyName: typeof p.companyName === 'string' ? p.companyName : '',
    role: typeof p.role === 'string' ? p.role : '',
    notes: typeof p.notes === 'string' ? p.notes : '',
    lastContact: p.lastContact ?? null,
    nextFollowUp: p.nextFollowUp ?? null,
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : null,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : null,
  }
}

/** Fill missing known fields with defaults; unknown fields pass through. */
export function normalizeDoc(doc) {
  return {
    ...doc,
    schemaVersion: doc.schemaVersion,
    revision: Number.isInteger(doc.revision) ? doc.revision : 0,
    settings: {
      ...doc.settings,
      missionEndDate: doc.settings?.missionEndDate ?? null,
      lastExportAt: doc.settings?.lastExportAt ?? null,
    },
    companies: doc.companies.map(normalizeCompany),
    contacts: doc.contacts.map(normalizeContact),
  }
}

export function migrateDoc(doc, migrations = MIGRATIONS) {
  let d = doc
  while (d.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const step = migrations[d.schemaVersion]
    if (!step) throw new Error(`No migration from schema v${d.schemaVersion}`)
    d = step(d)
  }
  return d
}

function removeByPrefix(storage, prefix) {
  const doomed = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && k.startsWith(prefix)) doomed.push(k)
  }
  for (const k of doomed) storage.removeItem(k)
}

/** Park an unreadable payload under a corrupt key (retention: 1) — never destroy it. */
function quarantine(storage, raw) {
  let backupKey = null
  try {
    removeByPrefix(storage, CORRUPT_PREFIX)
    backupKey = `${CORRUPT_PREFIX}${Date.now()}`
    storage.setItem(backupKey, raw)
  } catch {
    backupKey = null
  }
  return { doc: emptyDoc(), status: 'recovered-corrupt', backupKey }
}

/**
 * Load + validate + migrate. Statuses:
 *  'ok' | 'fresh' | 'recovered-corrupt' (backupKey) | 'newer-version'
 *  (read-only) | 'storage-unavailable'
 */
export function load(storage, { migrations = MIGRATIONS } = {}) {
  let raw
  try {
    raw = storage.getItem(DATA_KEY)
  } catch {
    return { doc: emptyDoc(), status: 'storage-unavailable' }
  }
  if (raw == null) return { doc: emptyDoc(), status: 'fresh' }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return quarantine(storage, raw)
  }
  if (!looksLikeDoc(parsed)) return quarantine(storage, raw)
  if (parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
    // Read-only mode: render what we can, never write (no silent downgrade).
    return { doc: parsed, status: 'newer-version' }
  }

  let doc = parsed
  const needsMigration = doc.schemaVersion < CURRENT_SCHEMA_VERSION
  if (needsMigration) {
    // Keep a pre-migration copy of the untouched payload.
    try {
      storage.setItem(`${MIGRATION_BACKUP_PREFIX}${doc.schemaVersion}`, raw)
    } catch {
      /* backup is best-effort; migration itself stays safe via quarantine */
    }
    try {
      doc = migrateDoc(doc, migrations)
    } catch {
      return quarantine(storage, raw)
    }
  }
  if (!validateDoc(doc)) return quarantine(storage, raw)
  doc = normalizeDoc(doc)

  if (needsMigration) {
    // Persist immediately after the full chain succeeded — never mid-chain.
    // Bump the revision so tabs still running the old code fail the
    // revision guard instead of silently overwriting the migrated document.
    doc = { ...doc, revision: doc.revision + 1 }
    try {
      storage.setItem(DATA_KEY, JSON.stringify(doc))
    } catch {
      /* surfaced on next save() */
    }
  }
  return { doc, status: 'ok' }
}

export function exportJSON(doc) {
  return JSON.stringify({ ...doc, exportedAt: new Date().toISOString() }, null, 2)
}

/**
 * Validate an import payload WITHOUT touching stored data.
 * Errors: 'empty' | 'not-json' | 'not-radar' | 'newer-version' |
 *         'migration-failed' | 'invalid-shape' | 'duplicate-ids'
 */
export function parseImport(text, { migrations = MIGRATIONS } = {}) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'empty' }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'not-json' }
  }
  if (!looksLikeDoc(parsed)) return { ok: false, error: 'not-radar' }
  if (isPlainObject(parsed) && 'exportedAt' in parsed) {
    // Strip the stamp exportJSON added, so export → import is symmetric.
    const { exportedAt: _stamp, ...rest } = parsed
    parsed = rest
  }
  if (parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { ok: false, error: 'newer-version' }
  }
  let doc = parsed
  try {
    doc = migrateDoc(doc, migrations)
  } catch {
    return { ok: false, error: 'migration-failed' }
  }
  if (!validateDoc(doc)) return { ok: false, error: 'invalid-shape' }
  if (hasDuplicateIds(doc)) return { ok: false, error: 'duplicate-ids' }
  doc = normalizeDoc(doc)
  return {
    ok: true,
    doc,
    counts: { companies: doc.companies.length, contacts: doc.contacts.length },
  }
}

/**
 * Stateful store bound to one Storage: tracks the revision this tab is based
 * on so a stale tab can never clobber another tab's writes.
 */
export function createStore(storage) {
  const initial = load(storage)
  // Latches to true and never unlatches (restart the app to clear): once a
  // newer-version document is seen, this tab must never write again.
  let readOnly = initial.status === 'newer-version'
  let base = Number.isInteger(initial.doc.revision) ? initial.doc.revision : 0
  // Revision applyImport wrote — undo is only valid while it is still stored.
  let importedRevision = null

  function storedMeta() {
    try {
      const raw = storage.getItem(DATA_KEY)
      if (raw == null) return null
      const parsed = JSON.parse(raw)
      if (!isPlainObject(parsed)) return null
      return {
        revision: Number.isInteger(parsed.revision) ? parsed.revision : null,
        schemaVersion: Number.isInteger(parsed.schemaVersion)
          ? parsed.schemaVersion
          : null,
      }
    } catch {
      return null
    }
  }

  /** Errors: 'read-only' | 'newer-version' | 'conflict' | 'write-failed' */
  function save(doc) {
    if (readOnly) return { ok: false, error: 'read-only' }
    const meta = storedMeta()
    if (meta?.schemaVersion != null && meta.schemaVersion > CURRENT_SCHEMA_VERSION) {
      // A newer app version wrote meanwhile (typical PWA update in another
      // tab): never downgrade its document.
      readOnly = true
      return { ok: false, error: 'newer-version' }
    }
    if (meta?.revision != null && meta.revision !== base) {
      return { ok: false, error: 'conflict' }
    }
    const next = {
      ...doc,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      revision: base + 1,
    }
    try {
      storage.setItem(DATA_KEY, JSON.stringify(next))
    } catch {
      return { ok: false, error: 'write-failed' }
    }
    base = next.revision
    return { ok: true, doc: next }
  }

  /** Re-read from storage and rebase (after a conflict or storage event). */
  function reload() {
    const result = load(storage)
    if (result.status === 'newer-version') {
      readOnly = true
      return result // do NOT rebase: this tab must never pass the guard again
    }
    base = Number.isInteger(result.doc.revision) ? result.doc.revision : 0
    return result
  }

  /** Snapshot the current payload, then write the imported document. */
  function applyImport(doc) {
    let snapshotKey = null
    try {
      const raw = storage.getItem(DATA_KEY)
      if (raw != null) {
        removeByPrefix(storage, PRE_IMPORT_PREFIX)
        snapshotKey = `${PRE_IMPORT_PREFIX}${Date.now()}`
        storage.setItem(snapshotKey, raw)
      }
    } catch {
      snapshotKey = null
    }
    const saved = save(doc)
    if (!saved.ok) return saved
    importedRevision = saved.doc.revision
    return { ...saved, snapshotKey }
  }

  /**
   * Restore the pre-import snapshot ("Annuler l'import") — but only while
   * the stored document is still the one the import wrote; any later write
   * (this tab or another) makes the undo a destructive clobber, so refuse.
   * Errors: 'read-only' | 'conflict' | 'write-failed'
   */
  function undoImport(snapshotKey) {
    if (readOnly) return { ok: false, error: 'read-only' }
    const meta = storedMeta()
    if (importedRevision == null || meta?.revision !== importedRevision) {
      return { ok: false, error: 'conflict' }
    }
    let raw
    try {
      raw = storage.getItem(snapshotKey)
    } catch {
      return { ok: false, error: 'write-failed' }
    }
    if (raw == null) return { ok: false, error: 'write-failed' }
    try {
      storage.setItem(DATA_KEY, raw)
    } catch {
      return { ok: false, error: 'write-failed' }
    }
    importedRevision = null
    const result = reload()
    return { ok: true, doc: result.doc, status: result.status }
  }

  /** Raw payload of a quarantine/snapshot key (for download / copy). */
  function getRaw(key) {
    try {
      return storage.getItem(key)
    } catch {
      return null
    }
  }

  return {
    initial,
    save,
    reload,
    applyImport,
    undoImport,
    getRaw,
    get readOnly() {
      return readOnly
    },
    get baseRevision() {
      return base
    },
  }
}

// ---------------------------------------------------------------------------
// Device-local sync settings (ARCHITECTURE.md §10bis). The token lives at the
// same trust level as the data itself; it is never synced nor exported.

function loadJsonKey(storage, key) {
  try {
    const raw = storage.getItem(key)
    if (raw == null) return null
    const parsed = JSON.parse(raw)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function saveJsonKey(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function loadSyncConfig(storage) {
  const cfg = loadJsonKey(storage, SYNC_CONFIG_KEY)
  if (!cfg || typeof cfg.repo !== 'string' || typeof cfg.token !== 'string') {
    return null
  }
  return { repo: cfg.repo, token: cfg.token, path: cfg.path || 'radar.json' }
}

export function saveSyncConfig(storage, config) {
  return saveJsonKey(storage, SYNC_CONFIG_KEY, config)
}

export function loadSyncState(storage) {
  const s = loadJsonKey(storage, SYNC_STATE_KEY)
  return {
    lastSyncedSha: typeof s?.lastSyncedSha === 'string' ? s.lastSyncedSha : null,
    lastSyncedRevision: Number.isInteger(s?.lastSyncedRevision)
      ? s.lastSyncedRevision
      : null,
    lastSyncAt: typeof s?.lastSyncAt === 'string' ? s.lastSyncAt : null,
  }
}

export function saveSyncState(storage, state) {
  return saveJsonKey(storage, SYNC_STATE_KEY, state)
}

export function clearSync(storage) {
  try {
    storage.removeItem(SYNC_CONFIG_KEY)
    storage.removeItem(SYNC_STATE_KEY)
  } catch {
    /* nothing to clear */
  }
}
