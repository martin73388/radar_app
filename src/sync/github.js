// GitHub Contents remote — compare-and-swap via the file `sha`.
// Ported from cockpit_app/src/sync/github.js, keeping Radar's config shape
// { repo: 'owner/name', token, path } (path defaults to radar.json — §4:
// the data file name never changes).
//   read()  -> GET  /repos/{repo}/contents/{path}?ref=main
//   write() -> PUT  same path, body carries base64 content + the base `sha`
// A stale sha yields 409/422 -> ConflictError -> caller re-pulls, merges, retries.
import { ConflictError, AuthError, SyncError } from './errors.js'
import { utf8ToBase64, base64ToUtf8 } from './base64.js'

const API = 'https://api.github.com'

export function isValidRepo(repo) {
  return typeof repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repo)
}

export function isConfigured(cfg) {
  return !!(cfg && isValidRepo(cfg.repo) && cfg.token)
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function contentsUrl(cfg) {
  const path = cfg.path || 'radar.json'
  const segs = String(path).split('/').map(encodeURIComponent).join('/')
  return `${API}/repos/${cfg.repo}/contents/${segs}`
}

// GitHub reuses 403 for BOTH permission errors and rate limiting. Only call a
// dropped/insufficient token an AuthError; a rate limit is transient and must
// NOT surface as « jeton invalide » (fix (d) from the Cockpit review).
function raiseAuthOrRate(res) {
  if (res.status === 401) throw new AuthError('GitHub : jeton refusé ou droits insuffisants.')
  const remaining = res.headers.get('x-ratelimit-remaining')
  const retryAfter = res.headers.get('retry-after')
  if (remaining === '0' || retryAfter) {
    throw new SyncError('GitHub : limite de débit atteinte — nouvel essai plus tard.', {
      status: 403,
      transient: true,
    })
  }
  throw new AuthError('GitHub : jeton refusé ou droits insuffisants.')
}

// Returns { exists, version(sha)|null, content(parsed)|null, raw(text)|null }.
export async function read(cfg) {
  const url = `${contentsUrl(cfg)}?ref=${encodeURIComponent(cfg.branch || 'main')}`
  let res
  try {
    res = await fetch(url, { headers: headers(cfg.token) })
  } catch (e) {
    throw new SyncError(`GitHub réseau : ${e.message}`, { transient: true })
  }
  if (res.status === 404) return { exists: false, version: null, content: null, raw: null }
  if (res.status === 401 || res.status === 403) raiseAuthOrRate(res)
  if (!res.ok) throw new SyncError(`GitHub GET ${res.status}`, { status: res.status })

  const body = await res.json()
  let text
  try {
    text = base64ToUtf8(body.content || '')
  } catch {
    throw new SyncError('GitHub : contenu distant illisible (base64 invalide).')
  }
  let parsed = null
  try {
    parsed = text.trim() ? JSON.parse(text) : null
  } catch {
    parsed = null // present but not JSON; the engine's foreign-file guard decides
  }
  return { exists: true, version: body.sha, content: parsed, raw: text }
}

// Writes `text` with CAS against `baseSha` (null/undefined => create new file).
export async function write(cfg, text, baseSha) {
  const payload = {
    message: 'Radar sync',
    content: utf8ToBase64(text),
    branch: cfg.branch || 'main',
  }
  if (baseSha) payload.sha = baseSha

  let res
  try {
    res = await fetch(contentsUrl(cfg), {
      method: 'PUT',
      headers: { ...headers(cfg.token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    throw new SyncError(`GitHub réseau : ${e.message}`, { transient: true })
  }
  if (res.status === 409 || res.status === 422) {
    // sha mismatch — someone else wrote first. Surface as conflict; engine re-pulls.
    throw new ConflictError('GitHub : sha périmé (compare-and-swap).', { version: null, content: null })
  }
  if (res.status === 401 || res.status === 403) raiseAuthOrRate(res)
  if (res.status === 404) {
    throw new SyncError('GitHub : dépôt ou chemin introuvable — vérifie « utilisateur/dépôt » et l’accès du jeton.', { status: 404 })
  }
  if (!res.ok) throw new SyncError(`GitHub PUT ${res.status}`, { status: res.status })

  const body = await res.json()
  return { version: body.content && body.content.sha }
}
