// French UI strings for sync statuses (kept out of the engine).

const ERROR_LABELS = {
  auth: 'Jeton invalide ou expiré — recrée un jeton et réactive la synchro.',
  'repo-not-found':
    'Dépôt introuvable — vérifie « utilisateur/dépôt » et que le jeton a accès à ce dépôt.',
  'newer-version':
    'Les données distantes viennent d’une version plus récente de Radar — ferme et rouvre l’app.',
  'remote-invalid': 'Fichier distant illisible — rien n’a été modifié.',
  local: 'Impossible d’appliquer la version distante ici — réessaie.',
  api: 'Erreur de l’API GitHub — réessaie plus tard.',
}

export function syncStatusLabel(state) {
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
      return ERROR_LABELS[state.errorCode] ?? 'Erreur de synchronisation'
    default:
      return ''
  }
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