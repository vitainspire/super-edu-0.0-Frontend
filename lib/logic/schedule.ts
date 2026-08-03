import type { TimetableEntry } from '@/lib/types'

export function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export interface ResolvedSchedule {
  entries: TimetableEntry[]
  dayOfWeek: number
  /** 0 = today, 1 = tomorrow, up to 7. */
  daysAhead: number
}

/**
 * Which day's periods the home page's schedule card should show.
 *
 * Today, for as long as anything is still to come. Once the last period has
 * ended — or on a day with no periods at all, which for most teachers means
 * Sunday — the next day that actually has some.
 *
 * The card used to show today unconditionally, so a Sunday read "Nothing on
 * the books today / Set up your timetable", which is both useless and untrue:
 * the timetable was fine, it just had nothing on a Sunday. A teacher looking
 * at this on a day off wants to know what Monday holds.
 *
 * Scans a whole week ahead, so a timetable with a single scheduled day still
 * resolves from any other day, and wraps past Saturday. Returns null only when
 * the timetable is genuinely empty — the one case where telling someone to go
 * and set one up is the right thing to say.
 */
export function resolveSchedule(
  entries: TimetableEntry[],
  now: Date,
): ResolvedSchedule | null {
  const periodsOn = (day: number) =>
    entries
      .filter(e => e.dayOfWeek === day)
      .sort((a, b) => a.periodNumber - b.periodNumber)

  const today = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()

  // Anything whose end time hasn't passed is still today's business. Keyed on
  // the end rather than the start so the period you are currently teaching
  // doesn't vanish halfway through it.
  const todays = periodsOn(today)
  if (todays.some(e => timeToMins(e.endTime) > mins)) {
    return { entries: todays, dayOfWeek: today, daysAhead: 0 }
  }

  for (let ahead = 1; ahead <= 7; ahead++) {
    const day = (today + ahead) % 7
    const next = periodsOn(day)
    if (next.length) return { entries: next, dayOfWeek: day, daysAhead: ahead }
  }
  return null
}
