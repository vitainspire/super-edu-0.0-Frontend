/**
 * Unit tests for the year-plan session apportionment.
 *
 * The bug these exist to pin down: an admin importing a 97-topic syllabus into a
 * year with 165 teaching sessions left saw "847 estimated across topics" — a 5×
 * overshoot. The prompt asked the model for a total of exactly N while also
 * demanding a 5-session floor, which for 97 topics needs 485 sessions on its own.
 * Given contradictory instructions the model followed the concrete per-topic
 * bands ("simple: 8-12, medium: 12-18, complex: 18-25") and ignored the total.
 *
 * The route no longer trusts the model's arithmetic at all: its numbers are
 * relative weights, and apportion() produces the allocation.
 */

import { describe, it, expect } from 'vitest'
import { apportion, affordableMinSessions } from '@/lib/logic/apportion'

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

// The real shape of the reported failure: the 97 model-assigned values that
// summed to 847, against the 165 sessions actually left in the year.
const OBSERVED = [
  5, 8, 8, 12, 12, 8, 8, 8, 8, 5, 5, 12, 12, 8, 5, 15, 5, 12, 8, 8, 8, 12, 15, 5,
  8, 8, 8, 8, 5, 5, 12, 8, 5, 5, 8, 8, 8, 8, 12, 8, 12, 12, 5, 8, 8, 8, 5, 5, 8,
  5, 12, 18, 12, 8, 8, 5, 5, 8, 12, 8, 12, 5, 15, 12, 5, 5, 8, 8, 8, 12, 5, 8, 8,
  8, 8, 8, 5, 5, 12, 12, 5, 12, 12, 15, 15, 8, 12, 5, 5, 8, 12, 12, 5, 12, 15, 12, 5,
]

describe('affordableMinSessions', () => {
  it('lowers an unaffordable floor to what the budget allows', () => {
    // The reported case: a floor of 5 needs 485 sessions, only 165 exist.
    expect(affordableMinSessions(97, 165)).toBe(1)
  })

  it('leaves an affordable floor alone', () => {
    expect(Math.min(5, affordableMinSessions(10, 200))).toBe(5)
  })

  it('returns 0 when there are more topics than sessions', () => {
    expect(affordableMinSessions(200, 50)).toBe(0)
  })

  it('does not divide by zero on an empty syllabus', () => {
    expect(affordableMinSessions(0, 165)).toBe(0)
  })
})

describe('apportion', () => {
  it('fits the reported 847-session overshoot back into the 165 available', () => {
    const min = Math.min(5, affordableMinSessions(OBSERVED.length, 165))
    const out = apportion(OBSERVED, 165, min)

    expect(sum(OBSERVED)).toBe(847)   // what the model returned
    expect(sum(out)).toBe(165)        // what the teacher's year can hold
    expect(Math.min(...out)).toBeGreaterThanOrEqual(1)
  })

  it('never lets a lighter topic outrank a heavier one', () => {
    const out = apportion(OBSERVED, 165, 1)
    for (let a = 0; a < OBSERVED.length; a++) {
      for (let b = 0; b < OBSERVED.length; b++) {
        if (OBSERVED[a] < OBSERVED[b]) expect(out[a]).toBeLessThanOrEqual(out[b])
      }
    }
  })

  it('separates topic sizes cleanly when the budget allows it', () => {
    const out = apportion([5, 8, 12, 15, 18], 580, 5)
    expect(sum(out)).toBe(580)
    // strictly increasing — with room to spare, weight ordering is preserved
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1])
  })

  it.each([
    ['reported case', 97, 165, 5],
    ['tiny syllabus', 3, 100, 5],
    ['exactly one session each', 10, 10, 5],
    ['more topics than sessions', 200, 50, 5],
    ['single topic takes everything', 1, 7, 5],
  ])('sums to the budget exactly: %s', (_label, n, total, wantMin) => {
    const weights = Array.from({ length: n }, (_, i) => 1 + (i % 4))
    const min = Math.min(wantMin, affordableMinSessions(n, total))
    const out = apportion(weights, total, min)

    expect(sum(out)).toBe(total)
    expect(out).toHaveLength(n)
    expect(Math.min(...out)).toBeGreaterThanOrEqual(min)
  })

  it('falls back to an even split when the model returns no usable weights', () => {
    const out = apportion([0, 0, 0, 0], 20, 1)
    expect(sum(out)).toBe(20)
    expect(out).toEqual([5, 5, 5, 5])
  })

  it('ignores NaN and negative weights rather than corrupting the total', () => {
    const out = apportion([NaN, -3, 10, 5], 40, 1)
    expect(sum(out)).toBe(40)
    expect(out.every(v => Number.isInteger(v) && v >= 1)).toBe(true)
  })

  it('returns nothing for an empty syllabus', () => {
    expect(apportion([], 165, 1)).toEqual([])
  })
})
