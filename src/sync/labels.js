// French UI strings for sync statuses (kept out of the engine).

// Error strings shared by both remotes; a few differ by remote (the auth
// credential and the API name), so those are keyed by remote kind.
const ERROR_LABELS = {
  github: {
    auth: 'Jeton invalide ou expiré — recrée un jeton et réactive la synchro.',
    'repo-not-found':
      'Dépôt introuvable — vérifie « utilisateur/dépôt » et que le jeton a accès à ce dépôt.',
    api: 'Erreur de l’API GitHub — réessaie plus tard.',
  },
  drive: {
    auth: 'Secret invalide — vérifie le secret de la passerelle et réactive la synchro.',
    api: 'Erreur de la passerelle Drive — réessaie plus tard.',
  },
}

const COMMON_ERROR_LABELS = {
  'newer-version':
    'Les données distantes viennent d’une version plus récente de Radar — ferme et rouvre l’app.',
  'remote-invalid': 'Fichier distant illisible — rien n’a été modifié.',
  local: 'Impossible d’appliquer la version distante ici — réessaie.',
}

/**
 * @param state  the engine state
 * @param remote 'github' (default) | 'drive' — selects credential/API wording
 */
export function syncStatusLabel(state, remote = 'github') {
  switch (state.status) {
    case 'off':
      return 'Désactivée'
    case 'syncing':
      return 'Synchronisation…'
    case 'pending':
      return 'Modifications en attente d’envoi'
    case 'synced': {
      if (!state.lastSyncAt) return 'À jour'
      const d = new Date(state.lastSyncAt)
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `À jour (dernière synchro ${hh}:${mm})`
    }
    case 'offline':
      return 'Hors ligne — reprendra automatiquement'
    case 'conflict':
      return 'Conflit à résoudre — voir le bandeau sur le Tableau'
    case 'error':
      return (
        COMMON_ERROR_LABELS[state.errorCode] ??
        ERROR_LABELS[remote]?.[state.errorCode] ??
        'Erreur de synchronisation'
      )
    default:
      return ''
  }
}

// Priority for merging two remotes into the single ⚙️ dot: surface the most
// attention-needing state. 'off' (unconfigured) is ignored so one active
// remote shows its own status regardless of the other being off.
const STATUS_PRIORITY = {
  conflict: 6,
  error: 5,
  pending: 4,
  syncing: 4,
  offline: 3,
  synced: 2,
  off: 0,
}

/**
 * Combine two remotes' statuses into the one shown next to ⚙️: the worst
 * (most attention-needing) of the two. Either argument may be undefined.
 */
export function combineSyncStatus(a, b) {
  const pa = STATUS_PRIORITY[a] ?? 0
  const pb = STATUS_PRIORITY[b] ?? 0
  return pb > pa ? b : a
}

/** Tailwind classes of the small status dot shown next to ⚙️. */
export function syncDotClass(status) {
  switch (status) {
    case 'synced':
      return 'bg-teal-400'
    case 'pending':
    case 'syncing':
      return 'bg-amber-400 animate-pulse'
    case 'offline':
      return 'bg-slate-500'
    case 'conflict':
    case 'error':
      return 'bg-rose-400'
    default:
      return null // 'off' → no dot
  }
}