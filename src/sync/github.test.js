import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  b64encode,
  b64decode,
  isValidRepo,
  fetchRemoteFile,
  putRemoteFile,
} from './github.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('base64 (UTF-8 safe)', () => {
  it('round-trips accents and emoji', () => {
    const s = 'Prospection : Wandercraft ⭐ — relance après l’été 🎯\nLigne 2 àéîöü'
    expect(b64decode(b64encode(s))).toBe(s)
  })
  it('decodes GitHub-style newline-wrapped base64', () => {
    const b = b64encode('hello world')
    const wrapped = `${b.slice(0, 6)}\n${b.slice(6)}\n`
    expect(b64decode(wrapped)).toBe('hello world')
  })
})

describe('isValidRepo', () => {
  it('accepts owner/name and rejects everything else', () => {
    expect(isValidRepo('martin73388/radar-data')).toBe(true)
    expect(isValidRepo('a.b-c_d/e.f-g_h')).toBe(true)
    expect(isValidRepo('no-slash')).toBe(false)
    expect(isValidRepo('a/b/c')).toBe(false)
    expect(isValidRepo('https://github.com/a/b')).toBe(false)
    expect(isValidRepo('')).toBe(false)
  })
})

function stubFetch(handler) {
  vi.stubGlobal('fetch', vi.fn(handler))
}

const jsonRes = (status, body) =>
  new Response(JSON.stringify(body), { status })

describe('fetchRemoteFile', () => {
  const cfg = { repo: 'o/r', path: 'radar.json', token: 't' }

  it('returns text + sha when the file exists', async () => {
    stubFetch(() => jsonRes(200, { content: b64encode('{"a":1}'), sha: 'sha1' }))
    const r = await fetchRemoteFile(cfg)
    expect(r).toEqual({ ok: true, exists: true, sha: 'sha1', text: '{"a":1}' })
  })

  it('distinguishes missing file (ok, exists:false) from missing repo', async () => {
    stubFetch((url) =>
      String(url).includes('/contents/')
        ? jsonRes(404, {})
        : jsonRes(200, { id: 1 }),
    )
    expect(await fetchRemoteFile(cfg)).toEqual({ ok: true, exists: false })

    stubFetch(() => jsonRes(404, {}))
    expect(await fetchRemoteFile(cfg)).toEqual({ ok: false, error: 'repo-not-found' })
  })

  it('maps 401/403 to auth and network failures to network', async () => {
    stubFetch(() => jsonRes(401, {}))
    expect((await fetchRemoteFile(cfg)).error).toBe('auth')
    stubFetch(() => Promise.reject(new TypeError('offline')))
    expect((await fetchRemoteFile(cfg)).error).toBe('network')
  })
})

describe('putRemoteFile', () => {
  const cfg = { repo: 'o/r', path: 'radar.json', token: 't' }

  it('sends base64 content with sha CAS and returns the new sha', async () => {
    let sent
    stubFetch(async (url, init) => {
      sent = { url: String(url), init }
      return jsonRes(200, { content: { sha: 'sha2' } })
    })
    const r = await putRemoteFile({ ...cfg, text: '{"é":"🎯"}', sha: 'sha1' })
    expect(r).toEqual({ ok: true, sha: 'sha2' })
    expect(sent.init.method).toBe('PUT')
    const body = JSON.parse(sent.init.body)
    expect(body.sha).toBe('sha1')
    expect(b64decode(body.content)).toBe('{"é":"🎯"}')
    expect(sent.init.headers.Authorization).toBe('Bearer t')
  })

  it('omits sha on file creation and maps 409/422 to sha-conflict', async () => {
    let body
    stubFetch(async (url, init) => {
      body = JSON.parse(init.body)
      return jsonRes(200, { content: { sha: 'sha1' } })
    })
    await putRemoteFile({ ...cfg, text: '{}' })
    expect('sha' in body).toBe(false)

    stubFetch(() => jsonRes(409, {}))
    expect((await putRemoteFile({ ...cfg, text: '{}', sha: 'x' })).error).toBe(
      'sha-conflict',
    )
    stubFetch(() => jsonRes(422, {}))
    expect((await putRemoteFile({ ...cfg, text: '{}', sha: 'x' })).error).toBe(
      'sha-conflict',
    )
  })
})