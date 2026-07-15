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

function normalizeCompany(c) {
  return {
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

/** Fill missing optional fields with defaults; never rewrites present data. */
export function normalizeDoc(doc) {
  return {
    schemaVersion: doc.schemaVersion,
    revision: Number.isInteger(doc.revision) ? doc.revision : 0,
    settings: {
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
  const readOnly = initial.status === 'newer-version'
  let base = Number.isInteger(initial.doc.revision) ? initial.doc.revision : 0

  function storedRevision() {
    try {
      const raw = storage.getItem(DATA_KEY)
      if (raw == null) return null
      const parsed = JSON.parse(raw)
      return isPlainObject(parsed) && Number.isInteger(parsed.revision)
        ? parsed.revision
        : null
    } catch {
      return null
    }
  }

  /** Errors: 'read-only' | 'conflict' | 'write-failed' */
  function save(doc) {
    if (readOnly) return { ok: false, error: 'read-only' }
    const stored = storedRevision()
    if (stored !== null && stored !== base) return { ok: false, error: 'conflict' }
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
    return { ...saved, snapshotKey }
  }

  /** Restore the pre-import snapshot ("Annuler l'import"). */
  function undoImport(snapshotKey) {
    let raw
    try {
      raw = storage.getItem(snapshotKey)
    } catch {
      return { ok: false }
    }
    if (raw == null) return { ok: false }
    try {
      storage.setItem(DATA_KEY, raw)
    } catch {
      return { ok: false }
    }
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
    readOnly,
    save,
    reload,
    applyImport,
    undoImport,
    getRaw,
    get baseRevision() {
      return base
    },
  }
}
