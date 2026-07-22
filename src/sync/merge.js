// Merge engine — the core of multi-device sync. Ported from
// cockpit_app/src/sync/merge.js and adapted to the Radar document model.
//
// Rules (Cockpit spec, Radar-adapted):
//   - Per id, the entity (company/contact) with the greatest updatedAt wins,
//     WHOLE object — except `history`, which is an append-only timeline and
//     merges by UNION of entries (a note taken on the other device must never
//     vanish because this device edited the same record later).
//   - Tombstones (root.deleted[], each {id, at, kind}) prevent resurrection
//     of deleted companies/contacts. `at` is epoch ms. ADDITIVE field: legacy
//     radar.json files without it normalize to [].
//   - activityLog[] is append-only -> union, de-duplicated.
//   - settings is a scalar block -> LWW on settings.updatedAt (epoch ms,
//     additive; legacy docs coerce to 0 and lose ties deterministically).
//   - Canonical stable ordering so two identical devices emit an identical
//     file (byte-for-byte -> no CAS ping-pong between devices).
//   - Never treat a remote that is not a Radar file as mergeable.
//
// Radar timestamps are ISO strings ("2026-07-19T10:00:00.000Z"), while
// tombstones/settings stamps are epoch ms. ts() coerces both to a finite
// number so the merge stays commutative even against hand-edited or foreign
// values (fix (c) from the Cockpit review).
//
// COMPATIBILITY (§4 hard rules): the file stays radar.json; companies[].id and
// companies[].name are never renamed or transformed; new fields are additive.
//
// mergeStates is commutative, and idempotent on well-formed documents (no
// live entity sharing an id with a tombstone — the app never produces that):
//   mergeStates(a, b) deep-equals mergeStates(b, a)
//   mergeStates(a, a) deep-equals canonicalize(a)

import { CURRENT_SCHEMA_VERSION } from '../storage/index.js'

export const SCHEMA_VERSION = CURRENT_SCHEMA_VERSION

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// radar.json carries no "app" discriminator — a valid Radar file is one with
// companies[] and contacts[] as arrays (per spec; guards (a)).
export function isRadarFile(obj) {
  return isPlainObject(obj) && Array.isArray(obj.companies) && Array.isArray(obj.contacts)
}

function asArray(v) {
  return Array.isArray(v) ? v : []
}

// Deterministic, key-order-independent stringify, used only for tie-breaks.
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
}

/**
 * Coerce a timestamp to a finite number of epoch ms (0 on garbage).
 * Accepts epoch numbers, numeric strings AND ISO date strings — Radar
 * entities carry ISO `updatedAt` while tombstones carry epoch `at`.
 */
export function ts(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
    const d = Date.parse(v)
    if (Number.isFinite(d)) return d
  }
  return 0
}

// Deterministic winner between two versions of the same id.
function pickNewer(x, y) {
  const ux = ts(x.updatedAt)
  const uy = ts(y.updatedAt)
  if (ux !== uy) return ux > uy ? x : y
  // Equal timestamps (cross-device coincidence): break ties on content so the
  // merge stays commutative regardless of argument order.
  return stableStringify(x) >= stableStringify(y) ? x : y
}

// History entries are immutable & timestamped -> union by id. If two devices
// somehow diverged on the same entry id, pick deterministically.
function pickNewerHistory(x, y) {
  const ux = ts(x.at)
  const uy = ts(y.at)
  if (ux !== uy) return ux > uy ? x : y
  return stableStringify(x) >= stableStringify(y) ? x : y
}

function unionHistory(a, b) {
  const byId = new Map()
  for (const e of [...asArray(a), ...asArray(b)]) {
    if (!e || e.id == null) continue
    const prev = byId.get(e.id)
    byId.set(e.id, prev ? pickNewerHistory(prev, e) : e)
  }
  return [...byId.values()].sort(cmpHistory)
}

