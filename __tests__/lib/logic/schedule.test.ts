/**
 * Which day the home page's schedule card shows.
 *
 * The rule is easy to state and easy to get subtly wrong at the boundaries —
 * mid-period, the moment the last period ends, and the wrap past Saturday —
 * so those are pinned here rather than left to be rediscovered on a Sunday.
 */

import { describe, it, expect } from 'vitest'
import { resolveSchedule } from '@/lib/logic/schedule'
import type { TimetableEntry } from '@/lib/types'

const period = (
  dayOfWeek: number,
  periodNumber: number,
  startTime: string,
  endTime: string,
  classId = 'c1',
): TimetableEntry => ({
  id: `${dayOfWeek}-${periodNumber}-${classId}`,
  teacherId: 't1',
  classId,
  dayOfWeek,
  periodNumber,
  startTime,
  endTime,
  label: classId === 'c1' ? 'Mathematics' : classId,
})

// Sunday 0 … Saturday 6. This teacher works Mon, Tue, Wed and Fri.
const TIMETABLE = [
  period(1, 1, '09:00', '09:45'),
  period(1, 7, '14:30', '15:15'),
  period(2, 1, '09:00', '09:45'),
  period(3, 3, '10:45', '11:30'),
  period(5, 7, '14:30', '15:15'),
]

// 2026-08-02 is a Sunday, so this week's dates line up with the day indices.
const at = (day: number, time: string) => {
  const [h, m] = time.split(':').map(Number)
  return new Date(2026, 7, 2 + day, h, m)
}

describe('resolveSchedule', () => {
  it('shows today when periods are still to come', () => {
    const r = resolveSchedule(TIMETABLE, at(1, '08:00'))!
    expect(r.daysAhead).toBe(0)
    expect(r.dayOfWeek).toBe(1)
    expect(r.entries).toHaveLength(2)
  })

  it('keeps showing today during a period, not just before it', () => {
    // 09:20 is inside Monday's first period and after its start.
    const r = resolveSchedule(TIMETABLE, at(1, '09:20'))!
    expect(r.daysAhead).toBe(0)
    // The running period must not disappear from under the teacher.
    expect(r.entries.map(e => e.periodNumber)).toEqual([1, 7])
  })

  it('still shows today between periods', () => {
    const r = resolveSchedule(TIMETABLE, at(1, '12:00'))!
    expect(r.daysAhead).toBe(0)
  })

  it('rolls to tomorrow the moment the last period ends', () => {
    const during = resolveSchedule(TIMETABLE, at(1, '15:14'))!
    expect(during.daysAhead).toBe(0)

    const after = resolveSchedule(TIMETABLE, at(1, '15:15'))!
    expect(after.daysAhead).toBe(1)
    expect(after.dayOfWeek).toBe(2)
  })

  it('skips a day with no periods — Sunday shows Monday', () => {
    const r = resolveSchedule(TIMETABLE, at(0, '10:00'))!
    expect(r.dayOfWeek).toBe(1)
    expect(r.daysAhead).toBe(1)
    expect(r.entries).toHaveLength(2)
  })

  it('skips several empty days at once — Wednesday evening shows Friday', () => {
    const r = resolveSchedule(TIMETABLE, at(3, '18:00'))!
    expect(r.dayOfWeek).toBe(5)
    expect(r.daysAhead).toBe(2)
  })

  it('wraps past Saturday back to Monday', () => {
    const r = resolveSchedule(TIMETABLE, at(6, '09:00'))!
    expect(r.dayOfWeek).toBe(1)
    expect(r.daysAhead).toBe(2)
  })

  it('resolves from any day when only one day has periods', () => {
    const fridayOnly = [period(5, 1, '09:00', '09:45')]
    // Saturday is the furthest point from Friday: six days round the week.
    const r = resolveSchedule(fridayOnly, at(6, '09:00'))!
    expect(r.dayOfWeek).toBe(5)
    expect(r.daysAhead).toBe(6)
  })

  it('returns the day sorted by period number, whatever order it arrived in', () => {
    const jumbled = [period(1, 7, '14:30', '15:15'), period(1, 1, '09:00', '09:45')]
    const r = resolveSchedule(jumbled, at(1, '08:00'))!
    expect(r.entries.map(e => e.periodNumber)).toEqual([1, 7])
  })

  it('returns null only when the timetable is empty', () => {
    expect(resolveSchedule([], at(1, '09:00'))).toBeNull()
  })
})
