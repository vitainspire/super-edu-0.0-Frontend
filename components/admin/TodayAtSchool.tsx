'use client'
import { useRouter } from 'next/navigation'
import { CalendarCheck, MessageCircleQuestion, UserMinus, TriangleAlert as AlertTriangle } from 'lucide-react'

export interface Operations {
  attendanceRate: number | null
  attendanceRecords: number
  pendingDoubts: number
  teachersAbsentToday: number
  unresolvedCover: number
}

/**
 * The four numbers an admin should see before the first bell.
 *
 * Unlike the readiness panel this never empties — it is the day's state, not a
 * setup checklist. Cells that have nothing to report say so rather than showing
 * a zero that could be mistaken for a measurement: a school that has taken no
 * attendance is not a school with 0% attendance.
 */
export default function TodayAtSchool({ operations }: { operations: Operations }) {
  const router = useRouter()
  const { attendanceRate, attendanceRecords, pendingDoubts, teachersAbsentToday, unresolvedCover } = operations

  const cells: {
    key: string
    icon: React.ReactNode
    value: string
    label: string
    hint?: string
    href?: string
    tone?: 'alert'
  }[] = [
    {
      key: 'attendance',
      icon: <CalendarCheck size={15} />,
      value: attendanceRate === null ? '—' : `${attendanceRate}%`,
      label: 'Attendance',
      hint: attendanceRate === null
        ? 'None recorded in the last 7 days'
        : `${attendanceRecords.toLocaleString()} record${attendanceRecords === 1 ? '' : 's'}, last 7 days`,
    },
    {
      key: 'cover',
      icon: <AlertTriangle size={15} />,
      value: String(unresolvedCover),
      label: 'Unresolved cover',
      hint: unresolvedCover > 0 ? 'Periods today with no substitute' : 'Every absence is covered',
      href: '/admin/substitutes',
      tone: unresolvedCover > 0 ? 'alert' : undefined,
    },
    {
      key: 'absent',
      icon: <UserMinus size={15} />,
      value: String(teachersAbsentToday),
      label: 'Teachers away',
      hint: 'Marked unavailable today',
      href: '/admin/substitutes',
    },
    {
      key: 'doubts',
      icon: <MessageCircleQuestion size={15} />,
      value: String(pendingDoubts),
      label: 'Unanswered doubts',
      hint: pendingDoubts > 0 ? 'Students waiting on a reply' : 'Nothing waiting',
      tone: pendingDoubts > 0 ? 'alert' : undefined,
    },
  ]

  return (
    <div className="paper-card p-5 mb-6">
      <p className="text-[11px] font-bold text-ink-soft uppercase tracking-widest mb-4">Today</p>
      <div className="grid grid-cols-2 gap-3">
        {cells.map(cell => {
          const clickable = !!cell.href
          const Tag = clickable ? 'button' : 'div'
          return (
            <Tag
              key={cell.key}
              {...(clickable
                ? { type: 'button' as const, onClick: () => router.push(cell.href!) }
                : {})}
              className={`text-left rounded-2xl p-3.5 ${clickable ? 'active:scale-[0.98] transition-transform' : ''}`}
              style={{ background: 'rgba(58,44,30,0.05)', border: '1px solid rgba(58,44,30,0.1)' }}
            >
              <span
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ color: cell.tone === 'alert' ? '#7A2E17' : 'var(--ink-soft)' }}
              >
                {cell.icon}
                {cell.label}
              </span>
              <p
                className="font-display font-extrabold mt-1.5"
                style={{ fontSize: 24, letterSpacing: '-0.02em', color: cell.tone === 'alert' ? '#7A2E17' : 'var(--ink)' }}
              >
                {cell.value}
              </p>
              {cell.hint && <p className="text-[11px] text-ink-faint mt-0.5 leading-snug">{cell.hint}</p>}
            </Tag>
          )
        })}
      </div>
    </div>
  )
}
