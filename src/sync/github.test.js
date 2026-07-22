import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { read, write, isValidRepo, isConfigured } from './github.js'
import { utf8ToBase64, base64ToUtf8 } from './base64.js'
import { ConflictError, AuthError, SyncError } from './errors.js'

const CFG = { repo: 'martin/radar-core', token: 'tok', path: 'radar.json' }

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  }
}

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('base64 (UTF-8 safe)', () => {
  it('round-trips accents and emoji', () => {
    const s = 'Prénom Ünïcode 🚀 « guillemets »'
    expect(base64ToUtf8(utf8ToBase64(s))).toBe(s)
  })
  it('tolerates GitHub-style wrapped base64 (newlines)', () => {
    const b64 = utf8ToBase64('hello world hello world')
    const wrapped = b64.slice(0, 10) + '\n' + b64.slice(10)
    expect(base64ToUtf8(wrapped)).toBe('hello world hello world')
  })
})

describe('config validation', () => {
  it('isValidRepo accepts owner/name only', () => {
    expect(isValidRepo('martin73388/radar_core')).toBe(true)
    expect(isValidRepo('nope')).toBe(false)
    expect(isValidRepo('a/b/c')).toBe(false)
  })
  it('isConfigured needs a valid repo + token', () => {
    expect(isConfigured(CFG)).toBe(true)
    expect(isConfigured({ repo: 'bad', token: 't' })).toBe(false)
    expect(isConfigured({ repo: 'a/b', token: '' })).toBe(false)
    expect(isConfigured(null)).toBe(false)
  })
})

describe('read', () => {
  it('returns exists:false on 404 (file not created yet)', async () => {
    fetchMock.mockResolvedValue(response(404, {}))
    expect(await read(CFG)).toEqual({ exists: false, version: null, content: null, raw: null })
  })

  it('decodes base64 content and parses JSON', async () => {
    const text = JSON.stringify({ schemaVersion: 1, companies: [], contacts: [] })
    fetchMock.mockResolvedValue(response(200, { sha: 'sha1', content: utf8ToBase64(text) }))
    const r = await read(CFG)
    expect(r.exists).toBe(true)
    expect(r.version).toBe('sha1')
    expect(r.raw).toBe(text)
    expect(r.content.schemaVersion).toBe(1)
  })

  it('keeps content:null (raw preserved) when the file is not JSON — engine guards it', async () => {
    fetchMock.mockResolvedValue(response(200, { sha: 's', content: utf8ToBase64('not json') }))
    const r = await read(CFG)
    expect(r.content).toBeNull()
    expect(r.raw).toBe('not json')
  })

  it('throws AuthError on 401', async () => {
    fetchMock.mockResolvedValue(response(401, {}))
    await expect(read(CFG)).rejects.toBeInstanceOf(AuthError)
  })

  it('fix (d): 403 with rate-limit headers is a TRANSIENT SyncError, not auth', async () => {
    fetchMock.mockResolvedValue(response(403, {}, { 'x-ratelimit-remaining': '0' }))
    const err = await read(CFG).catch((e) => e)
    expect(err).toBeInstanceOf(SyncError)
    expect(err).not.toBeInstanceOf(AuthError)
    expect(err.transient).toBe(true)

    fetchMock.mockResolvedValue(response(403, {}, { 'retry-after': '30' }))
    const err2 = await read(CFG).catch((e) => e)
    expect(err2).toBeInstanceOf(SyncError)
    expect(err2.transient).toBe(true)
  })

  it('fix (d): a plain 403 (no rate-limit headers) IS an AuthError', async () => {
    fetchMock.mockResolvedValue(response(403, {}, { 'x-ratelimit-remaining': '42' }))
    await expect(read(CFG)).rejects.toBeInstanceOf(AuthError)
  })

  it('network failure is a transient SyncError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await read(CFG).catch((e) => e)
    expect(err).toBeInstanceOf(SyncError)
    expect(err.transient).toBe(true)
  })
})

describe('write (CAS on sha)', () => {
  it('PUTs base64 content with the base sha and returns the new sha', async () => {
    fetchMock.mockResolvedValue(response(200, { content: { sha: 'sha2' } }))
    const r = await write(CFG, '{"a":1}', 'sha1')
    expect(r).toEqual({ version: 'sha2' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('/repos/martin/radar-core/contents/radar.json')
    expect(opts.method).toBe('PUT')
    const body = JSON.parse(opts.body)
    expect(body.sha).toBe('sha1')
    expect(base64ToUtf8(body.content)).toBe('{"a":1}')
  })

  it('omits sha when creating a new file', async () => {
    fetchMock.mockResolvedValue(response(201, { content: { sha: 'sha1' } }))
    await write(CFG, '{}', null)
    expect('sha' in JSON.parse(fetchMock.mock.calls[0][1].body)).toBe(false)
  })

  it('fix (e): 409/422 raise ConflictError so the engine re-pulls + merges + retries', async () => {
    fetchMock.mockResolvedValue(response(409, {}))
    await expect(write(CFG, '{}', 'stale')).rejects.toBeInstanceOf(ConflictError)
    fetchMock.mockResolvedValue(response(422, {}))
    await expect(write(CFG, '{}', 'stale')).rejects.toBeInstanceOf(ConflictError)
  })

  it('fix (d) applies to writes too: rate-limited 403 is transient, not auth', async () => {
    fetchMock.mockResolvedValue(response(403, {}, { 'x-ratelimit-remaining': '0' }))
    const err = await write(CFG, '{}', 's').catch((e) => e)
    expect(err).toBeInstanceOf(SyncError)
    expect(err.transient).toBe(true)
  })
})
