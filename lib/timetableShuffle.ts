import type { ScheduleSlot } from './types'

export interface LineupItem {
  subject: string
  periodsPerWeek: number
}

export interface SectionInput {
  classId: string
  className: string
  subjectTeacher: Record<string, string | undefined>   // subject name -> teacherId, if assigned
}

export interface GeneratedPeriod {
  classId: string
  dayOfWeek: number
  periodNumber: number
  startTime: string
  endTime: string
  teacherId?: string
  label: string
}

export interface SectionShuffleStats {
  classId: string
  className: string
  placed: number
  skipped: number
}

export interface ShuffleResult {
  periods: GeneratedPeriod[]
  sectionStats: SectionShuffleStats[]
}

const DAYS = [1, 2, 3, 4, 5, 6]

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Randomized greedy timetable generator — not a full CSP solver. For each section,
 * it tries to spread each subject across different days first, avoiding teacher
 * double-bookings (tracked in `busyTeacherSlots`, mutated as sections are placed
 * so later sections in the same call see earlier sections' bookings). Any subject
 * instance that can't be placed without conflict is skipped and reported, rather
 * than silently overlapping or dropping the constraint.
 */
export function generateShuffledTimetable(
  slots: ScheduleSlot[],
  sections: SectionInput[],
  lineup: LineupItem[],
  busyTeacherSlots: Set<string>,   // `${teacherId}|${day}|${periodNumber}` already taken outside this batch
): ShuffleResult {
  const periodSlots = slots.filter(s => s.type === 'period' && s.periodNumber != null)
  const allDaySlots = DAYS.flatMap(day => periodSlots.map(s => ({ day, periodNumber: s.periodNumber!, startTime: s.startTime, endTime: s.endTime })))

  const busy = new Set(busyTeacherSlots)
  const periods: GeneratedPeriod[] = []
  const sectionStats: SectionShuffleStats[] = []

  for (const section of shuffleArray(sections)) {
    const bag = shuffleArray(
      lineup.flatMap(item => Array(Math.max(0, item.periodsPerWeek)).fill(item.subject) as string[])
    )
    const availableSlots = shuffleArray(allDaySlots)
    const usedSlotKeys = new Set<string>()
    const usedDaysBySubject = new Map<string, Set<number>>()

    let placed = 0
    let skipped = 0

    for (const subject of bag) {
      const teacherId = section.subjectTeacher[subject]
      const usedDays = usedDaysBySubject.get(subject) ?? new Set<number>()

      let chosen: typeof allDaySlots[number] | null = null
      // First pass: prefer a day this subject hasn't used yet. Second pass: any day.
      for (const preferNewDay of [true, false]) {
        for (const slot of availableSlots) {
          const slotKey = `${slot.day}|${slot.periodNumber}`
          if (usedSlotKeys.has(slotKey)) continue
          if (preferNewDay && usedDays.has(slot.day)) continue
          if (teacherId && busy.has(`${teacherId}|${slot.day}|${slot.periodNumber}`)) continue
          chosen = slot
          break
        }
        if (chosen) break
      }

      if (!chosen) { skipped++; continue }

      usedSlotKeys.add(`${chosen.day}|${chosen.periodNumber}`)
      usedDays.add(chosen.day)
      usedDaysBySubject.set(subject, usedDays)
      if (teacherId) busy.add(`${teacherId}|${chosen.day}|${chosen.periodNumber}`)

      periods.push({
        classId: section.classId,
        dayOfWeek: chosen.day,
        periodNumber: chosen.periodNumber,
        startTime: chosen.startTime,
        endTime: chosen.endTime,
        teacherId,
        label: subject,
      })
      placed++
    }

    sectionStats.push({ classId: section.classId, className: section.className, placed, skipped })
  }

  return { periods, sectionStats }
}
