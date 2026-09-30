'use client'
import { ArrowLeft } from '@/components/ui/icons'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

export default function PageHeader({
  title, eyebrow, subtitle, back = true, action, variant = 'default',
}: {
  title: string; eyebrow?: string; subtitle?: string; back?: boolean; action?: ReactNode
  // 'admin' opts into the admin portal's soft-UI hairline+shadow instead of
  // the bold 2px outline every other portal still uses by default -- every
  // existing call site (teacher portal included) is unaffected since this
  // defaults to 'default'.
  variant?: 'default' | 'admin'
}) {
  const router = useRouter()
  return (
    <div className="relative z-10 px-5 pt-8 pb-2 md:pt-10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {back && (
            <button
              type="button"
              onClick={() => router.back()}
              className="w-10 h-10 mb-3 flex items-center justify-center rounded-full bg-white active:scale-90 transition-transform"
              style={variant === 'admin'
                ? { border: '1px solid var(--admin-border)', boxShadow: 'var(--admin-shadow-sm)' }
                : { border: '1.75px solid var(--card-border)' }}
            >
              <ArrowLeft size={18} className="text-ink" />
            </button>
          )}
          {eyebrow && (
            <p
              className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${variant === 'admin' ? '' : 'text-ink-soft'}`}
              style={variant === 'admin' ? { color: 'var(--admin-ink-soft)' } : undefined}
            >
              {eyebrow}
            </p>
          )}
          <h1
            className={`font-display font-extrabold text-3xl md:text-4xl leading-tight truncate ${variant === 'admin' ? '' : 'text-ink'}`}
            style={{ letterSpacing: '-0.02em', ...(variant === 'admin' ? { color: 'var(--admin-ink)' } : {}) }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={`text-sm font-medium mt-1.5 ${variant === 'admin' ? '' : 'text-ink-soft'}`}
              style={variant === 'admin' ? { color: 'var(--admin-ink-soft)' } : undefined}
            >
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0 pt-1">{action}</div>}
      </div>
    </div>
  )
}
