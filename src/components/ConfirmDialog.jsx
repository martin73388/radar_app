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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-700/60 bg-slate-900 p-5 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        {message && <p className="mt-2 text-sm leading-relaxed text-slate-300">{message}</p>}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 flex-1 rounded-xl bg-slate-800 text-sm font-medium text-slate-200 active:bg-slate-700"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-11 flex-1 rounded-xl text-sm font-semibold ${
              danger
                ? 'bg-rose-600 text-white active:bg-rose-500'
                : 'bg-teal-600 text-white active:bg-teal-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
