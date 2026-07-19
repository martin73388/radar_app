// Second sync remote: Google Drive, via an Apps Script Web App gateway.
//
// This module speaks the SAME interface as github.js so engine.js is reused
// unchanged: fetchRemoteFile() → { ok, exists, sha?, text? } and
// putRemoteFile() → { ok, sha } | { ok:false, error }. The gateway's opaque
// `version` (a content hash) plays the role GitHub's `sha` plays: the CAS
// token. We map version ↔ sha here so the engine stays remote-agnostic.
//
// CORS: only "simple requests" (no preflight), because the Apps Script gateway
// does not answer OPTIONS. Therefore:
//   - GET carries auth in the query string (no custom headers at all);
//   - POST uses Content-Type: text/plain — NEVER application/json (that would
//     trigger a preflight). The JSON is sent as a raw text body.

// Gateway logical errors → engine error codes.
//   'auth'        → 'auth'    (bad secret)
//   'busy'        → 'network' (gateway lock held; transient, retry next trigger)
//   'bad-request' → 'api'
function mapError(e) {
  if (e === 'auth') return 'auth'
  if (e === 'busy') return 'network'
  return 'api'
}

async function readJson(res) {
  try {
    return JSON.parse(await res.text())
  } catch {
    return null
  }
}

export function isValidDriveConfig(cfg) {
  return (
    typeof cfg?.url === 'string' &&
    /^https:\/\/\S+$/i.test(cfg.url.trim()) &&
    typeof cfg?.secret === 'string' &&
    cfg.secret.trim() !== ''
  )
}

/**
 * Read the data file through the gateway.
 * GET <url>?secret=<S>&file=<path> → { ok, exists, version, content }
 * Resolves { ok, exists, sha?, text? } (same shape as github.js).
 */
export async function fetchRemoteFile({ url, secret, path }) {
  const qs = `?secret=${encodeURIComponent(secret)}&file=${encodeURIComponent(path)}`
  let res
  try {
    res = await fetch(url + qs) // no custom headers → CORS-simple GET
  } catch {
    return { ok: false, error: 'network' }
  }
  if (!res.ok) {
    return { ok: false, error: res.status === 401 || res.status === 403 ? 'auth' : 'api' }
  }
  const data = await readJson(res)
  if (!data || typeof data !== 'object') return { ok: false, error: 'api' }
  if (data.ok === false) return { ok: false, error: mapError(data.error) }
  if (!data.exists) return { ok: true, exists: false } // like a missing GitHub file
  if (typeof data.content !== 'string' || typeof data.version !== 'string') {
    return { ok: false, error: 'api' }
  }
  return { ok: true, exists: true, sha: data.version, text: data.content }
}

/**
 * Create/update the data file with compare-and-swap on the gateway `version`.
 * POST <url>  body(text/plain) = { secret, file, content, baseVersion }
 *   → { ok:true, version }                       → { ok:true, sha }
 *   → { ok:false, error:'conflict', version }    → { ok:false, error:'sha-conflict' } (re-pull)
 *   → { ok:false, error:'auth'|'bad-request'|'busy' }
 */
export async function putRemoteFile({ url, secret, path, text, sha }) {
  const body = JSON.stringify({
    secret,
    file: path,
    content: text,
    baseVersion: sha ?? '', // empty when creating the file
  })
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // CORS-simple
      body,
    })
  } catch {
    return { ok: false, error: 'network' }
  }
  if (!res.ok) {
    return { ok: false, error: res.status === 401 || res.status === 403 ? 'auth' : 'api' }
  }
  const data = await readJson(res)
  if (!data || typeof data !== 'object') return { ok: false, error: 'api' }
  if (data.ok === true) {
    if (typeof data.version !== 'string') return { ok: false, error: 'api' }
    return { ok: true, sha: data.version }
  }
  if (data.error === 'conflict') return { ok: false, error: 'sha-conflict' }
  return { ok: false, error: mapError(data.error) }
}
