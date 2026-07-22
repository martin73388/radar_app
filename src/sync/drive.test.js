import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { read, write, isValidDriveConfig, isConfigured } from './drive.js'
import { ConflictError, AuthError, SyncError } from './errors.js'

const URL = 'https://script.google.com/macros/s/AKfycb/exec'
const CFG = { url: URL, secret: 's3cr3t', path: 'radar.json' }

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body }
}

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isValidDriveConfig / isConfigured', () => {
  it('accepts an https URL with a non-empty secret', () => {
    expect(isValidDriveConfig(CFG)).toBe(true)
    expect(isConfigured(CFG)).toBe(true)
  })
  it('rejects non-https, empty URL or empty secret', () => {
    expect(isValidDriveConfig({ url: 'http://x.test', secret: 's' })).toBe(false)
    expect(isValidDriveConfig({ url: '', secret: 's' })).toBe(false)
    expect(isValidDriveConfig({ url: URL, secret: '  ' })).toBe(false)
    expect(isValidDriveConfig(null)).toBe(false)
    expect(isConfigured(null)).toBe(false)
  })
})

describe('read (gateway GET — CORS-simple, protocol §4)', () => {
  it('sends auth in the query string with NO custom headers (no preflight)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, exists: false }))
    await read(CFG)
    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe(`${URL}?secret=s3cr3t&file=radar.json`)
    expect(opts.method).toBe('GET')
    expect(opts.headers).toBeUndefined()
  })

  it('missing file resolves exists:false', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, exists: false }))
    expect(await read(CFG)).toEqual({ exists: false, version: null, content: null, raw: null })
  })

  it('maps {ok,exists,version,content} with content parsed AND raw preserved', async () => {
    const text = JSON.stringify({ schemaVersion: 1, companies: [], contacts: [] })
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, exists: true, version: 'v7', content: text }))
    const r = await read(CFG)
    expect(r.exists).toBe(true)
    expect(r.version).toBe('v7')
    expect(r.raw).toBe(text)
    expect(r.content.schemaVersion).toBe(1)
  })

  it('passes through already-parsed object content (raw null) for the engine guard', async () => {
    const obj = { app: 'cockpit', todos: [], habits: [] }
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, exists: true, version: 'v1', content: obj }))
    const r = await read(CFG)
    expect(r.content).toEqual(obj)
    expect(r.raw).toBeNull()
  })

  it('gateway auth error throws AuthError', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'auth' }))
    await expect(read(CFG)).rejects.toBeInstanceOf(AuthError)
  })

  it('gateway busy is a TRANSIENT SyncError (retried next trigger)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'busy' }))
    const err = await read(CFG).catch((e) => e)
    expect(err).toBeInstanceOf(SyncError)
    expect(err.transient).toBe(true)
  })

  it('network failure is a transient SyncError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await read(CFG).catch((e) => e)
    expect(err).toBeInstanceOf(SyncError)
    expect(err.transient).toBe(true)
  })
})

describe('write (gateway POST — CAS on baseVersion, protocol §4)', () => {
  it('POSTs text/plain (NEVER application/json) with the JSON protocol body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, version: 'v8' }))
    const r = await write(CFG, '{"a":1}', 'v7')
    expect(r).toEqual({ version: 'v8' })
    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe(URL)
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toMatch(/^text\/plain/)
    expect(opts.headers['Content-Type']).not.toMatch(/application\/json/)
    expect(JSON.parse(opts.body)).toEqual({
      secret: 's3cr3t',
      file: 'radar.json',
      content: '{"a":1}',
      baseVersion: 'v7',
    })
  })

  it('sends baseVersion:"" when creating the file (no base)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, version: 'v1' }))
    await write(CFG, '{}', null)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).baseVersion).toBe('')
  })

  it('fix (a)+(e): a CAS conflict throws ConflictError CARRYING version and parsed content', async () => {
    const competing = JSON.stringify({ app: 'cockpit', todos: [], habits: [] })
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, error: 'conflict', version: 'vX', content: competing }),
    )
    const err = await write(CFG, '{}', 'v7').catch((e) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect(err.version).toBe('vX')
    expect(err.content).toEqual({ app: 'cockpit', todos: [], habits: [] }) // engine's guard sees the payload
  })

  it('auth / busy on write behave like on read', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'auth' }))
    await expect(write(CFG, '{}', 'v')).rejects.toBeInstanceOf(AuthError)
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'busy' }))
    const err = await write(CFG, '{}', 'v').catch((e) => e)
    expect(err).toBeInstanceOf(SyncError)
    expect(err.transient).toBe(true)
  })
})
