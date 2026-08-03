/**
 * Student login codes. These are the *entire* credential for the student portal
 * (no password), printed onto rosters and read back by children, so both the
 * character set and the shape are load-bearing.
 */

import { describe, it, expect } from 'vitest'
import { genStudentCode } from '@/lib/studentCode'

const SAMPLE = Array.from({ length: 2000 }, () => genStudentCode())

describe('genStudentCode', () => {
  it('starts with the ST prefix and is 8 characters long', () => {
    for (const code of SAMPLE) {
      expect(code).toMatch(/^ST/)
      expect(code).toHaveLength(8)
    }
  })

  it('matches the documented STABCD23 shape', () => {
    for (const code of SAMPLE) {
      expect(code).toMatch(/^ST[A-HJ-NP-Z2-9]{6}$/)
    }
  })

  it('omits characters that are easy to misread aloud or by hand', () => {
    // 0/O and 1/I are excluded from the alphabet on purpose
    for (const code of SAMPLE) {
      expect(code.slice(2)).not.toMatch(/[01OI]/)
    }
  })

  it('is uppercase only', () => {
    for (const code of SAMPLE) {
      expect(code).toBe(code.toUpperCase())
    }
  })

  it('draws from the full 32-character alphabet', () => {
    // Guards against a truncated charset silently shrinking the keyspace
    const used = new Set(SAMPLE.flatMap(c => c.slice(2).split('')))
    expect(used.size).toBe(32)
  })

  it('does not collide within a school-sized batch', () => {
    // A whole school is a few thousand students; the caller retries on collision,
    // but the generator itself should make that path rare.
    expect(new Set(SAMPLE).size).toBe(SAMPLE.length)
  })

  it('is not deterministic', () => {
    expect(genStudentCode()).not.toBe(genStudentCode())
  })
})
