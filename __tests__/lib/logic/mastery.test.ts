/**
 * Mastery scoring. This number drives at-risk warnings, catch-up plans and the
 * student-facing progress view, so its recency weighting and its clamping
 * behaviour both matter.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateMastery,
  getMasteryLabel,
  getMasteryColor,
  getMasteryBarColor,
} from '@/lib/logic/mastery'

describe('calculateMastery', () => {
  it('returns 0 with no attempts', () => {
    expect(calculateMastery([], [])).toBe(0)
  })

  it('is the plain ratio for a single attempt', () => {
    expect(calculateMastery([5], [10])).toBe(0.5)
    expect(calculateMastery([10], [10])).toBe(1)
    expect(calculateMastery([0], [10])).toBe(0)
  })

  it('weights later attempts more heavily than earlier ones', () => {
    // Same two scores, opposite order. Improving must outrank declining.
    const improving = calculateMastery([5, 10], [10, 10])
    const declining = calculateMastery([10, 5], [10, 10])

    expect(improving).toBeGreaterThan(declining)
    // 1.5^i weights → (0.5*1 + 1.0*1.5) / 2.5 = 0.8
    expect(improving).toBeCloseTo(0.8, 10)
    expect(declining).toBeCloseTo(0.7, 10)
  })

  it('rates an improving student above their unweighted average', () => {
    const unweightedAvg = (0.5 + 1.0) / 2
    expect(calculateMastery([5, 10], [10, 10])).toBeGreaterThan(unweightedAvg)
  })

  it('clamps to 1 when a student scores above the total (bonus marks)', () => {
    expect(calculateMastery([20], [10])).toBe(1)
  })

  it('always returns a value within 0..1', () => {
    const cases: [number[], number[]][] = [
      [[0], [10]],
      [[3, 7, 9], [10, 10, 10]],
      [[10, 10, 10, 10, 10], [10, 10, 10, 10, 10]],
      [[50], [40]],
    ]
    for (const [scores, totals] of cases) {
      const m = calculateMastery(scores, totals)
      expect(m).toBeGreaterThanOrEqual(0)
      expect(m).toBeLessThanOrEqual(1)
    }
  })

  // ── Guards against divide-by-zero producing a *perfect* score ───────────────

  it('ignores an attempt whose total marks are zero', () => {
    // Would otherwise be 0/0 → NaN, or clamp to a perfect 1.0
    expect(calculateMastery([0], [0])).toBe(0)
    expect(calculateMastery([5], [0])).toBe(0)
  })

  it('ignores an attempt with no matching total, rather than returning NaN', () => {
    // scores longer than totalMarks — totalMarks[1] is undefined
    const m = calculateMastery([5, 8], [10])
    expect(Number.isNaN(m)).toBe(false)
    expect(m).toBe(0.5) // scored on the one valid attempt
  })

  it('scores the valid attempts when only some are unusable', () => {
    expect(calculateMastery([5, 9], [0, 10])).toBe(0.9)
  })

  it('never returns NaN for any degenerate input', () => {
    const degenerate: [number[], number[]][] = [
      [[], []],
      [[5], []],
      [[5], [0]],
      [[0], [0]],
      [[1, 2, 3], [0, 0, 0]],
    ]
    for (const [scores, totals] of degenerate) {
      expect(Number.isNaN(calculateMastery(scores, totals))).toBe(false)
    }
  })
})

// ── Presentation banding ──────────────────────────────────────────────────────

describe('getMasteryLabel', () => {
  it.each([
    [0, 'No data'],
    [0.2, 'Needs Help'],
    [0.49, 'Needs Help'],
    [0.5, 'Improving'],
    [0.74, 'Improving'],
    [0.75, 'Strong'],
    [1, 'Strong'],
  ])('labels %d as %s', (mastery, expected) => {
    expect(getMasteryLabel(mastery)).toBe(expected)
  })

  it('treats exactly 0 as "no data" rather than the worst band', () => {
    // 0 means "never assessed" in this codebase, not "scored nothing"
    expect(getMasteryLabel(0)).toBe('No data')
    expect(getMasteryLabel(0.01)).toBe('Needs Help')
  })
})

describe('mastery colour helpers', () => {
  it('band the same way as the label does', () => {
    const bandOf = (m: number) => getMasteryLabel(m)
    const samples = [0, 0.1, 0.49, 0.5, 0.74, 0.75, 1]

    // Every distinct label must map to a distinct colour pair, and vice versa —
    // a mismatch here means a badge and its bar could disagree.
    const byBand = new Map<string, Set<string>>()
    for (const m of samples) {
      const key = bandOf(m)
      if (!byBand.has(key)) byBand.set(key, new Set())
      byBand.get(key)!.add(`${getMasteryColor(m)}::${getMasteryBarColor(m)}`)
    }
    for (const [, colours] of byBand) expect(colours.size).toBe(1)
    expect(new Set([...byBand.values()].map(s => [...s][0])).size).toBe(byBand.size)
  })
})
