'use client'
import { useEffect } from 'react'
import { X } from '@/components/ui/icons'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  // Takes over the entire viewport with an opaque background, so nothing of the
  // page behind shows through. For anything being PRESENTED — a prep sheet the
  // teacher is teaching from, Classroom Mode on a board or projector — where a
  // strip of dashboard around the edges is just a distraction.
  fullscreen?: boolean
  children: React.ReactNode
}

export default function Modal({ open, onClose, title, fullscreen = false, children }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className={`fixed inset-0 z-[60] flex justify-center ${fullscreen ? '' : 'items-end sm:items-center'}`}>
      <div
        className="absolute inset-0"
        // Opaque when fullscreen — covers the page even while the panel's own
        // scroll rubber-bands past its ends.
        style={{ background: fullscreen ? 'var(--paper-bg)' : 'rgba(58,44,30,0.6)' }}
        // Tap-outside-to-close needs an outside to tap. There isn't one here,
        // and closing a lesson mid-class by accident is the worst outcome.
        onClick={fullscreen ? undefined : onClose}
      />
      <div
        className={fullscreen
          ? 'relative w-full h-[100dvh] overflow-y-auto'
          : 'relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] overflow-y-auto'}
        style={{
          background: 'var(--paper-bg)',
          border: fullscreen ? 'none' : '2px solid var(--card-border)',
        }}
      >
        <div
          className={`sticky top-0 z-10 ${fullscreen ? '' : 'rounded-t-3xl'}`}
          style={{
            background: 'var(--paper-bg)',
            borderBottom: '2px solid var(--card-border)',
            paddingTop: fullscreen ? 'env(safe-area-inset-top, 0px)' : undefined,
          }}
        >
          {/* The surface owns the whole viewport; the content inside it stays a
              readable column instead of stretching across a wide screen. */}
          <div className={`flex items-center justify-between p-5 ${fullscreen ? 'mx-auto w-full max-w-3xl' : ''}`}>
            <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full transition-colors bg-white active:scale-90"
              style={{ border: '1.75px solid var(--card-border)' }}
            >
              <X size={18} className="text-ink" />
            </button>
          </div>
        </div>
        <div
          className={`p-5 pb-8 ${fullscreen ? 'mx-auto w-full max-w-3xl' : ''}`}
          style={{ paddingBottom: fullscreen ? 'calc(2rem + env(safe-area-inset-bottom, 0px))' : undefined }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
