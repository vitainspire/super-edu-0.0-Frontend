/**
 * Substitute-finder behaviour, driven by shared/parity/substitute-finder.json.
 *
 * The same fixture drives backend/tests/test_substitute_finder_parity.py against
 * the Python port in backend/app/lib/substitute_finder.py. Add cases to the
 * fixture, not here, so both implementations stay pinned to one spec.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  findSubstitute,
  suggestSwap,
  type SubstituteCandidate,
  type SubstituteNeed,
  type ClassPeriod,
} from '@/lib/substituteFinder'

// ── Fixture ───────────────────────────────────────────────────────────────────

interface RawCandidate {
  teacherId: string
  name: string
  subjectsTaught: string[]
  busySlots: string[]
  maxPeriodsPerDay?: number | null
  maxPeriodsPerWeek?: number | null
  weeklyLoad: number
}

interface FindCase {
  name: string
  need: SubstituteNeed
  candidates: RawCandidate[]
  excludeTeacherIds?: string[]
  alreadyUsedThisSlot?: string[]
  requireSubjectMatch?: boolean
  expected: string | null
}

interface SwapCase {
  name: string
  need: SubstituteNeed
  classPeriodsThatDay: ClassPeriod[]
  candidates: RawCandidate[]
  excludeTeacherIds?: string[]
  alreadyUsedThisSlot?: Record<string, string[]>
  expected: {
    swapPeriodNumber: number
    swapSubject: string
    movingTeacherId: string
    freeingTeacherId: string
  } | null
}

const FIXTURE = join(__dirname, '../../../shared/parity/substitute-finder.json')
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  findSubstitute: FindCase[]
  suggestSwap: SwapCase[]
}

/**
 * A nullable cap column arrives from Postgres as `null`, and an unset one as
 * `undefined`. Both mean "no cap" — the fixture covers each, and hydration here
 * deliberately preserves the distinction rather than normalising it away, so
 * the implementation is what's under test.
 */
function hydrate(c: RawCandidate): SubstituteCandidate {
  const candidate = {
    teacherId: c.teacherId,
    name: c.name,
    subjectsTaught: new Set(c.subjectsTaught),
    busySlots: new Set(c.busySlots),
    weeklyLoad: c.weeklyLoad,
  } as SubstituteCandidate

  if ('maxPeriodsPerDay' in c) candidate.maxPeriodsPerDay = c.maxPeriodsPerDay as number
  if ('maxPeriodsPerWeek' in c) candidate.maxPeriodsPerWeek = c.maxPeriodsPerWeek as number
  return candidate
}

// ── findSubstitute ────────────────────────────────────────────────────────────

describe('findSubstitute (shared parity fixture)', () => {
  it('has cases to run', () => {
    expect(fixture.findSubstitute.length).toBeGreaterThan(0)
  })

  for (const c of fixture.findSubstitute) {
    it(c.name, () => {
      const actual = findSubstitute(
        c.need,
        c.candidates.map(hydrate),
        new Set(c.excludeTeacherIds ?? []),
        new Set(c.alreadyUsedThisSlot ?? []),
        c.requireSubjectMatch ?? true,
      )
      expect(actual).toBe(c.expected)
    })
  }
})

// ── suggestSwap ───────────────────────────────────────────────────────────────

describe('suggestSwap (shared parity fixture)', () => {
  it('has cases to run', () => {
    expect(fixture.suggestSwap.length).toBeGreaterThan(0)
  })

  for (const c of fixture.suggestSwap) {
    it(c.name, () => {
      const usedBySlot = c.alreadyUsedThisSlot ?? {}
      const actual = suggestSwap(
        c.need,
        c.classPeriodsThatDay,
        c.candidates.map(hydrate),
        new Set(c.excludeTeacherIds ?? []),
        (periodNumber: number) => new Set(usedBySlot[String(periodNumber)] ?? []),
      )
      expect(actual).toEqual(c.expected)
    })
  }
})
