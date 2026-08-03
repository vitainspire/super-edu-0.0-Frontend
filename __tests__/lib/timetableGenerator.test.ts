/**
 * Whole-school timetable generation, driven by shared/parity/timetable-generator.json.
 *
 * The generator shuffles candidate slots, so there is no single correct output to
 * compare against — and no way to compare byte-for-byte with the Python port.
 * Both suites therefore assert the same INVARIANTS, and each scenario is run
 * repeatedly so a rule that only breaks on an unlucky shuffle still fails.
 *
 * backend/tests/test_timetable_generator.py asserts the identical set against
 * backend/app/lib/timetable_generator.py.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  generateSchoolTimetable,
  type ClassInput,
  type LineupItem,
  type AssignmentInput,
  type TeacherCapsInput,
  type GeneratedPeriod,
  type GenerationResult,
} from '@/lib/timetableGenerator'
import type { ScheduleSlot } from '@/lib/types'

const RUNS_PER_SCENARIO = 25

interface Scenario {
  name: string
  workingWeekdays: number[]
  classes: ClassInput[]
  lineup: LineupItem[]
  assignments: AssignmentInput[]
  teacherCaps: TeacherCapsInput[]
  existingPeriods?: GeneratedPeriod[]
  expectFullyPlaced?: boolean
  expectSomeUnplaced?: boolean
  expectKeptCount?: number
  expectTeacherWarnings?: { teacherId: string; requiredPeriods: number; availableSlots: number; overBy: number }[]
}

const FIXTURE = join(__dirname, '../../../shared/parity/timetable-generator.json')
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  slotTemplate: ScheduleSlot[]
  scenarios: Scenario[]
}

const run = (s: Scenario): GenerationResult =>
  generateSchoolTimetable(
    fixture.slotTemplate,
    s.workingWeekdays,
    s.classes,
    s.lineup,
    s.assignments,
    s.teacherCaps,
    s.existingPeriods ?? [],
  )

/** How many periods the lineup asks for, per class. */
function requiredByClass(s: Scenario): Map<string, number> {
  const out = new Map<string, number>()
  for (const cls of s.classes) {
    const total = s.lineup
      .filter(l => l.grade === cls.grade)
      .reduce((sum, l) => sum + Math.max(0, l.periodsPerWeek), 0)
    out.set(cls.classId, total)
  }
  return out
}

describe('generateSchoolTimetable — shared invariants', () => {
  it('has scenarios to run', () => {
    expect(fixture.scenarios.length).toBeGreaterThan(0)
  })

  for (const scenario of fixture.scenarios) {
    describe(scenario.name, () => {
      const validSlots = new Set(
        scenario.workingWeekdays.flatMap(day =>
          fixture.slotTemplate
            .filter(s => s.type === 'period' && s.periodNumber != null)
            .map(s => `${day}|${s.periodNumber}`),
        ),
      )

      it('only ever emits periods that exist in the bell schedule', () => {
        for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
          for (const p of run(scenario).periods) {
            expect(validSlots.has(`${p.dayOfWeek}|${p.periodNumber}`)).toBe(true)
          }
        }
      })

      it('never double-books a class', () => {
        for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
          const seen = new Set<string>()
          for (const p of run(scenario).periods) {
            const key = `${p.classId}|${p.dayOfWeek}|${p.periodNumber}`
            expect(seen.has(key)).toBe(false)
            seen.add(key)
          }
        }
      })

      it('never double-books a teacher', () => {
        for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
          const seen = new Set<string>()
          for (const p of run(scenario).periods) {
            if (!p.teacherId) continue
            const key = `${p.teacherId}|${p.dayOfWeek}|${p.periodNumber}`
            expect(seen.has(key)).toBe(false)
            seen.add(key)
          }
        }
      })

      it('never breaches a teacher\'s daily workload cap', () => {
        const capOf = new Map(scenario.teacherCaps.map(t => [t.teacherId, t.maxPeriodsPerDay]))
        for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
          const perTeacherDay = new Map<string, number>()
          for (const p of run(scenario).periods) {
            if (!p.teacherId) continue
            const key = `${p.teacherId}|${p.dayOfWeek}`
            perTeacherDay.set(key, (perTeacherDay.get(key) ?? 0) + 1)
          }
          for (const [key, count] of perTeacherDay) {
            const cap = capOf.get(key.split('|')[0])
            if (cap != null) expect(count).toBeLessThanOrEqual(cap)
          }
        }
      })

      it('never schedules more periods of a subject than the lineup asks for', () => {
        const gradeOf = new Map(scenario.classes.map(c => [c.classId, c.grade]))
        for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
          const counted = new Map<string, number>()
          for (const p of run(scenario).periods) {
            const key = `${p.classId}|${p.label}`
            counted.set(key, (counted.get(key) ?? 0) + 1)
          }
          for (const [key, count] of counted) {
            const [classId, subject] = key.split('|')
            const wanted = scenario.lineup.find(
              l => l.grade === gradeOf.get(classId) && l.subject === subject,
            )?.periodsPerWeek ?? 0
            expect(count).toBeLessThanOrEqual(wanted)
          }
        }
      })

      it('reconciles placed + kept against the emitted period count', () => {
        for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
          const r = run(scenario)
          expect(r.keptCount + r.placedCount).toBe(r.periods.length)
        }
      })

      it('accounts for every required period as placed, kept, or skipped', () => {
        const required = requiredByClass(scenario)
        for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
          for (const stat of run(scenario).classStats) {
            expect(stat.placed + stat.kept + stat.skipped).toBe(required.get(stat.classId))
          }
        }
      })

      it('reports one unplaced entry per skipped period', () => {
        for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
          const r = run(scenario)
          const skipped = r.classStats.reduce((s, c) => s + c.skipped, 0)
          expect(r.unplaced).toHaveLength(skipped)
          for (const u of r.unplaced) expect(u.reason).toBeTruthy()
        }
      })

      // ── Scenario-specific expectations ────────────────────────────────────

      if (scenario.existingPeriods?.length) {
        it('preserves every pinned period at its exact original slot', () => {
          for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
            const r = run(scenario)
            expect(r.keptCount).toBe(scenario.expectKeptCount)

            // Whatever was kept must appear byte-identical, not merely re-placed
            const kept = r.periods.filter(p =>
              scenario.existingPeriods!.some(e =>
                e.classId === p.classId && e.dayOfWeek === p.dayOfWeek &&
                e.periodNumber === p.periodNumber && e.label === p.label &&
                e.teacherId === p.teacherId,
              ),
            )
            expect(kept).toHaveLength(scenario.expectKeptCount!)
          }
        })
      }

      if (scenario.expectFullyPlaced) {
        it('places every required period', () => {
          for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
            const r = run(scenario)
            expect(r.unplaced).toEqual([])
            for (const stat of r.classStats) expect(stat.skipped).toBe(0)
          }
        })
      }

      if (scenario.expectSomeUnplaced) {
        it('leaves periods unplaced rather than breaching a cap', () => {
          for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
            expect(run(scenario).unplaced.length).toBeGreaterThan(0)
          }
        })
      }

      if (scenario.expectTeacherWarnings) {
        it('reports the expected overload warnings', () => {
          const r = run(scenario)
          for (const expected of scenario.expectTeacherWarnings!) {
            const actual = r.teacherWarnings.find(w => w.teacherId === expected.teacherId)
            expect(actual).toBeDefined()
            expect(actual!.requiredPeriods).toBe(expected.requiredPeriods)
            expect(actual!.availableSlots).toBe(expected.availableSlots)
            expect(actual!.overBy).toBe(expected.overBy)
          }
        })
      }
    })
  }
})

