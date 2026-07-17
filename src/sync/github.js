// Minimal GitHub Contents API client (the only network code in the app,
// used solely when Martin has opted into sync — ARCHITECTURE.md §10bis).
// Typed errors: 'auth' | 'not-found' | 'sha-conflict' | 'network' |
// 'invalid-json' | 'api'

const API = 'https://api.github.com'
const HEADERS = (token) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
})

// UTF-8-safe base64 (btoa alone corrupts accents/emoji).
export function b64encode(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function b64decode(b64) {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function isValidRepo(repo) {
  return typeof repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repo)
}

async function request(url, { token, method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(url, {
      method,
      headers: HEADERS(token),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return { ok: false, error: 'network' }
  }
  if (res.status === 401 || res.status === 403) return { ok: false, error: 'auth' }
  if (res.status === 404) return { ok: false, error: 'not-found' }
  if (res.status === 409 || res.status === 422) {
    return { ok: false, error: 'sha-conflict' }
  }
  if (!res.ok) return { ok: false, error: 'api', status: res.status }
  try {
    return { ok: true, data: await res.json() }
  } catch {
    return { ok: false, error: 'api' }
  }
}

/**
 * Read the data file. Resolves { ok, exists, sha?, text? }.
 * A missing file resolves ok:true, exists:false (first sync creates it).
 */
export async function fetchRemoteFile({ repo, path, token }) {
  const r = await request(`${API}/repos/${repo}/contents/${encodeURIComponent(path)}`, {
    token,
  })
  if (!r.ok) {
    if (r.error === 'not-found') {
      // File missing — but distinguish "repo unreachable" (bad repo/token
      // scope) so the config UI can give a precise French message.
      const repoCheck = await request(`${API}/repos/${repo}`, { token })
      if (!repoCheck.ok) {
        return { ok: false, error: repoCheck.error === 'not-found' ? 'repo-not-found' : repoCheck.error }
      }
      return { ok: true, exists: false }
    }
    return { ok: false, error: r.error }
  }
  if (typeof r.data?.content !== 'string' || typeof r.data?.sha !== 'string') {
    return { ok: false, error: 'api' }
  }
  let text
  try {
    text = b64decode(r.data.content)
  } catch {
    return { ok: false, error: 'invalid-json' }
  }
  return { ok: true, exists: true, sha: r.data.sha, text }
}

/**
 * Create/update the data file with compare-and-swap on `sha` (omit sha only
 * when creating). Resolves { ok, sha } or { ok:false, error } —
 * 'sha-conflict' means the remote moved and the caller must re-pull.
 */
export async function putRemoteFile({ repo, path, token, text, sha, message }) {
  const body = {
    message: message || 'Radar sync',
    content: b64encode(text),
  }
  if (sha) body.sha = sha
  const r = await request(
    `${API}/repos/${repo}/contents/${encodeURIComponent(path)}`,
    { token, method: 'PUT', body },
  )
  if (!r.ok) return { ok: false, error: r.error }
  const newSha = r.data?.content?.sha
  if (typeof newSha !== 'string') return { ok: false, error: 'api' }
  return { ok: true, sha: newSha }
}