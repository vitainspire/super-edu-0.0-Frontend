import type { Class, Session, Student, Warning, ScheduleSlot } from '../types'
import type { HomeAlert } from './home-alerts'

type PeriodSlot = ScheduleSlot & { periodNumber: number }

export type FreeSlotSuggestion =
  | { kind: 'doubts'; classId: string; className: string; text: string }
  | { kind: 'alert'; href: string; text: string }
  | { kind: 'grades'; classId: string; className: string; text: string }
  | { kind: 'analytics'; classId: string; className: string; text: string }
  | { kind: 'wellness'; text: string }

/** A class with at least one unanswered student question. */
export interface PendingDoubtsByClass {
  classId: string
  className: string
  count: number
}

// Deliberately no link, no task — a free period showing up as three more
// things to check would defeat the point of it being free. Rotated in
// alongside the real suggestions below, not just used once candidates run out.
const WELLNESS_MESSAGES = [
  'Nothing waiting here — take five.',
  'Good time for a short walk or a glass of water.',
  'A quiet stretch, no task attached.',
  'Step outside for a few minutes before the next period.',
  'Free period. No need to fill it.',
]

/**
 * Which classes are worth a look, and why, ranked most-worth-a-look first:
 * unanswered doubts (students are actually waiting on a reply) outrank the
 * home-alerts feed (critical/watch signals already computed elsewhere),
 * which outranks grades-to-review, which outranks a plain analytics
 * check-in. Only ever one suggestion per free slot — this ranking decides
 * which single thing gets the slot when several are true for the same class.
 */
function findCandidates(
  classes: Class[],
  sessions: Session[],
  students: Student[],
  getStudentWarnings: (studentId: string) => Warning[],
  alerts: HomeAlert[],
  pendingDoubts: PendingDoubtsByClass[],
): FreeSlotSuggestion[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const candidates: FreeSlotSuggestion[] = []

  for (const d of pendingDoubts) {
    if (d.count > 0) {
      candidates.push({
        kind: 'doubts', classId: d.classId, className: d.className,
        text: `${d.count} unanswered question${d.count > 1 ? 's' : ''} from ${d.className}`,
      })
    }
  }

  for (const a of alerts) {
    candidates.push({ kind: 'alert', href: a.actionHref, text: a.title })
  }

  for (const cls of classes) {
    const flagged = students.filter(s =>
      s.classId === cls.id && s.isActive &&
      getStudentWarnings(s.id).some(w => w.level === 'critical' || w.category === 'low_marks' || w.category === 'struggling'),
    )
    if (flagged.length > 0) {
      candidates.push({
        kind: 'grades', classId: cls.id, className: cls.name,
        text: `Review recent grades for ${cls.name} — ${flagged.length} student${flagged.length > 1 ? 's' : ''} flagged`,
      })
    }
  }

  for (const cls of classes) {
    const lastSession = sessions
      .filter(s => s.classId === cls.id)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    const daysSince = lastSession
      ? Math.floor((today.getTime() - new Date(lastSession.date + 'T00:00:00').getTime()) / 86400000)
      : null
    if (daysSince != null && daysSince >= 4) {
      candidates.push({
        kind: 'analytics', classId: cls.id, className: cls.name,
        text: `See how ${cls.name} is doing — ${daysSince} days since the last session`,
      })
    }
  }

  return candidates
}

/**
 * A free period earns a "go check on school things" suggestion only when it's
 * actually a usable stretch of time. Two situations are a breather instead,
 * always wellness, never a task:
 *  - It's the very first period of the day's grid — the day hasn't got going
 *    yet, so this isn't free time the teacher carved out, it's the day
 *    easing in. (The second period is fair game — only the first is protected.)
 *  - It's a single free period boxed in by real (taught or covered) periods
 *    on both sides — a five-minute gap between two classes, not a chunk of
 *    time to spend on marks or doubts.
 * Every other free period is "other than that" — it gets the next-highest
 * priority real suggestion, falling back to wellness only once genuine
 * candidates run out (never a duplicated or invented task).
 */
function isBreather(slot: PeriodSlot, allPeriods: PeriodSlot[], occupiedPeriods: Set<number>): boolean {
  const idx = allPeriods.findIndex(p => p.periodNumber === slot.periodNumber)
  if (idx < 1) return true // the first period of the day's grid, only

  const prev = allPeriods[idx - 1]
  const next = allPeriods[idx + 1]
  return prev != null && next != null
    && occupiedPeriods.has(prev.periodNumber) && occupiedPeriods.has(next.periodNumber)
}

/** One suggestion per free slot, in the same order as freeSlots. */
export function buildFreePeriodSuggestions(
  classes: Class[],
  sessions: Session[],
  students: Student[],
  getStudentWarnings: (studentId: string) => Warning[],
  freeSlots: PeriodSlot[],
  allPeriods: PeriodSlot[],
  occupiedPeriods: Set<number>,
  alerts: HomeAlert[] = [],
  pendingDoubts: PendingDoubtsByClass[] = [],
): FreeSlotSuggestion[] {
  if (freeSlots.length === 0) return []
  const candidates = findCandidates(classes, sessions, students, getStudentWarnings, alerts, pendingDoubts)

  let candidateIdx = 0
  let wellnessIdx = 0
  const nextWellness = (): FreeSlotSuggestion => {
    const text = WELLNESS_MESSAGES[wellnessIdx % WELLNESS_MESSAGES.length]
    wellnessIdx++
    return { kind: 'wellness', text }
  }

  return freeSlots.map(slot => {
    if (isBreather(slot, allPeriods, occupiedPeriods)) return nextWellness()
    if (candidateIdx < candidates.length) return candidates[candidateIdx++]
    return nextWellness()
  })
}
