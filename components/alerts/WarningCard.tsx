import { AlertTriangle, Eye, Info } from 'lucide-react'
import type { Warning } from '@/lib/types'
import clsx from 'clsx'

interface Props {
  studentName: string
  rollNumber: string
  warnings: Warning[]
}

const LEVEL_CONFIG = {
  critical: {
    icon: AlertTriangle,
    bg: 'bg-sticker-coral/15 border-sticker-coral/40',
    iconBg: 'bg-sticker-coral/30',
    iconColor: 'text-sticker-coralDark',
    titleColor: 'text-sticker-coralDark',
    actionColor: 'text-sticker-coralDark',
    dot: 'bg-sticker-coralDark',
  },
  watch: {
    icon: Eye,
    bg: 'bg-sticker-gold/15 border-sticker-gold/40',
    iconBg: 'bg-sticker-gold/30',
    iconColor: 'text-sticker-goldDark',
    titleColor: 'text-sticker-goldDark',
    actionColor: 'text-sticker-goldDark',
    dot: 'bg-sticker-goldDark',
  },
  info: {
    icon: Info,
    bg: 'bg-sticker-blue/15 border-sticker-blue/40',
    iconBg: 'bg-sticker-blue/30',
    iconColor: 'text-sticker-blueDark',
    titleColor: 'text-sticker-blueDark',
    actionColor: 'text-sticker-blueDark',
    dot: 'bg-sticker-blueDark',
  },
}

export default function WarningCard({ studentName, rollNumber, warnings }: Props) {
  const topWarning = warnings.sort((a, b) => {
    const order = { critical: 0, watch: 1, info: 2 }
    return order[a.level] - order[b.level]
  })[0]

  const cfg = LEVEL_CONFIG[topWarning.level]
  const Icon = cfg.icon

  return (
    <div className={clsx('rounded-2xl border p-4', cfg.bg)}>
      <div className="flex items-start gap-3">
        <div className={clsx('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', cfg.iconBg)}>
          <Icon size={20} className={cfg.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base text-ink">{studentName}</span>
            <span className="text-xs text-ink-soft">#{rollNumber}</span>
            {warnings.length > 1 && (
              <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded-full text-white', cfg.dot)}>
                +{warnings.length - 1}
              </span>
            )}
          </div>
          <p className="text-sm text-ink font-medium">{topWarning.reason}</p>
          <p className={clsx('text-sm mt-1.5 font-semibold', cfg.actionColor)}>
            → {topWarning.action}
          </p>
        </div>
      </div>

      {warnings.length > 1 && (
        <div className="mt-3 pt-3 border-t border-black/10 space-y-2">
          {warnings.slice(1).map((w, i) => {
            const c2 = LEVEL_CONFIG[w.level]
            return (
              <div key={i} className="flex gap-2">
                <span className={clsx('w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0', c2.dot)} />
                <p className="text-xs text-ink-soft">{w.reason}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
