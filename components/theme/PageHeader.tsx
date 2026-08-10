'use client'
import { ArrowLeft } from '@/components/ui/icons'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

export default function PageHeader({
  title, eyebrow, subtitle, back = true, action,
}: { title: string; eyebrow?: string; subtitle?: string; back?: boolean; action?: ReactNode }) {
  const router = useRouter()
  return (
    <div className="relative z-10 px-5 pt-8 pb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {back && (
            <button
              type="button"
              onClick={() => router.back()}
              className="w-10 h-10 mb-3 flex items-center justify-center rounded-full bg-white active:scale-90 transition-transform"
              style={{ border: '1.75px solid var(--card-border)' }}
            >
              <ArrowLeft size={18} className="text-ink" />
            </button>
          )}
          {eyebrow && (
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-soft mb-1">{eyebrow}</p>
          )}
          <h1 className="font-display font-extrabold text-ink text-3xl leading-tight truncate" style={{ letterSpacing: '-0.02em' }}>
            {title}
          </h1>
          {subtitle && <p className="text-sm text-ink-soft font-medium mt-1.5">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0 pt-1">{action}</div>}
      </div>
    </div>
  )
}
