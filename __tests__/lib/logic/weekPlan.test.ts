/**
 * The week strip and the plan projected across it.
 *
 * The point of the projection is that tomorrow is a DIFFERENT topic from today.
 * nextTopicFor cannot answer that — nothing has been taught in between yet — so
 * these pin that dealing-forward behaviour, plus the date arithmetic the strip
 * depends on.
 */

import { describe, it, expect } from 'vitest'
import {
  startOfWeek, weekDates, addDays, sameDay, entriesOn, occurrencesFrom,
  projectPlan, weekProgress, nextTeachingDay,
} from '@/lib/logic/weekPlan'
import type { SyllabusTopic, TimetableEntry } from '@/lib/types'

const topic = (
  name: string, orderIndex: number, weekNumber: number | null,
  isCompleted = false, estimatedSessions?: number,
): SyllabusTopic => ({
  id: name, classId: 'c1', topic: name, description: '',
  orderIndex, weekNumber: weekNumber ?? undefined, isCompleted, estimatedSessions, createdAt: '',
})

const period = (dayOfWeek: number, periodNumber: number): TimetableEntry => ({
  id: `d${dayOfWeek}p${periodNumber}`, teacherId: 't1', classId: 'c1',
  dayOfWeek, periodNumber, startTime: '09:00', endTime: '09:45', label: 'Mathematics',
})

// 2026-08-03 is a Monday.
const MON = new Date(2026, 7, 3)

describe('week arithmetic', () => {
  it('starts the week on the Sunday on or before the date', () => {
    expect(startOfWeek(MON).getDate()).toBe(2)          // Sun 2 Aug
    expect(startOfWeek(new Date(2026, 7, 2)).getDate()).toBe(2)  // already Sunday
  })

  it('gives seven days, Sunday to Saturday', () => {
    const days = weekDates(MON)
    expect(days).toHaveLength(7)
    expect(days.map(d => d.getDate())).toEqual([2, 3, 4, 5, 6, 7, 8])
    expect(days[0].getDay()).toBe(0)
    expect(days[6].getDay()).toBe(6)
  })

  it('crosses a month boundary without drifting', () => {
    // Sun 30 Aug 2026 → the week runs into September.
    const days = weekDates(new Date(2026, 7, 31))
    expect(days.map(d => d.getDate())).toEqual([30, 31, 1, 2, 3, 4, 5])
    expect(days[6].getMonth()).toBe(8)
  })

  it('addDays and sameDay survive a month end', () => {
    expect(addDays(new Date(2026, 7, 31), 1).getMonth()).toBe(8)
    expect(sameDay(new Date(2026, 7, 3, 23, 59), MON)).toBe(true)
  })
})

describe('entriesOn / occurrencesFrom', () => {
  // Maths on Mon P1, Mon P4, Tue P1, Wed P3, Fri P7 — the real 1B shape.
  const TT = [period(1, 1), period(1, 4), period(2, 1), period(3, 3), period(5, 7)]

  it('returns a day’s periods in period order', () => {
    expect(entriesOn(TT, MON).map(e => e.periodNumber)).toEqual([1, 4])
  })

  it('returns nothing for a day with no periods', () => {
    expect(entriesOn(TT, new Date(2026, 7, 6))).toEqual([])   // Thursday
  })

  it('walks periods in chronological order across days', () => {
    const occ = occurrencesFrom(TT, MON, 5)   // Mon..Fri
    expect(occ.map(o => `${o.date.getDate()}p${o.entry.periodNumber}`))
      .toEqual(['3p1', '3p4', '4p1', '5p3', '7p7'])
  })

  it('gives every occurrence a distinct key', () => {
    const occ = occurrencesFrom(TT, MON, 14)
    expect(new Set(occ.map(o => o.key)).size).toBe(occ.length)
  })
})

describe('nextTeachingDay', () => {
  const TT = [period(1, 1), period(1, 4), period(2, 1), period(3, 3), period(5, 7)]

  it('is tomorrow when tomorrow has periods', () => {
    expect(nextTeachingDay(TT, MON)!.getDate()).toBe(4)   // Mon → Tue
  })

  it('skips days with nothing on rather than offering an empty day', () => {
    // Wed 5 Aug → Thu is free, so the answer is Fri 7 Aug.
    expect(nextTeachingDay(TT, new Date(2026, 7, 5))!.getDate()).toBe(7)
  })

  it('wraps into next week', () => {
    // Fri 7 Aug is the last teaching day of the week → Mon 10 Aug.
    const next = nextTeachingDay(TT, new Date(2026, 7, 7))!
    expect(next.getDate()).toBe(10)
    expect(next.getDay()).toBe(1)
  })

  it('never returns the day it was asked about', () => {
    expect(sameDay(nextTeachingDay(TT, MON)!, MON)).toBe(false)
  })

  it('returns null for an empty timetable instead of a bogus date', () => {
    expect(nextTeachingDay([], MON)).toBeNull()
  })

  it('returns null when the only teaching day is beyond the horizon', () => {
    expect(nextTeachingDay([period(1, 1)], MON, 3)).toBeNull()
  })
})

