// Turn a bare or full URL into a safe https(s) link, or null if it isn't a
// plausible web link. Used for LinkedIn profiles and job-posting links.
export function safeHref(raw) {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (!v) return null
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}
