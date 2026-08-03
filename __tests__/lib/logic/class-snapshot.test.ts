/**
 * The four numbers the schedule card shows per class.
 *
 * The distinction worth pinning is null vs 0: a class nobody has registered or
 * assessed yet must not render as 0% attendance or 0% mastery, because that
 * reads as a catastrophe rather than an absence of data.
 */

import { describe, it, expect } from 'vitest'
import { classSnapshot } from '@/lib/logic/class-snapshot'
import type { Attendance, Student, TopicMastery, Warning } from '@/lib/types'

const student = (id: string, classId: string, isActive = true): Student => ({
  id, teacherId: 't1', classId, name: id, rollNumber: id, isActive, interests: [], goal: '',
})

const record = (studentId: string, classId: string, status: Attendance['status']): Attendance => ({
  id: `${studentId}-${status}`, sessionId: 's1', studentId, classId,
  syllabusTopicId: 'top1', date: '2026-08-03', status,
})

const score = (studentId: string, mastery: number): TopicMastery => ({
  id: `${studentId}-m`, studentId, topic: 'Counting', subject: 'Mathematics',
  mastery, attempts: 1, lastUpdated: '2026-08-03',
})

const noWarnings = () => [] as Warning[]

describe('classSnapshot', () => {
  const deps = {
    students: [student('a', 'c1'), student('b', 'c1'), student('c', 'c2'), student('d', 'c1', false)],
    attendance: [
      record('a', 'c1', 'present'),
      record('b', 'c1', 'absent'),
      record('c', 'c2', 'present'),
    ],
    mastery: [score('a', 0.8), score('b', 0.4), score('c', 1)],
    getStudentWarnings: noWarnings,
  }

  it('counts only active students in the class', () => {
    // 'd' is inactive and 'c' belongs to another class.
    expect(classSnapshot('c1', deps).students).toBe(2)
  })

  it('scopes attendance to the class', () => {
    // c1 has one present and one absent — c2's record must not count.
    expect(classSnapshot('c1', deps).attendancePct).toBe(50)
  })

  it('counts a late arrival as present', () => {
    const snap = classSnapshot('c1', {
      ...deps,
      attendance: [record('a', 'c1', 'late'), record('b', 'c1', 'present')],
    })
    expect(snap.attendancePct).toBe(100)
  })

  it('averages mastery over the roster and reports it as a percentage', () => {
    // Mastery is stored 0-1; (0.8 + 0.4) / 2 = 0.6.
    expect(classSnapshot('c1', deps).masteryPct).toBe(60)
  })

  it('reaches mastery through the roster, not a class column', () => {
    // c's 1.0 belongs to c2 and must not lift c1's average.
    expect(classSnapshot('c1', deps).masteryPct).not.toBe(73)
  })

  it('reports null, not zero, when nothing has been recorded', () => {
    const snap = classSnapshot('c1', { ...deps, attendance: [], mastery: [] })
    expect(snap.attendancePct).toBeNull()
    expect(snap.masteryPct).toBeNull()
    expect(snap.students).toBe(2)
  })

  it('counts students carrying any warning', () => {
    const warned = (id: string): Warning[] =>
      id === 'a' ? [{ level: 'critical', category: 'absence', reason: 'r', action: 'a' }] : []
    expect(classSnapshot('c1', { ...deps, getStudentWarnings: warned }).needAttention).toBe(1)
  })

  it('handles a class with nobody in it', () => {
    expect(classSnapshot('nope', deps)).toEqual({
      students: 0, attendancePct: null, masteryPct: null, needAttention: 0,
    })
  })
})
