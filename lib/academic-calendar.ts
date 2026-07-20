import type { AcademicEvent } from './types'

// Many Indian schools run a 6-day week (Mon–Sat) — the assumption
// lib/timetableShuffle.ts hardcodes today — but plenty of private/CBSE
// schools run 5-day weeks instead. This lets the calendar's own capacity
// math reflect either, independent of the (still 6-day-only) generator.
export const SIX_DAY_WEEK: readonly number[] = [1, 2, 3, 4, 5, 6]
export const FIVE_DAY_WEEK: readonly number[] = [1, 2, 3, 4, 5]

// Shared category/holiday-subtype display meta — used by both the admin
// calendar-editor page and the teacher read-only calendar page, so the two
// surfaces render events identically. Icons are chosen per-page (lucide
// components aren't safe to hang off a plain-data lib module).
export const CATEGORY_META: Record<AcademicEvent['category'], { label: string; color: string; bg: string }> = {
  holiday: { label: 'Holiday', color: '#0f766e', bg: '#f0fdfa' },
  exam:    { label: 'Exam',    color: '#b45309', bg: '#fffbeb' },
  term:    { label: 'Term',    color: '#31215C', bg: '#f5f3ff' },
}

// Full-cell tint for the calendar grid — deliberately stronger than
// CATEGORY_META's chip background so a holiday/exam day visually pops out
// when scanning a month, not just on close inspection of a small chip.
export const CATEGORY_CELL_TINT: Record<AcademicEvent['category'], string> = {
  holiday: '#ccfbf1',
  exam:    '#fef3c7',
  term:    '#ede9fe',
}

export const HOLIDAY_SUBTYPE_META: Record<NonNullable<AcademicEvent['holidaySubtype']>, { label: string }> = {
  public:   { label: 'Public Holiday' },
  school:   { label: 'School Holiday' },
  cultural: { label: 'Cultural Event' },
}

/**
 * Every calendar year (Jan–Dec) an academic-year range touches — e.g. a
 * school year running June 2026 → March 2027 spans [2026, 2027]. Used to
 * seed India's public holidays for the whole academic year in one action,
 * since date-holidays computes one calendar year at a time.
 */
export function yearsSpanned(startDate: string, endDate: string): number[] {
  const startYear = Number(startDate.slice(0, 4))
  const endYear = Number(endDate.slice(0, 4))
  const years: number[] = []
  for (let y = startYear; y <= endYear; y++) years.push(y)
  return years
}

export interface WorkingCapacity {
  workingDays: number
  workingHours: number
  totalDays: number
  nonWorkingDays: number
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

/**
 * How many actual teaching days/hours remain in a date range, once holiday
 * and exam-block events are subtracted out. 'term' events don't subtract —
 * they're just the range boundary, not a non-teaching period. Client-safe —
 * no Node-only dependencies (see lib/indian-holidays.ts for the seed data,
 * which is server-only).
 */
export function computeWorkingCapacity(
  startDate: string,
  endDate: string,
  events: Pick<AcademicEvent, 'category' | 'startDate' | 'endDate' | 'countsAsNonWorking'>[],
  periodsPerDay: number,
  periodMinutes: number,
  workingWeekdays: readonly number[] = SIX_DAY_WEEK,
): WorkingCapacity {
  const workingSet = new Set(workingWeekdays)
  const blockedRanges = events
    .filter(e => (e.category === 'holiday' || e.category === 'exam') && e.countsAsNonWorking !== false)
    .map(e => ({ start: e.startDate, end: e.endDate }))

  const start = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')

  let totalDays = 0
  let workingDays = 0

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    totalDays++
    const dow = d.getUTCDay() // 0=Sun..6=Sat
    if (!workingSet.has(dow)) continue

    const dateStr = toDateStr(d)
    const blocked = blockedRanges.some(r => dateStr >= r.start && dateStr <= r.end)
    if (!blocked) workingDays++
  }

  return {
    workingDays,
    workingHours: Math.round((workingDays * periodsPerDay * periodMinutes) / 60 * 10) / 10,
    totalDays,
    nonWorkingDays: totalDays - workingDays,
  }
}

/**
 * How many real class sessions a specific subject actually has left this
 * year — not a generic school-wide working-day count, but grounded in that
 * subject's own timetable (which weekdays, how many periods each) with
 * holidays subtracted out. Used to sanity-check an AI-estimated
 * sessions-per-topic total against what's actually possible.
 */
export function computeSubjectSessionAvailability(
  fromDate: string,
  toDate: string,
  events: Pick<AcademicEvent, 'category' | 'startDate' | 'endDate' | 'countsAsNonWorking'>[],
  periodsPerWeekday: Record<number, number>, // dayOfWeek 1=Mon..6=Sat -> periods that day
): number {
  const blockedRanges = events
    .filter(e => (e.category === 'holiday' || e.category === 'exam') && e.countsAsNonWorking !== false)
    .map(e => ({ start: e.startDate, end: e.endDate }))

  const start = new Date(fromDate + 'T00:00:00Z')
  const end = new Date(toDate + 'T00:00:00Z')

  let sessions = 0
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay()
    const count = periodsPerWeekday[dow]
    if (!count) continue
    const dateStr = toDateStr(d)
    const blocked = blockedRanges.some(r => dateStr >= r.start && dateStr <= r.end)
    if (!blocked) sessions += count
  }
  return sessions
}