// ── Behaviour not expressible in the shared fixture ───────────────────────────

describe('generateSchoolTimetable — edge cases', () => {
  const slots = fixture.slotTemplate

  it('returns nothing when there are no classes', () => {
    const r = generateSchoolTimetable(slots, [1, 2, 3, 4, 5], [], [], [], [])
    expect(r.periods).toEqual([])
    expect(r.classStats).toEqual([])
    expect(r.keptCount).toBe(0)
    expect(r.placedCount).toBe(0)
  })

  it('returns nothing placeable when there are no working weekdays', () => {
    const r = generateSchoolTimetable(
      slots, [],
      [{ classId: 'c1', className: '1A', grade: '1' }],
      [{ grade: '1', subject: 'Math', periodsPerWeek: 3 }],
      [{ classId: 'c1', subject: 'Math', teacherId: 't1' }],
      [],
    )
    expect(r.periods).toEqual([])
    expect(r.unplaced).toHaveLength(3)
  })

  it('ignores break slots when building the grid', () => {
    const r = generateSchoolTimetable(
      slots, [1],
      [{ classId: 'c1', className: '1A', grade: '1' }],
      [{ grade: '1', subject: 'Math', periodsPerWeek: 6 }],
      [{ classId: 'c1', subject: 'Math', teacherId: 't1' }],
      [],
    )
    // 6 periods/day in the template, 2 breaks — a 7th would mean breaks leaked in
    expect(r.periods).toHaveLength(6)
    expect(r.periods.every(p => p.periodNumber >= 1 && p.periodNumber <= 6)).toBe(true)
  })

  it('still places subjects that have no teacher assigned', () => {
    const r = generateSchoolTimetable(
      slots, [1, 2],
      [{ classId: 'c1', className: '1A', grade: '1' }],
      [{ grade: '1', subject: 'Library', periodsPerWeek: 2, category: 'special' }],
      [],  // nobody assigned
      [],
    )
    expect(r.periods).toHaveLength(2)
    expect(r.periods.every(p => p.teacherId === undefined)).toBe(true)
  })

  it('treats a negative periodsPerWeek as zero rather than looping', () => {
    const r = generateSchoolTimetable(
      slots, [1],
      [{ classId: 'c1', className: '1A', grade: '1' }],
      [{ grade: '1', subject: 'Math', periodsPerWeek: -5 }],
      [{ classId: 'c1', subject: 'Math', teacherId: 't1' }],
      [],
    )
    expect(r.periods).toEqual([])
    expect(r.unplaced).toEqual([])
  })

  it('carries the slot times through onto each generated period', () => {
    const r = generateSchoolTimetable(
      slots, [1],
      [{ classId: 'c1', className: '1A', grade: '1' }],
      [{ grade: '1', subject: 'Math', periodsPerWeek: 6 }],
      [{ classId: 'c1', subject: 'Math', teacherId: 't1' }],
      [],
    )
    for (const p of r.periods) {
      const template = slots.find(s => s.type === 'period' && s.periodNumber === p.periodNumber)!
      expect(p.startTime).toBe(template.startTime)
      expect(p.endTime).toBe(template.endTime)
    }
  })
})
