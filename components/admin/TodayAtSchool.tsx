'use client'
import { useRouter } from 'next/navigation'
import { CalendarCheck, MessageCircleQuestion, UserMinus, AlertTriangle } from 'lucide-react'

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
    // Status dot next to the number, at a glance: 'green' = resolved/fine,
    // 'amber' = needs attention, 'gray' = purely informational (no defined
    // good/bad for this metric — attendance rate and "teachers away" don't
    // have a threshold anywhere in this data model, so they stay neutral
    // rather than inventing one).
    dot: 'green' | 'amber' | 'gray'
  }[] = [
    {
      key: 'attendance',
      icon: <CalendarCheck size={15} />,
      value: attendanceRate === null ? '—' : `${attendanceRate}%`,
      label: 'Attendance',
      hint: attendanceRate === null
        ? 'None recorded in the last 7 days'
        : `${attendanceRecords.toLocaleString()} record${attendanceRecords === 1 ? '' : 's'}, last 7 days`,
      dot: attendanceRate === null ? 'gray' : 'green',
    },
    {
      key: 'cover',
      icon: <AlertTriangle size={15} />,
      value: String(unresolvedCover),
      label: 'Unresolved cover',
      hint: unresolvedCover > 0 ? 'Periods today with no substitute' : 'Every absence is covered',
      href: '/admin/substitutes',
      tone: unresolvedCover > 0 ? 'alert' : undefined,
      dot: unresolvedCover > 0 ? 'amber' : 'green',
    },
    {
      key: 'absent',
      icon: <UserMinus size={15} />,
      value: String(teachersAbsentToday),
      label: 'Teachers away',
      hint: 'Marked unavailable today',
      href: '/admin/substitutes',
      dot: 'gray',
    },
    {
      key: 'doubts',
      icon: <MessageCircleQuestion size={15} />,
      value: String(pendingDoubts),
      label: 'Unanswered doubts',
      hint: pendingDoubts > 0 ? 'Students waiting on a reply' : 'Nothing waiting',
      tone: pendingDoubts > 0 ? 'alert' : undefined,
      dot: pendingDoubts > 0 ? 'amber' : 'green',
    },
  ]

  const DOT_COLOR: Record<'green' | 'amber' | 'gray', string> = {
    green: '#22C55E', amber: '#D97706', gray: '#CBD5E1',
  }

  return (
    <div className="admin-card p-5 mb-6">
      <p className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: '#64748B' }}>Today</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cells.map(cell => {
          const clickable = !!cell.href
          const Tag = clickable ? 'button' : 'div'
          return (
            <Tag
              key={cell.key}
              {...(clickable
                ? { type: 'button' as const, onClick: () => router.push(cell.href!) }
                : {})}
              className={clickable ? 'admin-card-hover text-left rounded-2xl p-4' : 'admin-card text-left rounded-2xl p-4'}
            >
              <span
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ color: cell.tone === 'alert' ? '#D97706' : '#64748B' }}
              >
                {cell.icon}
                {cell.label}
              </span>
              <p
                className="font-display font-extrabold mt-1.5 flex items-center gap-2"
                style={{ fontSize: 24, letterSpacing: '-0.02em', color: cell.tone === 'alert' ? '#B45309' : '#0F172A' }}
              >
                {cell.value}
                <span
                  className="rounded-full shrink-0"
                  style={{ width: 8, height: 8, background: DOT_COLOR[cell.dot] }}
                  aria-hidden="true"
                />
              </p>
              {cell.hint && <p className="text-[11px] mt-0.5 leading-snug" style={{ color: '#94A3B8' }}>{cell.hint}</p>}
            </Tag>
          )
        })}
      </div>
    </div>
  )
}
