'use client'

// Generalized from the confirm-card JSX duplicated verbatim in
// AdminAskAssistant.tsx and components/home/AskAssistant.tsx (same markup,
// same classes, only the accent color differed). Group Chat is the first
// consumer; the two existing assistants are left as-is for now rather than
// forced onto this in the same change — pure addition, lowest risk.
export default function ConfirmCard({
  label,
  onConfirm,
  onCancel,
  busy = false,
}: {
  label: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  return (
    <div className="p-3 rounded-2xl space-y-2.5" style={{ background: 'rgba(15,23,42,0.05)', border: '1.5px solid var(--card-border)' }}>
      <p className="text-[13px] font-semibold text-ink">{label} — go ahead?</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="admin-btn-primary h-8 px-3.5 rounded-xl text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? '…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="admin-btn-secondary h-8 px-3.5 rounded-xl text-xs font-bold text-ink-soft disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
