import type { SyllabusTopic, TimetableEntry } from '../types'
import { byProgression } from './nextTopic'

// ── The week strip, and what gets taught in each of its periods ──────────────
//
// nextTopicFor answers "what is next", which is the right answer for one
// period and the wrong one for a week: asked about tomorrow it returns the same
// topic as today, because nothing has been taught in between yet.
//
// So the plan is projected forward instead. Pending topics are dealt out to the
// upcoming periods of that subject in the admin's order, which is what makes
// "tomorrow's topic" a different topic from today's.

export const DAY_INITIALS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** Local midnight, so date arithmetic never drifts on a timezone boundary. */
export function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** The Sunday on or before `d` — the strip always starts on a Sunday. */
export function startOfWeek(d: Date): Date {
  return addDays(atMidnight(d), -d.getDay())
}

/** Sunday to Saturday for the week containing `d`. */
export function weekDates(d: Date): Date[] {
  const start = startOfWeek(d)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function entriesOn(entries: TimetableEntry[], date: Date): TimetableEntry[] {
  return entries
    .filter(e => e.dayOfWeek === date.getDay())
    .sort((a, b) => a.periodNumber - b.periodNumber)
}

/** A single teaching slot on a real date. `key` identifies it across renders. */
export interface Occurrence {
  key: string
  date: Date
  entry: TimetableEntry
}

/**
 * Every period of `entries` from `from` onwards, in chronological order.
 *
 * Bounded by days rather than by count so the caller cannot accidentally ask
 * for an unbounded projection.
 */
export function occurrencesFrom(
  entries: TimetableEntry[],
  from: Date,
  days: number,
): Occurrence[] {
  const out: Occurrence[] = []
  const start = atMidnight(from)
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i)
    for (const entry of entriesOn(entries, date)) {
      out.push({ key: `${date.toDateString()}|${entry.id}`, date, entry })
    }
  }
  return out
}

/**
 * The next day after `after` that actually carries periods.
 *
 * "Tomorrow" is the wrong thing to offer when tomorrow is a Sunday, or a day
 * this teacher doesn't teach — so this skips forward to the next day with
 * something on it. Returns null if there is nothing within `withinDays`, which
 * covers both an empty timetable and a single-day-a-week teacher looking too
 * far ahead.
 */
export function nextTeachingDay(
  entries: TimetableEntry[],
  after: Date,
  withinDays = 7,
): Date | null {
  for (let i = 1; i <= withinDays; i++) {
    const date = addDays(atMidnight(after), i)
    if (entriesOn(entries, date).length) return date
  }
  return null
}

export interface PlannedSession {
  topic: SyllabusTopic
  /** 1-based: session 2 of 3 for a topic the admin gave three sessions. */
  session: number
  sessions: number
}

/**
 * Deal the unfinished plan out across upcoming periods.
 *
 * A topic occupies as many consecutive periods as the admin's session estimate
 * says, defaulting to one — an unset estimate must not silently swallow the
 * whole week, which is what treating it as 0 or Infinity would do.
 *
 * Periods past the end of the plan get nothing rather than repeating the last
 * topic; the caller shows "syllabus complete" for those.
 */
export function projectPlan(
  topics: SyllabusTopic[],
  occurrences: Occurrence[],
): Map<string, PlannedSession> {
  const pending = topics.filter(t => !t.isCompleted).sort(byProgression)
  const out = new Map<string, PlannedSession>()

  let index = 0
  let used = 0
  for (const occurrence of occurrences) {
    const topic = pending[index]
    if (!topic) break
    const sessions = Math.max(1, topic.estimatedSessions ?? 1)
    out.set(occurrence.key, { topic, session: used + 1, sessions })
    used += 1
    if (used >= sessions) {
      index += 1
      used = 0
    }
  }
  return out
}

export interface WeekProgress {
  /** Academic week number of the selected date, or null before the year starts. */
  week: number | null
  taught: number
  total: number
}

/**
 * How far through the plan this teacher is, for the week bar.
 *
 * Counts completed topics against the total, so it moves as teaching happens
 * rather than tracking the calendar — a class two weeks behind should read as
 * behind, not as "week 5 of 36".
 */
export function weekProgress(
  topics: SyllabusTopic[],
  date: Date,
  academicYearStart?: string,
): WeekProgress {
  let week: number | null = null
  if (academicYearStart) {
    const start = atMidnight(new Date(academicYearStart + 'T00:00:00'))
    const diff = atMidnight(date).getTime() - start.getTime()
    week = diff < 0 ? null : Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1
  }
  return {
    week,
    taught: topics.filter(t => t.isCompleted).length,
    total: topics.length,
  }
}
