/**
 * Syllabus pacing — "are we ahead or behind for this point in the year".
 *
 * getCurrentWeek reads the wall clock, so these tests pin the system time.
 * Dates are constructed with the local-time Date constructor to match the way
 * getCurrentWeek parses academicYearStart (`+ 'T00:00:00'`, i.e. local), which
 * keeps the arithmetic timezone-independent.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getCurrentWeek, computePacing } from '@/lib/logic/pacing'
import type { SyllabusTopic } from '@/lib/types'

const YEAR_START = '2025-01-01'

// 2025-03-07 12:00 local = 65.5 days after 2025-01-01 00:00 local → week 10
const NOW = new Date(2025, 2, 7, 12, 0, 0)
const EXPECTED_WEEK = 10

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

function topics(count: number, opts: { completed?: number; weekNumbers?: boolean } = {}): SyllabusTopic[] {
  const { completed = 0, weekNumbers = false } = opts
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    classId: 'class-1',
    topic: `Topic ${i + 1}`,
    description: '',
    orderIndex: i,
    isCompleted: i < completed,
    createdAt: YEAR_START,
    ...(weekNumbers ? { weekNumber: i + 1 } : {}),
  }))
}

// ── getCurrentWeek ────────────────────────────────────────────────────────────

describe('getCurrentWeek', () => {
  it('returns null when no academic year start is configured', () => {
    expect(getCurrentWeek(undefined)).toBeNull()
  })

  it('returns null when the academic year has not started yet', () => {
    expect(getCurrentWeek('2025-09-01')).toBeNull()
  })

  it('counts the opening week as week 1, not week 0', () => {
    vi.setSystemTime(new Date(2025, 0, 1, 9, 0, 0))
    expect(getCurrentWeek(YEAR_START)).toBe(1)

    vi.setSystemTime(new Date(2025, 0, 6, 9, 0, 0)) // 5 days in — still week 1
    expect(getCurrentWeek(YEAR_START)).toBe(1)
  })

  it('rolls to the next week after each full 7 days', () => {
    vi.setSystemTime(new Date(2025, 0, 8, 9, 0, 0)) // 7 days in
    expect(getCurrentWeek(YEAR_START)).toBe(2)

    vi.setSystemTime(new Date(2025, 0, 15, 9, 0, 0)) // 14 days in
    expect(getCurrentWeek(YEAR_START)).toBe(3)
  })

  it('computes the week used by the rest of this suite', () => {
    expect(getCurrentWeek(YEAR_START)).toBe(EXPECTED_WEEK)
  })
})

// ── computePacing: guards ─────────────────────────────────────────────────────

describe('computePacing — insufficient input', () => {
  it('returns null with no topics', () => {
    expect(computePacing(YEAR_START, [])).toBeNull()
  })

  it('returns null with no academic year start', () => {
    expect(computePacing(undefined, topics(10))).toBeNull()
  })

  it('returns null before the academic year begins', () => {
    expect(computePacing('2025-09-01', topics(10))).toBeNull()
  })
})

// ── computePacing: even distribution across a 36-week year ────────────────────

describe('computePacing — no per-topic week numbers (even 36-week spread)', () => {
  it('is on-track when completed matches the expected share of the year', () => {
    // week 10 of 36, 36 topics → expect round(10/36 * 36) = 10 done
    const r = computePacing(YEAR_START, topics(36, { completed: 10 }))!
    expect(r.currentWeek).toBe(EXPECTED_WEEK)
    expect(r.status).toBe('on-track')
    expect(r.weeksAhead).toBe(0)
    expect(r.completedCount).toBe(10)
    expect(r.totalCount).toBe(36)
  })

  it('is behind when fewer topics are done than expected', () => {
    const r = computePacing(YEAR_START, topics(36, { completed: 4 }))!
    expect(r.status).toBe('behind')
    expect(r.weeksAhead).toBe(-6)
  })

  it('is ahead when more topics are done than expected', () => {
    const r = computePacing(YEAR_START, topics(36, { completed: 15 }))!
    expect(r.status).toBe('ahead')
    expect(r.weeksAhead).toBe(5)
  })

  it('reports completion as a 0..1 fraction', () => {
    const r = computePacing(YEAR_START, topics(36, { completed: 9 }))!
    expect(r.completionPct).toBeCloseTo(0.25, 10)
  })

  it('names both the topic we should be on and the one we actually reached', () => {
    const r = computePacing(YEAR_START, topics(36, { completed: 4 }))!
    expect(r.expectedTopicName).toBe('Topic 10')
    expect(r.actualTopicName).toBe('Topic 4')
  })

  it('reports no actual topic when nothing is completed', () => {
    const r = computePacing(YEAR_START, topics(36, { completed: 0 }))!
    expect(r.actualTopicName).toBeNull()
    expect(r.status).toBe('behind')
  })

  it('never expects more topics than exist', () => {
    vi.setSystemTime(new Date(2025, 11, 31, 12, 0, 0)) // deep into / past the year
    const r = computePacing(YEAR_START, topics(10, { completed: 10 }))!
    expect(r.completedCount).toBeLessThanOrEqual(r.totalCount)
    expect(r.status).toBe('on-track')
    expect(r.weeksAhead).toBe(0)
  })
})

// ── computePacing: explicit per-topic week numbers ────────────────────────────

describe('computePacing — explicit weekNumber per topic', () => {
  it('expects exactly the topics scheduled up to the current week', () => {
    // weekNumbers 1..20; week 10 → 10 expected
    const r = computePacing(YEAR_START, topics(20, { completed: 10, weekNumbers: true }))!
    expect(r.status).toBe('on-track')
    expect(r.weeksAhead).toBe(0)
  })

  it('flags behind against the scheduled plan', () => {
    const r = computePacing(YEAR_START, topics(20, { completed: 3, weekNumbers: true }))!
    expect(r.status).toBe('behind')
    expect(r.weeksAhead).toBe(-7)
  })

  it('reports not-started when nothing is due and nothing is done', () => {
    // every topic scheduled well after the current week
    const late = topics(5).map(t => ({ ...t, weekNumber: 30 }))
    const r = computePacing(YEAR_START, late)!
    expect(r.status).toBe('not-started')
    expect(r.completedCount).toBe(0)
  })

  it('orders topics by weekNumber, not by insertion order', () => {
    const scrambled: SyllabusTopic[] = [
      { ...topics(1)[0], id: 'c', topic: 'Third', orderIndex: 0, weekNumber: 3, isCompleted: false },
      { ...topics(1)[0], id: 'a', topic: 'First', orderIndex: 1, weekNumber: 1, isCompleted: true },
      { ...topics(1)[0], id: 'b', topic: 'Second', orderIndex: 2, weekNumber: 2, isCompleted: true },
    ]
    const r = computePacing(YEAR_START, scrambled)!
    // 2 of 3 done, all 3 due by week 10 → behind by 1, reached "Second"
    expect(r.actualTopicName).toBe('Second')
    expect(r.expectedTopicName).toBe('Third')
    expect(r.weeksAhead).toBe(-1)
  })
})
