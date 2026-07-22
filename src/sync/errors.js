// Typed sync errors so the orchestrator can react (conflict -> re-pull+merge+retry).
// Ported from cockpit_app/src/sync/errors.js — plus a `transient` flag so the
// engine can classify retriable failures (network, gateway busy, rate limit)
// without regex-matching French message text.
export class ConflictError extends Error {
  constructor(message, { version = null, content = null } = {}) {
    super(message)
    this.name = 'ConflictError'
    this.version = version // remote's current version/sha (the new CAS base)
    this.content = content // remote's current parsed content, when the remote returns it
  }
}

export class AuthError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthError'
  }
}

export class SyncError extends Error {
  constructor(message, { status = null, transient = false } = {}) {
    super(message)
    this.name = 'SyncError'
    this.status = status
    this.transient = transient // retriable on next trigger (offline-like)
  }
}
