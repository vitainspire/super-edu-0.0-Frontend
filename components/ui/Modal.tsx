'use client'
import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(58,44,30,0.6)' }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto"
        style={{ background: 'var(--paper-soft)', border: '1.5px solid rgba(58,44,30,0.18)' }}
      >
        <div
          className="flex items-center justify-between p-5 sticky top-0 rounded-t-3xl z-10"
          style={{ background: 'var(--paper-soft)', borderBottom: '1px solid rgba(58,44,30,0.1)' }}
        >
          <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full transition-colors"
            style={{ background: 'rgba(58,44,30,0.06)' }}
          >
            <X size={20} className="text-ink-soft" />
          </button>
        </div>
        <div className="p-5 pb-8">{children}</div>
      </div>
    </div>
  )
}
