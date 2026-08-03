/**
 * The local (no-LLM) graders. These decide real marks on scanned papers with no
 * human in the loop for MCQ/fill-in-blank/short-answer, so their thresholds are
 * a contract worth pinning down.
 */

import { describe, it, expect } from 'vitest'
import { gradeMcq, gradeFib, gradeShortAnswer } from '@/lib/graders'

// ── MCQ ───────────────────────────────────────────────────────────────────────

describe('gradeMcq', () => {
  it('awards full marks for the correct letter', () => {
    expect(gradeMcq('C', 'C', 5)).toEqual({ marksAwarded: 5, feedback: 'Correct' })
  })

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(gradeMcq('  c  ', 'C', 5).marksAwarded).toBe(5)
    expect(gradeMcq('C', 'c', 5).marksAwarded).toBe(5)
  })

  it.each([
    ['c.', 'trailing period'],
    ['(C)', 'parenthesised'],
    ['c)', 'bracket suffix'],
    ['C. Earth', 'letter plus the option text'],
    ['option c', 'prefixed with "option"'],
    ['Ans: C', 'prefixed with a label'],
  ])('extracts the letter from %j (%s)', (scanned) => {
    expect(gradeMcq(scanned, 'C', 5).marksAwarded).toBe(5)
  })

  it('awards zero for a wrong letter and names the right one', () => {
    expect(gradeMcq('B', 'C', 5)).toEqual({
      marksAwarded: 0,
      feedback: 'Incorrect — answer is C',
    })
  })

  it('reports a blank answer distinctly from a wrong one', () => {
    expect(gradeMcq('', 'C', 5)).toEqual({ marksAwarded: 0, feedback: 'No answer written' })
    expect(gradeMcq('   ', 'C', 5).feedback).toBe('No answer written')
  })

  it('reports an unreadable answer when no A–D letter is present at all', () => {
    expect(gradeMcq('???', 'C', 5)).toEqual({ marksAwarded: 0, feedback: 'Answer not readable' })
    expect(gradeMcq('42', 'C', 5).feedback).toBe('Answer not readable')
  })

  it('never awards partial credit', () => {
    for (const scanned of ['A', 'B', 'C', 'D', 'zzz']) {
      expect([0, 5]).toContain(gradeMcq(scanned, 'C', 5).marksAwarded)
    }
  })

  /**
   * Characterisation test, not an endorsement. With no standalone A–D letter the
   * grader falls back to the first A–D character *anywhere* in the string, so a
   * student who writes the option text instead of its letter gets scored on an
   * incidental letter ("EARTH" → "A"). Worth revisiting; pinned here so the
   * behaviour can't change unnoticed.
   */
  it('falls back to any embedded A–D character when no standalone letter exists', () => {
    expect(gradeMcq('EARTH', 'A', 5).marksAwarded).toBe(5)   // matched the "A" inside EARTH
    expect(gradeMcq('EARTH', 'C', 5).marksAwarded).toBe(0)
  })
})

// ── Fill in the blank ─────────────────────────────────────────────────────────

describe('gradeFib', () => {
  it('awards full marks for an exact match', () => {
    expect(gradeFib('photosynthesis', 'photosynthesis', 4)).toEqual({
      marksAwarded: 4,
      feedback: 'Correct',
    })
  })

  it('ignores case, surrounding space, and punctuation', () => {
    expect(gradeFib('  Photosynthesis!  ', 'photosynthesis', 4).marksAwarded).toBe(4)
    expect(gradeFib('H2O', 'h2o', 4).marksAwarded).toBe(4)
  })

  it('forgives a minor spelling or OCR slip', () => {
    const r = gradeFib('photosynthisis', 'photosynthesis', 4)
    expect(r.marksAwarded).toBe(4)
    expect(r.feedback).toBe('Correct (minor spelling)')
  })

  it('allows at least two characters of slack even on very short answers', () => {
    // threshold is max(2, 20% of length), so short answers aren't held to 0 slack
    expect(gradeFib('cel', 'cell', 4).marksAwarded).toBe(4)
  })

  it('awards half marks when the answer merely contains the expected one', () => {
    const r = gradeFib('the mitochondria organelle', 'mitochondria', 4)
    expect(r.marksAwarded).toBe(2)
    expect(r.feedback).toBe('Partially correct')
  })

  it('awards zero for an unrelated answer and echoes the expected one', () => {
    expect(gradeFib('apple', 'mitochondria', 4)).toEqual({
      marksAwarded: 0,
      feedback: 'Incorrect — answer: mitochondria',
    })
  })

  it('reports a blank answer', () => {
    expect(gradeFib('', 'mitochondria', 4)).toEqual({
      marksAwarded: 0,
      feedback: 'No answer written',
    })
  })

  it('gives benefit of the doubt when no expected answer was stored', () => {
    expect(gradeFib('anything', '', 4)).toEqual({
      marksAwarded: 2,
      feedback: 'Could not verify',
    })
  })

  it('rounds half marks rather than emitting fractions', () => {
    // 5 marks → 2.5 → 3; marks are stored as integers
    expect(gradeFib('the mitochondria organelle', 'mitochondria', 5).marksAwarded).toBe(3)
    expect(Number.isInteger(gradeFib('x', '', 5).marksAwarded)).toBe(true)
  })
})

// ── Short answer ──────────────────────────────────────────────────────────────

describe('gradeShortAnswer', () => {
  const KEYWORDS = ['sunlight', 'chlorophyll', 'carbon dioxide', 'glucose']

  it('awards full marks at 75% keyword coverage or above', () => {
    const r = gradeShortAnswer('Uses sunlight and chlorophyll to turn carbon dioxide into food', KEYWORDS, 8)
    expect(r.marksAwarded).toBe(8)
    expect(r.feedback).toBe('Key concepts present')
  })

  it('awards 60% at half coverage', () => {
    const r = gradeShortAnswer('Needs sunlight and chlorophyll', KEYWORDS, 8)
    expect(r.marksAwarded).toBe(5) // round(8 * 0.6) = 5
    expect(r.feedback).toBe('Most key concepts present')
  })

  it('awards 25% at quarter coverage', () => {
    const r = gradeShortAnswer('Plants need sunlight', KEYWORDS, 8)
    expect(r.marksAwarded).toBe(2) // round(8 * 0.25) = 2
    expect(r.feedback).toBe('Few key concepts mentioned')
  })

  it('awards zero when no key concept appears', () => {
    expect(gradeShortAnswer('Plants are green and pretty', KEYWORDS, 8)).toEqual({
      marksAwarded: 0,
      feedback: 'Key concepts missing',
    })
  })

  it('matches keywords case-insensitively and ignores punctuation', () => {
    expect(gradeShortAnswer('SUNLIGHT, CHLOROPHYLL, CARBON DIOXIDE and GLUCOSE!', KEYWORDS, 8).marksAwarded).toBe(8)
  })

  it('reports a blank answer', () => {
    expect(gradeShortAnswer('', KEYWORDS, 8)).toEqual({
      marksAwarded: 0,
      feedback: 'No answer written',
    })
  })

  it('gives benefit of the doubt when no keywords were stored', () => {
    const r = gradeShortAnswer('a thoughtful answer', [], 8)
    expect(r.marksAwarded).toBe(4)
    expect(r.feedback).toBe('Partially awarded — no key terms to verify against')
  })

  it('never exceeds the maximum marks', () => {
    for (const answer of ['', 'sunlight', 'sunlight chlorophyll carbon dioxide glucose']) {
      expect(gradeShortAnswer(answer, KEYWORDS, 8).marksAwarded).toBeLessThanOrEqual(8)
    }
  })
})
