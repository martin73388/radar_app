// Google Drive gateway remote (Apps Script /exec) — ported from
// cockpit_app/src/sync/drive.js, keeping Radar's config shape
// { url, secret, path } (path defaults to radar.json — §4 hard rule).
//
// PROTOCOL (§4: MUST NOT change — Cockpit's « Projet » menu and the robot
// assistant read radar.json through this same gateway):
//   READ  : GET  <url>?secret=<S>&file=radar.json
//           -> { ok, exists, version, content }
//   WRITE : POST <url>  body JSON {secret, file, content, baseVersion}
//           with Content-Type: text/plain  (NEVER application/json -> would
//           trigger a CORS preflight the gateway cannot answer)
//           -> { ok:true, version }
//            | { ok:false, error:"conflict", version, content }
//            | { ok:false, error:"auth"|"bad-request"|"busy" }
// `version` plays the role of GitHub's `sha` (the CAS token).
import { ConflictError, AuthError, SyncError } from './errors.js'

export function isValidDriveConfig(cfg) {
  return (
    typeof cfg?.url === 'string' &&
    /^https:\/\/\S+$/i.test(cfg.url.trim()) &&
    typeof cfg?.secret === 'string' &&
    cfg.secret.trim() !== ''
  )
}

export function isConfigured(cfg) {
  return !!(cfg && isValidDriveConfig(cfg))
}

function fileOf(cfg) {
  return cfg.path || 'radar.json'
}

function parseMaybeJson(content) {
  if (content == null) return null
  if (typeof content === 'object') return content
  const text = String(content)
  try {
    return text.trim() ? JSON.parse(text) : null
  } catch {
    return null
  }
}

// Returns { exists, version|null, content(parsed)|null, raw|null }.
export async function read(cfg) {
  const url = `${cfg.url}?secret=${encodeURIComponent(cfg.secret)}&file=${encodeURIComponent(fileOf(cfg))}`
  let res
  try {
    res = await fetch(url, { method: 'GET' }) // no custom headers -> simple request
  } catch (e) {
    throw new SyncError(`Drive réseau : ${e.message}`, { transient: true })
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AuthError('Drive : secret refusé.')
    throw new SyncError(`Drive GET ${res.status}`, { status: res.status })
  }

  let body
  try {
    body = await res.json()
  } catch (e) {
    throw new SyncError(`Drive : réponse illisible (${e.message})`)
  }
  if (body.ok === false && body.error === 'auth') throw new AuthError('Drive : secret refusé.')
  if (body.ok === false && body.error === 'busy') {
    throw new SyncError('Drive : passerelle occupée — nouvel essai plus tard.', { transient: true })
  }
  if (body.ok === false && body.error) throw new SyncError(`Drive : ${body.error}`)
  if (body.exists === false) return { exists: false, version: null, content: null, raw: null }

  return {
    exists: true,
    version: body.version ?? null,
    content: parseMaybeJson(body.content),
    raw: typeof body.content === 'string' ? body.content : null,
  }
}

// Writes `text` (already-serialized JSON) with CAS against `baseVersion`.
export async function write(cfg, text, baseVersion) {
  const payload = {
    secret: cfg.secret,
    file: fileOf(cfg),
    content: text,
    baseVersion: baseVersion ?? '',
  }
  let res
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, // simple request, avoids preflight
      body: JSON.stringify(payload),
    })
  } catch (e) {
    throw new SyncError(`Drive réseau : ${e.message}`, { transient: true })
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AuthError('Drive : secret refusé.')
    throw new SyncError(`Drive POST ${res.status}`, { status: res.status })
  }

  let body
  try {
    body = await res.json()
  } catch (e) {
    throw new SyncError(`Drive : réponse illisible (${e.message})`)
  }
  if (body.ok) return { version: body.version ?? null }

  if (body.error === 'conflict') {
    throw new ConflictError('Drive : baseVersion périmée.', {
      version: body.version ?? null,
      content: parseMaybeJson(body.content),
    })
  }
  if (body.error === 'auth') throw new AuthError('Drive : secret refusé.')
  if (body.error === 'busy') {
    throw new SyncError('Drive : passerelle occupée — nouvel essai plus tard.', { transient: true })
  }
  throw new SyncError(`Drive : ${body.error || 'échec écriture'}`)
}