describe('projectPlan', () => {
  const TT = [period(1, 1), period(1, 4), period(2, 1), period(3, 3), period(5, 7)]
  const PLAN = [
    topic('Pre-Mathematical Concepts', 0, 1, true),   // already taught
    topic('Shapes', 1, 2),
    topic('Numbers from 1 to 5', 2, 3),
    topic('Numbers from 6 to 9', 3, 4),
  ]

  it('deals pending topics across upcoming periods in plan order', () => {
    const occ = occurrencesFrom(TT, MON, 7)
    const plan = projectPlan(PLAN, occ)
    expect(plan.get(occ[0].key)?.topic.topic).toBe('Shapes')
    expect(plan.get(occ[1].key)?.topic.topic).toBe('Numbers from 1 to 5')
    expect(plan.get(occ[2].key)?.topic.topic).toBe('Numbers from 6 to 9')
  })

  it('gives tomorrow a different topic from today — the whole point', () => {
    const occ = occurrencesFrom(TT, MON, 7)
    const today = occ.filter(o => o.date.getDate() === 3)
    const tomorrow = occ.filter(o => o.date.getDate() === 4)
    const plan = projectPlan(PLAN, occ)
    expect(plan.get(tomorrow[0].key)?.topic.topic)
      .not.toBe(plan.get(today[0].key)?.topic.topic)
  })

  it('skips anything already taught', () => {
    const occ = occurrencesFrom(TT, MON, 7)
    const assigned = [...projectPlan(PLAN, occ).values()].map(p => p.topic.topic)
    expect(assigned).not.toContain('Pre-Mathematical Concepts')
  })

  it('holds a topic for as many periods as its session estimate', () => {
    const plan = [topic('Shapes', 0, 1, false, 3), topic('Numbers', 1, 2)]
    const occ = occurrencesFrom(TT, MON, 7)
    const projected = projectPlan(plan, occ)
    expect(projected.get(occ[0].key)).toMatchObject({ session: 1, sessions: 3 })
    expect(projected.get(occ[1].key)).toMatchObject({ session: 2, sessions: 3 })
    expect(projected.get(occ[2].key)).toMatchObject({ session: 3, sessions: 3 })
    expect(projected.get(occ[3].key)?.topic.topic).toBe('Numbers')
  })

  it('treats an unset estimate as one session, not zero or forever', () => {
    // An unset estimate swallowing the week, or looping, is the failure mode.
    const occ = occurrencesFrom(TT, MON, 7)
    const projected = projectPlan([topic('A', 0, 1), topic('B', 1, 2)], occ)
    expect(projected.get(occ[0].key)?.topic.topic).toBe('A')
    expect(projected.get(occ[1].key)?.topic.topic).toBe('B')
  })

  it('leaves periods past the end of the plan unassigned', () => {
    const occ = occurrencesFrom(TT, MON, 7)
    const projected = projectPlan([topic('Only', 0, 1)], occ)
    expect(projected.size).toBe(1)
    expect(projected.get(occ[1].key)).toBeUndefined()
  })

  it('assigns nothing when the syllabus is finished', () => {
    const done = PLAN.map(t => ({ ...t, isCompleted: true }))
    expect(projectPlan(done, occurrencesFrom(TT, MON, 7)).size).toBe(0)
  })
})

describe('weekProgress', () => {
  const PLAN = [topic('a', 0, 1, true), topic('b', 1, 2, true), topic('c', 2, 3)]

  it('counts taught against total', () => {
    expect(weekProgress(PLAN, MON, '2026-08-01')).toMatchObject({ taught: 2, total: 3 })
  })

  it('numbers the academic week from the year start', () => {
    expect(weekProgress(PLAN, MON, '2026-08-01').week).toBe(1)
    expect(weekProgress(PLAN, addDays(MON, 7), '2026-08-01').week).toBe(2)
  })

  it('has no week before the year begins, rather than week 0 or a negative', () => {
    expect(weekProgress(PLAN, new Date(2026, 6, 1), '2026-08-01').week).toBeNull()
    expect(weekProgress(PLAN, MON, undefined).week).toBeNull()
  })
})
