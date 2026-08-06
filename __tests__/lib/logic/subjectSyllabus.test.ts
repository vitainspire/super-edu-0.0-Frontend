/**
 * Subject scoping for syllabus reads — a class holds every subject's topics, so
 * an unscoped read shows the EVS syllabus on a Maths screen.
 */

import { describe, it, expect } from 'vitest'
import {
  filterTopicsBySubject, deriveClassSubjects, subjectFamily, normalizeSubject,
} from '@/lib/logic/subjectSyllabus'

interface Row { id: string; subject?: string; topic: string }

const MATHS: Row = { id: 'm1', subject: 'Mathematics', topic: 'Fractions' }
const MATHS_2 = { id: 'm2', subject: 'Mathematics', topic: 'Large Numbers' }
const EVS = { id: 'e1', subject: 'EVS', topic: 'Plants Around Us' }
const ENGLISH = { id: 'l1', subject: 'English', topic: 'The Kind Crow' }
const ALL = [MATHS, EVS, MATHS_2, ENGLISH]

describe('filterTopicsBySubject', () => {
  it('keeps only the asked-for subject', () => {
    expect(filterTopicsBySubject(ALL, 'Mathematics')).toEqual([MATHS, MATHS_2])
    expect(filterTopicsBySubject(ALL, 'EVS')).toEqual([EVS])
  })

  it('preserves the order it was given', () => {
    expect(filterTopicsBySubject([MATHS_2, MATHS], 'Mathematics')).toEqual([MATHS_2, MATHS])
  })

  it('ignores case and surrounding whitespace', () => {
    expect(filterTopicsBySubject(ALL, '  mathematics ')).toEqual([MATHS, MATHS_2])
    expect(filterTopicsBySubject([{ id: 'x', subject: ' First  Language ' }], 'first language'))
      .toHaveLength(1)
  })

  it('accepts several subjects — a teacher can hold two in one class', () => {
    expect(filterTopicsBySubject(ALL, ['Mathematics', 'English'])).toEqual([MATHS, MATHS_2, ENGLISH])
  })

  it('returns everything when no subject is asked for', () => {
    expect(filterTopicsBySubject(ALL)).toEqual(ALL)
    expect(filterTopicsBySubject(ALL, [])).toEqual(ALL)
    expect(filterTopicsBySubject(ALL, '   ')).toEqual(ALL)
    expect(filterTopicsBySubject(ALL, null)).toEqual(ALL)
  })

  it('returns everything when no row is tagged at all (legacy single-subject data)', () => {
    const untagged: Row[] = [{ id: 'a', topic: 'Fractions' }, { id: 'b', topic: 'Shapes' }]
    expect(filterTopicsBySubject(untagged, 'Mathematics')).toEqual(untagged)
  })

  it('drops untagged rows once any row in the class is tagged', () => {
    const mixed: Row[] = [MATHS, { id: 'u1', topic: 'Stray untagged topic' }]
    expect(filterTopicsBySubject(mixed, 'Mathematics')).toEqual([MATHS])
  })

  it('falls back to the same subject family on a naming mismatch', () => {
    expect(filterTopicsBySubject(ALL, 'Maths')).toEqual([MATHS, MATHS_2])
    expect(filterTopicsBySubject(ALL, 'Environmental Studies')).toEqual([EVS])
    expect(filterTopicsBySubject(ALL, 'Telugu')).toEqual([ENGLISH])
  })

  it('returns nothing rather than another subject when the subject has no syllabus', () => {
    // The honest answer for a Maths period in a class that only has EVS topics.
    expect(filterTopicsBySubject([EVS], 'Mathematics')).toEqual([])
    // An unrecognised subject has no family to fall back on, so it never
    // borrows another subject's topics.
    expect(filterTopicsBySubject(ALL, 'Drawing')).toEqual([])
  })
})

describe('subjectFamily', () => {
  it('routes maths before the science net', () => {
    expect(subjectFamily('Mathematics')).toBe('math')
    expect(subjectFamily('Maths')).toBe('math')
    expect(subjectFamily('గణితం')).toBe('math')
  })

  it('groups EVS with science and social', () => {
    expect(subjectFamily('EVS')).toBe('evs')
    expect(subjectFamily('Environmental Studies')).toBe('evs')
    expect(subjectFamily('Social Studies')).toBe('evs')
    expect(subjectFamily('General Science')).toBe('evs')
  })

  it('groups first languages with English', () => {
    expect(subjectFamily('English')).toBe('language')
    expect(subjectFamily('Telugu')).toBe('language')
    expect(subjectFamily('First Language')).toBe('language')
  })

  it('reports anything else — and empty input — as other', () => {
    expect(subjectFamily('Drawing')).toBe('other')
    expect(subjectFamily('')).toBe('other')
    expect(subjectFamily(undefined)).toBe('other')
  })
})

describe('deriveClassSubjects', () => {
  const assignments = [
    { classId: 'c1', subject: 'Mathematics' },
    { classId: 'c2', subject: 'EVS' },
    { classId: 'c1', subject: undefined },
  ]
  const timetable = [
    { classId: 'c1', label: 'Mathematics' },
    { classId: 'c1', label: 'EVS' },
    { classId: 'c2', label: 'EVS' },
    { classId: 'c1', label: undefined },
  ]

  it('unions the subject assignment and the timetable labels for that class', () => {
    expect(deriveClassSubjects('c1', assignments, timetable)).toEqual(['Mathematics', 'EVS'])
  })

  it('dedupes on normalized name, keeping the first spelling seen', () => {
    expect(deriveClassSubjects('c1', [{ classId: 'c1', subject: 'Mathematics' }], [
      { classId: 'c1', label: ' mathematics ' },
    ])).toEqual(['Mathematics'])
  })

  it('is empty when nothing names a subject — callers read that as "do not filter"', () => {
    expect(deriveClassSubjects('c3', assignments, timetable)).toEqual([])
    expect(deriveClassSubjects('c1', [{ classId: 'c1', subject: '  ' }], [{ classId: 'c1', label: '' }]))
      .toEqual([])
  })
})

describe('normalizeSubject', () => {
  it('trims, lowercases, and collapses inner whitespace', () => {
    expect(normalizeSubject('  First   Language  ')).toBe('first language')
    expect(normalizeSubject(undefined)).toBe('')
    expect(normalizeSubject(null)).toBe('')
  })
})
