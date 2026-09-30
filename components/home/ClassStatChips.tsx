'use client'
import { Users, CalendarCheck, Target, AlertTriangle } from '@/components/ui/icons'
import type { ClassSnapshot } from '@/lib/logic/class-snapshot'

/**
 * The class in four numbers, sized to sit under a period's time without
 * competing with the actions beside it.
 *
 * Icon plus count, no labels: the row has to survive a narrow phone next to
 * two buttons, and a teacher reads the same four chips on every card often
 * enough that the words stop carrying their space. Each chip keeps a title and
 * an aria-label, so the meaning is one hover — or one screen reader — away.
 *
 * A chip with nothing to say is omitted rather than shown as zero. "0%
 * attendance" on a class nobody has registered yet is a false alarm; no chip
 * is the honest rendering.
 */
export default function ClassStatChips({ snapshot }: { snapshot: ClassSnapshot }) {
  const { students, attendancePct, masteryPct, needAttention } = snapshot

  const chips: {
    key: string
    icon: React.ReactNode
    value: string
    label: string
    tone?: 'alert'
  }[] = []

  if (students > 0) {
    chips.push({
      key: 'students',
      icon: <Users size={11} />,
      value: String(students),
      label: `${students} student${students === 1 ? '' : 's'} on the roll`,
    })
  }
  if (attendancePct !== null) {
    chips.push({
      key: 'attendance',
      icon: <CalendarCheck size={11} />,
      value: `${attendancePct}%`,
      label: `${attendancePct}% attendance so far`,
    })
  }
  if (masteryPct !== null) {
    chips.push({
      key: 'mastery',
      icon: <Target size={11} />,
      value: `${masteryPct}%`,
      label: `${masteryPct}% average mastery`,
    })
  }
  if (needAttention > 0) {
    chips.push({
      key: 'attention',
      icon: <AlertTriangle size={11} />,
      value: String(needAttention),
      label: `${needAttention} student${needAttention === 1 ? '' : 's'} need attention`,
      tone: 'alert',
    })
  }

  if (!chips.length) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
      {chips.map(chip => (
        <span
          key={chip.key}
          title={chip.label}
          aria-label={chip.label}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none"
          style={
            chip.tone === 'alert'
              ? { background: 'rgba(196,107,84,0.14)', color: '#7A2E17' }
              : { background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }
          }
        >
          {chip.icon}
          {chip.value}
        </span>
      ))}
    </div>
  )
}