function cmpHistory(a, b) {
  return ts(a.at) - ts(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

// Same-id entity merge: whole-object LWW, history unioned.
function mergeEntity(x, y) {
  const winner = pickNewer(x, y)
  const loser = winner === x ? y : x
  const merged = { ...winner, history: unionHistory(x.history, y.history) }
  // Cross-device company deletion: the deleting device converts the linked
  // contacts to free text (companyId:null + companyName). If THIS device
  // edited the same contact later (winner keeps companyId + empty name), the
  // conversion's name must not be lost — the dangling companyId is nulled in
  // the post-pass below. Only fills an EMPTY name (never overrides user input).
  if (
    merged.companyId != null &&
    loser.companyId == null &&
    typeof loser.companyName === 'string' &&
    loser.companyName !== '' &&
    !merged.companyName
  ) {
    merged.companyName = loser.companyName
  }
  return merged
}

const TOMB_KINDS = ['company', 'contact']

function canonTomb(t) {
  return {
    id: t.id,
    at: ts(t.at),
    kind: TOMB_KINDS.includes(t.kind) ? t.kind : 'company',
  }
}

function mergeTombstones(a, b) {
  const map = new Map()
  for (const raw of [...asArray(a), ...asArray(b)]) {
    if (!raw || raw.id == null) continue
    const t = canonTomb(raw)
    const prev = map.get(t.id)
    // Tie-break kind deterministically on equal `at` so the result is commutative.
    if (!prev || t.at > prev.at || (t.at === prev.at && t.kind < prev.kind)) map.set(t.id, t)
  }
  return map
}

// Union by id (LWW + history union), then drop anything a tombstone buries.
function mergeCollection(a, b, tombs) {
  const byId = new Map()
  for (const item of [...asArray(a), ...asArray(b)]) {
    if (!item || item.id == null) continue
    const prev = byId.get(item.id)
    byId.set(item.id, prev ? mergeEntity(prev, item) : item)
  }
  const survivors = new Map()
  for (const item of byId.values()) {
    const tomb = tombs.get(item.id)
    if (tomb && tomb.at >= ts(item.updatedAt)) continue // deletion wins ties
    survivors.set(item.id, item)
  }
  return survivors
}

// Deterministic "latest" between two scalar values (commutative tie-break).
function latestBy(a, b) {
  const ta = ts(a)
  const tb = ts(b)
  if (ta !== tb) return ta > tb ? a : b
  return stableStringify(a) >= stableStringify(b) ? a : b
}

// settings is one scalar block -> LWW on its own (additive) updatedAt stamp —
// EXCEPT lastExportAt: pure metadata stamped by « Exporter », which must never
// drag old user data along in the block (an export on one device must not
// revert a mission-date change made on the other). It merges as max-of-both.
function mergeSettings(a, b) {
  const sa = isPlainObject(a) ? a : {}
  const sb = isPlainObject(b) ? b : {}
  const ua = ts(sa.updatedAt)
  const ub = ts(sb.updatedAt)
  const winner =
    ua !== ub ? (ua > ub ? sa : sb) : stableStringify(sa) >= stableStringify(sb) ? sa : sb
  return { ...winner, lastExportAt: latestBy(sa.lastExportAt ?? null, sb.lastExportAt ?? null) }
}

// activityLog is append-only {id?, type, date, contactId} -> union + dedupe.
// New entries carry an id (unique per event, so two « relance faite » on the
// same day survive the union); legacy id-less entries dedupe by their tuple.
function activityKey(e) {
  if (typeof e?.id === 'string' && e.id) return `id|${e.id}`
  return `${e?.type ?? ''}|${e?.date ?? ''}|${e?.contactId ?? ''}`
}

function unionActivity(a, b) {
  const seen = new Map()
  for (const e of [...asArray(a), ...asArray(b)]) {
    if (!isPlainObject(e)) continue
    const k = activityKey(e)
    const prev = seen.get(k)
    // Same key but diverging content (hand-edited file): pick deterministically
    // so both devices converge on identical bytes (commutativity, fix c).
    if (!prev || stableStringify(e) > stableStringify(prev)) seen.set(k, e)
  }
  return [...seen.values()].sort(
    (x, y) =>
      cmpStr(x.date, y.date) ||
      cmpStr(x.contactId, y.contactId) ||
      cmpStr(x.type, y.type) ||
      cmpStr(x.id, y.id),
  )
}

function cmpStr(a, b) {
  const sa = String(a ?? '')
  const sb = String(b ?? '')
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

// Root fields the merge understands. Anything else is preserved and merged
// deterministically per key (both sides -> content tie-break) so an unknown
// additive field from a future build survives a round trip commutatively.
const KNOWN_ROOT = new Set([
  'schemaVersion',
  'revision', // device-local — never merged, never serialized
  'exportedAt', // manual-export stamp — stripped from the synced file
  'settings',
  'companies',
  'contacts',
  'activityLog',
  'deleted',
])

function mergeUnknownRoot(a, b) {
  const out = {}
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  for (const k of keys) {
    if (KNOWN_ROOT.has(k)) continue
    const inA = a != null && k in a
    const inB = b != null && k in b
    if (inA && inB) out[k] = stableStringify(a[k]) >= stableStringify(b[k]) ? a[k] : b[k]
    else out[k] = inA ? a[k] : b[k]
  }
  return out
}

export function mergeStates(a, b) {
  const tombs = mergeTombstones(a?.deleted, b?.deleted)
  const companies = mergeCollection(a?.companies, b?.companies, tombs)
  const contacts = mergeCollection(a?.contacts, b?.contacts, tombs)

  // Prune tombstones made obsolete by a resurrected/edited object (updatedAt > at).
  const live = new Map([...companies, ...contacts])
  const deleted = []
  for (const t of tombs.values()) {
    const survivor = live.get(t.id)
    if (survivor && ts(survivor.updatedAt) > t.at) continue
    deleted.push(t)
  }

  // A contact whose linked company no longer survives the merge (deleted on
  // the other device) falls back to free text — mirrors the single-device
  // deleteCompany behavior; the name was preserved in mergeEntity.
  const contactsFixed = [...contacts.values()].map((p) =>
    p.companyId != null && !companies.has(p.companyId) ? { ...p, companyId: null } : p,
  )

  return canonicalize({
    ...mergeUnknownRoot(a, b),
    schemaVersion: SCHEMA_VERSION,
    settings: mergeSettings(a?.settings, b?.settings),
    companies: [...companies.values()],
    contacts: contactsFixed,
    activityLog: unionActivity(a?.activityLog, b?.activityLog),
    deleted,
  })
}

// ---- Canonicalization: deterministic key order + stable array order so two
// devices at the same logical state emit byte-identical files. Values are
// NEVER transformed (no silent data mutation) — only ordered/de-duplicated.

// Fixed key order for readability + determinism; unknown keys follow, sorted.
function orderKeys(obj, preferred) {
  const out = {}
  for (const k of preferred) if (k in obj) out[k] = obj[k]
  for (const k of Object.keys(obj).sort()) if (!(k in out)) out[k] = obj[k]
  return out
}

const COMPANY_KEYS = [
  'id',
  'name',
  'sector',
  'city',
  'notes',
  'type',
  'status',
  'priority',
  'links',
  'history',
  'createdAt',
  'updatedAt',
]
const CONTACT_KEYS = [
  'id',
  'name',
  'companyId',
  'companyName',
  'role',
  'linkedin',
  'notes',
  'history',
  'lastContact',
  'nextFollowUp',
  'createdAt',
  'updatedAt',
]
const ROOT_KEYS = ['schemaVersion', 'settings', 'companies', 'contacts', 'activityLog', 'deleted']

function canonEntity(e, preferred) {
  const out = orderKeys(e, preferred)
  // Always normalized (dedupe + sort): mergeEntity adds `history` on same-id
  // merges, so canonicalize must too — else mergeStates(a, a) would differ
  // from canonicalize(a) and break the idempotency invariant.
  out.history = unionHistory(out.history, [])
  return out
}

// Collapse duplicate ids (keep the merged version) so canonicalize matches the
// de-duplicated output of mergeStates — preserving the idempotency invariant.
function dedupeById(items) {
  const m = new Map()
  for (const it of asArray(items)) {
    if (!it || it.id == null) continue
    const prev = m.get(it.id)
    m.set(it.id, prev ? mergeEntity(prev, it) : it)
  }
  return [...m.values()]
}

function cmpEntity(a, b) {
  return ts(a.createdAt) - ts(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
function cmpTomb(a, b) {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

export function canonicalize(state) {
  const s = isPlainObject(state) ? state : {}
  const tombs = [...mergeTombstones(s.deleted, []).values()] // de-dupes by id
  const root = {
    ...mergeUnknownRoot(s, s), // unknown fields preserved (revision/exportedAt dropped)
    schemaVersion: SCHEMA_VERSION,
    settings: isPlainObject(s.settings) ? orderKeys(s.settings, ['missionEndDate', 'lastExportAt', 'updatedAt']) : {},
    companies: dedupeById(s.companies).map((c) => canonEntity(c, COMPANY_KEYS)).sort(cmpEntity),
    contacts: dedupeById(s.contacts).map((c) => canonEntity(c, CONTACT_KEYS)).sort(cmpEntity),
    activityLog: unionActivity(s.activityLog, []),
    deleted: tombs.sort(cmpTomb),
  }
  return orderKeys(root, ROOT_KEYS)
}

// Canonical JSON text for a state — this is exactly what we write to both
// remotes. `revision` (device-local) and `exportedAt` never appear in it.
export function serialize(state) {
  return JSON.stringify(canonicalize(state), null, 2)
}
