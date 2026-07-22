export default function EmptyState({ icon, title, hint }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '56px 24px',
        textAlign: 'center',
      }}
    >
      <div className="faint">{icon}</div>
      <p style={{ fontWeight: 500 }}>{title}</p>
      {hint && (
        <p className="small muted" style={{ lineHeight: 1.6 }}>
          {hint}
        </p>
      )}
    </div>
  )
}
