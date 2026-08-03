/**
 * Per-student topic coverage classification — the 8-way bucket that decides
 * whether a student is shown as mastered, struggling, or in need of a catch-up
 * plan for a given syllabus topic.
 */

import { describe, it, expect } from 'vitest'
import { computeTopicCoverage } from '@/lib/logic/coverage'
import type { Session, Attendance, SyllabusTopic, TopicMastery } from '@/lib/types'

const STUDENT = 'stu-1'

const TOPIC: SyllabusTopic = {
  id: 'topic-1',
  classId: 'class-1',
  topic: 'Fractions',
  description: '',
  orderIndex: 0,
  isCompleted: false,
  createdAt: '2025-01-01',
}

function session(id: string, date: string): Session {
  return {
    id,
    classId: 'class-1',
    teacherId: 'teacher-1',
    syllabusTopicId: TOPIC.id,
    topic: TOPIC.topic,
    date,
    createdAt: date,
  }
}

function attendance(sessionId: string, status: Attendance['status']): Attendance {
  return {
    id: `att-${sessionId}-${status}`,
    sessionId,
    studentId: STUDENT,
    classId: 'class-1',
    syllabusTopicId: TOPIC.id,
    date: '2025-02-01',
    status,
  }
}

function mastery(score: number, topic = TOPIC.topic): TopicMastery {
  return {
    id: 'm-1',
    studentId: STUDENT,
    topic,
    subject: 'Math',
    mastery: score,
    attempts: 1,
    lastUpdated: '2025-02-01',
  }
}

const run = (
  sessions: Session[],
  att: Attendance[],
  mast: TopicMastery[],
) => computeTopicCoverage(STUDENT, TOPIC, sessions, att, mast)

// ── Never taught ──────────────────────────────────────────────────────────────

describe('computeTopicCoverage — topic not taught yet', () => {
  it('classifies as not-taught with attended = null', () => {
    const r = run([], [], [])
    expect(r.classification).toBe('not-taught')
    expect(r.attended).toBeNull()
    expect(r.score).toBeNull()
  })

  it('stays not-taught even if a mastery score somehow exists', () => {
    expect(run([], [], [mastery(0.9)]).classification).toBe('not-taught')
  })

  it('ignores sessions belonging to a different topic', () => {
    const other: Session = { ...session('s-other', '2025-02-01'), syllabusTopicId: 'topic-other' }
    expect(run([other], [], []).classification).toBe('not-taught')
  })

  it('echoes the topic identity back for the caller', () => {
    const r = run([], [], [])
    expect(r.syllabusTopicId).toBe(TOPIC.id)
    expect(r.topic).toBe(TOPIC.topic)
  })
})

// ── Present ───────────────────────────────────────────────────────────────────

describe('computeTopicCoverage — student attended', () => {
  const taught = [session('s1', '2025-02-01')]

  it('mastered at or above 0.7', () => {
    expect(run(taught, [attendance('s1', 'present')], [mastery(0.7)]).classification).toBe('mastered')
    expect(run(taught, [attendance('s1', 'present')], [mastery(0.95)]).classification).toBe('mastered')
  })

  it('present-struggling below 0.7', () => {
    expect(run(taught, [attendance('s1', 'present')], [mastery(0.69)]).classification).toBe('present-struggling')
    expect(run(taught, [attendance('s1', 'present')], [mastery(0.1)]).classification).toBe('present-struggling')
  })

  it('not-assessed when there is no mastery record yet', () => {
    const r = run(taught, [attendance('s1', 'present')], [])
    expect(r.classification).toBe('not-assessed')
    expect(r.score).toBeNull()
  })

  it('counts "late" as attended', () => {
    expect(run(taught, [attendance('s1', 'late')], [mastery(0.9)]).classification).toBe('mastered')
  })

  it('counts the student as attended if they made ANY session for the topic', () => {
    const twoSessions = [session('s1', '2025-02-01'), session('s2', '2025-02-03')]
    const att = [attendance('s1', 'absent'), attendance('s2', 'present')]
    expect(run(twoSessions, att, [mastery(0.8)]).attended).toBe(true)
  })

  it('ignores another student\'s attendance rows', () => {
    const otherStudent: Attendance = { ...attendance('s1', 'present'), studentId: 'stu-2' }
    // No row for our student → attended is false, not true
    expect(run(taught, [otherStudent], []).attended).toBe(false)
  })
})

// ── Absent ────────────────────────────────────────────────────────────────────

describe('computeTopicCoverage — student was absent', () => {
  const taught = [session('s1', '2025-02-01')]
  const wasAbsent = [attendance('s1', 'absent')]

  it.each([
    [0.9, 'absent-good'],
    [0.7, 'absent-good'],
    [0.69, 'absent-watch'],
    [0.5, 'absent-watch'],
    [0.49, 'absent-low'],
    [0, 'absent-low'],
  ])('score %d → %s', (score, expected) => {
    expect(run(taught, wasAbsent, [mastery(score)]).classification).toBe(expected)
  })

  it('absent-untested when they missed it and were never tested', () => {
    const r = run(taught, wasAbsent, [])
    expect(r.classification).toBe('absent-untested')
    expect(r.attended).toBe(false)
    expect(r.score).toBeNull()
  })

  it('treats a taught topic with no attendance row at all as absent', () => {
    // Session happened, nobody marked this student → absent, not "not-taught"
    expect(run(taught, [], []).classification).toBe('absent-untested')
  })

  it('matches mastery by topic name, not by topic id', () => {
    // mastery rows key off the denormalised topic string
    expect(run(taught, wasAbsent, [mastery(0.9, 'Some Other Topic')]).score).toBeNull()
    expect(run(taught, wasAbsent, [mastery(0.9)]).score).toBe(0.9)
  })
})
