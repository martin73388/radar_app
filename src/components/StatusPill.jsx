import { statusOf } from '../config/statuses.js'

export default function StatusPill({ statusKey }) {
  const s = statusOf(statusKey)
  return (
    <span className="status-pill" style={{ '--pill-hue': s.color }}>
      <span className="status-dot" />
      {s.label}
    </span>
  )
}
