'use client'
import { useMemo } from 'react'
import { AlertTriangle, Bell, ChevronRight, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import { computeHomeAlerts } from '@/lib/logic/home-alerts'
import { Sticker } from '@/components/theme/StickerIcon'
import clsx from 'clsx'

export default function HomeAlerts() {
  const router = useRouter()
  const { classes, sessions, students, getStudentWarnings } = useApp()

  const alerts = useMemo(
    () => computeHomeAlerts(classes, sessions, students, getStudentWarnings),
    [classes, sessions, students, getStudentWarnings],
  )

  if (classes.length === 0) return null

  if (alerts.length === 0) {
    return (
      <div className="paper-card px-4 py-3.5 flex items-center gap-3">
        <Sticker tone="green" size={32} radius={14}>
          <CheckCircle2 size={15} className="text-sticker-greenDark" />
        </Sticker>
        <p className="text-sm font-bold text-sticker-greenDark">All classes on track — no alerts</p>
      </div>
    )
  }

  const critCount = alerts.filter(a => a.level === 'critical').length

  return (
    <div className="paper-card overflow-hidden">
      {/* Header strip */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{
          background: critCount > 0 ? 'rgba(240,164,145,0.18)' : 'rgba(234,201,104,0.18)',
        }}
      >
        <div className="flex items-center gap-2">
          <div className={clsx(
            'w-7 h-7 rounded-xl flex items-center justify-center',
            critCount > 0 ? 'bg-sticker-coral/35' : 'bg-sticker-gold/35',
          )}>
            <AlertTriangle size={13} className={critCount > 0 ? 'text-sticker-coralDark' : 'text-sticker-goldDark'} />
          </div>
          <p className="font-black text-sm text-ink">
            {alerts.length} Alert{alerts.length > 1 ? 's' : ''} Need Attention
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/alerts')}
          className={clsx(
            'text-xs font-bold flex items-center gap-0.5',
            critCount > 0 ? 'text-sticker-coralDark' : 'text-sticker-goldDark',
          )}
        >
          View all <ChevronRight size={12} />
        </button>
      </div>

      {/* Alert rows */}
      <div className="divide-y" style={{ borderColor: 'rgba(58,44,30,0.08)' }}>
        {alerts.map(alert => (
          <button
            key={alert.id}
            type="button"
            onClick={() => router.push(alert.actionHref)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03] transition-colors"
          >
            <Bell
              size={13}
              className={clsx(
                'shrink-0',
                alert.level === 'critical' ? 'text-sticker-coralDark' :
                alert.level === 'watch'    ? 'text-sticker-goldDark' : 'text-sticker-blueDark',
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-ink truncate">{alert.title}</p>
              <p className="text-xs text-ink-soft truncate mt-0.5">{alert.subtitle}</p>
            </div>
            <ChevronRight size={13} className="text-ink-faint shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
