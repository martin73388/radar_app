import { createPortal } from 'react-dom'

/** Explicit confirmation before any destructive action (hard rule). */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  danger = true,
  onConfirm,
  onCancel,
}) {
  if (!open) return null
  return createPortal(
    <div className="modal-backdrop" role="alertdialog" aria-modal="true" onClick={onCancel}>
      <div
        className="modal card-pad"
        style={{ marginTop: '30vh', width: 'min(24rem, 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {message && <p className="muted small" style={{ marginTop: 8 }}>{message}</p>}
        <div className="grid-2" style={{ marginTop: 20 }}>
          <button type="button" onClick={onCancel} className="btn btn-mid">
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`btn btn-mid ${danger ? 'btn-danger' : 'btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
