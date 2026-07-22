// French UI strings for sync statuses (kept out of the engine).
// A remote status is { state, message, at } — see engine.js.

const AUTH_LABELS = {
  github: 'Jeton invalide ou expiré — recrée un jeton et réactive la synchro.',
  drive: 'Secret invalide — vérifie le secret de la passerelle et réactive la synchro.',
}

/**
 * @param remoteStatus  { state, message, at } for one remote
 * @param remote 'github' (default) | 'drive' — selects credential wording
 */
export function syncStatusLabel(remoteStatus, remote = 'github') {
  const { state, message, at } = remoteStatus ?? {}
  switch (state) {
    case 'disabled':
      return 'Désactivée'
    case 'syncing':
      return 'Synchronisation…'
    case 'ok': {
      if (!at) return 'À jour'
      const d = new Date(at)
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `À jour (dernière synchro ${hh}:${mm})`
    }
    case 'offline':
      return 'Hors ligne — reprendra automatiquement'
    case 'auth':
      return AUTH_LABELS[remote] ?? AUTH_LABELS.github
    case 'blocked':
      return message || 'Fichier distant protégé — écriture bloquée.'
    case 'conflict':
      return 'Conflit persistant — nouvel essai au prochain cycle.'
    case 'error':
      return message || 'Erreur de synchronisation'
    default:
      return ''
  }
}

// Priority for merging two remotes into the single ⚙️ dot: surface the most
// attention-needing state. 'disabled' is ignored so one active remote shows
// its own status regardless of the other being off.
const STATE_PRIORITY = {
  auth: 7,
  blocked: 6,
  error: 5,
  conflict: 5,
  syncing: 4,
  offline: 3,
  ok: 2,
  disabled: 0,
}

/**
 * Combine two remotes' states into the one shown next to ⚙️: the worst
 * (most attention-needing) of the two. Either argument may be undefined.
 */
export function combineSyncState(a, b) {
  const pa = STATE_PRIORITY[a] ?? 0
  const pb = STATE_PRIORITY[b] ?? 0
  return pb > pa ? b : a
}

/** app.css class of the small status dot shown next to ⚙️ (null = no dot). */
export function syncDotClass(state) {
  switch (state) {
    case 'ok':
      return 'sync-dot-ok'
    case 'syncing':
      return 'sync-dot-busy'
    case 'offline':
      return 'sync-dot-off'
    case 'auth':
    case 'blocked':
    case 'conflict':
    case 'error':
      return 'sync-dot-bad'
    default:
      return null // 'disabled' → no dot
  }
}
