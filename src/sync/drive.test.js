import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchRemoteFile, putRemoteFile, isValidDriveConfig } from './drive.js'

const URL = 'https://script.google.com/macros/s/AKfycb/exec'
const SECRET = 's3cr3t'

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => JSON.stringify(body) }
}

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isValidDriveConfig', () => {
  it('accepts an https URL with a non-empty secret', () => {
    expect(isValidDriveConfig({ url: URL, secret: SECRET })).toBe(true)
    expect(isValidDriveConfig({ url: '  ' + URL + '  ', secret: '  x ' })).toBe(true)
  })
  it('rejects non-https, empty URL or empty secret', () => {
    expect(isValidDriveConfig({ url: 'http://x.test', secret: SECRET })).toBe(false)
    expect(isValidDriveConfig({ url: '', secret: SECRET })).toBe(false)
    expect(isValidDriveConfig({ url: URL, secret: '' })).toBe(false)
    expect(isValidDriveConfig({ url: URL, secret: '   ' })).toBe(false)
    expect(isValidDriveConfig(null)).toBe(false)
    expect(isValidDriveConfig({})).toBe(false)
  })
})

describe('fetchRemoteFile (gateway GET, CORS-simple)', () => {
  it('maps gateway {ok,exists,version,content} → {ok,exists,sha,text}', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, exists: true, version: 'v7', content: '{"a":1}' }),
    )
    const r = await fetchRemoteFile({ url: URL, secret: SECRET, path: 'radar.json' })
    expect(r).toEqual({ ok: true, exists: true, sha: 'v7', text: '{"a":1}' })
  })

  it('sends auth in the query string and NO custom headers (no preflight)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, exists: false }))
    await fetchRemoteFile({ url: URL, secret: SECRET, path: 'radar.json' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(calledUrl).toContain(`secret=${SECRET}`)
    expect(calledUrl).toContain('file=radar.json')
    // A simple GET: either no options object, or one without headers/method.
    expect(opts?.headers).toBeUndefined()
    expect(opts?.method ?? 'GET').toBe('GET')
  })

  it('missing remote file resolves ok:true, exists:false (like a missing GitHub file)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, exists: false }))
    const r = await fetchRemoteFile({ url: URL, secret: SECRET, path: 'radar.json' })
    expect(r).toEqual({ ok: true, exists: false })
  })

  it('maps gateway logical errors: auth→auth, busy→network, bad-request→api', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'auth' }))
    expect(await fetchRemoteFile({ url: URL, secret: SECRET, path: 'x' })).toEqual({
      ok: false,
      error: 'auth',
    })
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'busy' }))
    expect(await fetchRemoteFile({ url: URL, secret: SECRET, path: 'x' })).toEqual({
      ok: false,
      error: 'network',
    })
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'bad-request' }))
    expect(await fetchRemoteFile({ url: URL, secret: SECRET, path: 'x' })).toEqual({
      ok: false,
      error: 'api',
    })
  })

  it('maps HTTP 401/403 → auth and other non-2xx → api', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 403 }))
    expect(await fetchRemoteFile({ url: URL, secret: SECRET, path: 'x' })).toEqual({
      ok: false,
      error: 'auth',
    })
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }))
    expect(await fetchRemoteFile({ url: URL, secret: SECRET, path: 'x' })).toEqual({
      ok: false,
      error: 'api',
    })
  })

  it('a thrown fetch (offline) → network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await fetchRemoteFile({ url: URL, secret: SECRET, path: 'x' })).toEqual({
      ok: false,
      error: 'network',
    })
  })

  it('a non-JSON / malformed gateway body → api', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => 'not json' })
    expect(await fetchRemoteFile({ url: URL, secret: SECRET, path: 'x' })).toEqual({
      ok: false,
      error: 'api',
    })
    // exists:true but missing content/version fields
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, exists: true, version: 'v' }))
    expect(await fetchRemoteFile({ url: URL, secret: SECRET, path: 'x' })).toEqual({
      ok: false,
      error: 'api',
    })
  })
})

describe('putRemoteFile (gateway POST, CORS-simple text/plain CAS)', () => {
  it('POSTs text/plain (NOT application/json) with a JSON string body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, version: 'v8' }))
    await putRemoteFile({ url: URL, secret: SECRET, path: 'radar.json', text: '{"a":1}', sha: 'v7' })
    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe(URL)
    expect(opts.method).toBe('POST')
    // Must be a simple request → text/plain, never application/json.
    expect(opts.headers['Content-Type']).toMatch(/^text\/plain/)
    expect(opts.headers['Content-Type']).not.toMatch(/application\/json/)
    const body = JSON.parse(opts.body)
    expect(body).toEqual({
      secret: SECRET,
      file: 'radar.json',
      content: '{"a":1}',
      baseVersion: 'v7',
    })
  })

  it('sends baseVersion:"" when creating the file (no sha)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, version: 'v1' }))
    await putRemoteFile({ url: URL, secret: SECRET, path: 'radar.json', text: '{}' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.baseVersion).toBe('')
  })

  it('maps {ok:true,version} → {ok:true,sha}', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, version: 'v9' }))
    const r = await putRemoteFile({ url: URL, secret: SECRET, path: 'x', text: '{}', sha: 'v8' })
    expect(r).toEqual({ ok: true, sha: 'v9' })
  })

  it('maps a CAS conflict → sha-conflict (engine re-pulls)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, error: 'conflict', version: 'vX' }),
    )
    const r = await putRemoteFile({ url: URL, secret: SECRET, path: 'x', text: '{}', sha: 'v8' })
    expect(r).toEqual({ ok: false, error: 'sha-conflict' })
  })

  it('maps auth/busy/bad-request errors like the reader does', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'auth' }))
    expect((await putRemoteFile({ url: URL, secret: SECRET, path: 'x', text: '{}' })).error).toBe(
      'auth',
    )
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'busy' }))
    expect((await putRemoteFile({ url: URL, secret: SECRET, path: 'x', text: '{}' })).error).toBe(
      'network',
    )
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: 'bad-request' }))
    expect((await putRemoteFile({ url: URL, secret: SECRET, path: 'x', text: '{}' })).error).toBe(
      'api',
    )
  })

  it('a thrown fetch (offline) → network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await putRemoteFile({ url: URL, secret: SECRET, path: 'x', text: '{}' })).error).toBe(
      'network',
    )
  })
})
