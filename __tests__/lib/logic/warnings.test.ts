/**
 * At-risk warning generation — what surfaces on /alerts and the home briefing.
 *
 * Thresholds encoded here (and asserted below):
 *   absence + avg < 0.5        → critical
 *   absence + avg < 0.7        → watch
 *   absence + avg >= 0.7       → no warning (they coped)
 *   absence + untested         → watch
 *   low marks + avg < 0.4      → critical   (only when not already flagged for absence)
 *   low marks + avg < 0.55     → watch
 *   mastery < 0.5 & attempts>=3 → critical  (only when the topic isn't already flagged)
 */

import { describe, it, expect } from 'vitest'
import { computeWarnings } from '@/lib/logic/warnings'
import type { Session, Attendance, Mark, Test, TopicMastery } from '@/lib/types'

const STUDENT = 'stu-1'

function session(id: string, topic: string, date: string, topicId = `sy-${topic}`): Session {
  return {
    id, classId: 'class-1', teacherId: 'teacher-1',
    syllabusTopicId: topicId, topic, date, createdAt: date,
  }
}

function attendance(sessionId: string, status: Attendance['status'], studentId = STUDENT): Attendance {
  return {
    id: `att-${sessionId}-${studentId}`, sessionId, studentId,
    classId: 'class-1', syllabusTopicId: 'sy', date: '2025-02-01', status,
  }
}

function test(id: string, topic: string, totalMarks = 100): Test {
  return { id, teacherId: 'teacher-1', classId: 'class-1', subject: 'Math', topic, totalMarks, conductedOn: '2025-02-05' }
}

function mark(testId: string, score: number, studentId = STUDENT): Mark {
  return { id: `m-${testId}-${studentId}`, testId, studentId, score, enteredAt: '2025-02-05' }
}

function mastery(topic: string, score: number, attempts: number): TopicMastery {
  return { id: `mas-${topic}`, studentId: STUDENT, topic, subject: 'Math', mastery: score, attempts, lastUpdated: '2025-02-05' }
}

const run = (
  sessions: Session[] = [], att: Attendance[] = [], marks: Mark[] = [],
  tests: Test[] = [], mast: TopicMastery[] = [],
) => computeWarnings(STUDENT, sessions, att, marks, tests, mast)

// ── Nothing to report ─────────────────────────────────────────────────────────

describe('computeWarnings — healthy student', () => {
  it('returns no warnings with no data at all', () => {
    expect(run()).toEqual([])
  })

  it('returns no warnings for a present, high-scoring student', () => {
    expect(run(
      [session('s1', 'Fractions', '2025-02-01')],
      [attendance('s1', 'present')],
      [mark('t1', 90)],
      [test('t1', 'Fractions')],
    )).toEqual([])
  })

  it('does not warn on another student\'s absences or marks', () => {
    expect(run(
      [session('s1', 'Fractions', '2025-02-01')],
      [attendance('s1', 'absent', 'stu-OTHER')],
      [mark('t1', 10, 'stu-OTHER')],
      [test('t1', 'Fractions')],
    )).toEqual([])
  })

  it('treats "late" as present, not absent', () => {
    expect(run(
      [session('s1', 'Fractions', '2025-02-01')],
      [attendance('s1', 'late')],
      [mark('t1', 90)],
      [test('t1', 'Fractions')],
    )).toEqual([])
  })
})

// ── Absence-driven warnings ───────────────────────────────────────────────────

describe('computeWarnings — absence', () => {
  const missed = [session('s1', 'Fractions', '2025-02-01')]
  const wasAbsent = [attendance('s1', 'absent')]

  it('is critical when they missed the lesson and then failed the test', () => {
    const [w] = run(missed, wasAbsent, [mark('t1', 30)], [test('t1', 'Fractions')])
    expect(w.level).toBe('critical')
    expect(w.category).toBe('absence')
    expect(w.topic).toBe('Fractions')
    expect(w.action).toContain('30%')
  })

  it('is a watch when they missed the lesson and scored middling', () => {
    const [w] = run(missed, wasAbsent, [mark('t1', 60)], [test('t1', 'Fractions')])
    expect(w.level).toBe('watch')
    expect(w.action).toContain('60%')
  })

  it('does not warn at all when they missed the lesson but still did well', () => {
    expect(run(missed, wasAbsent, [mark('t1', 85)], [test('t1', 'Fractions')])).toEqual([])
  })

  it('is a watch when they missed the lesson and have not been tested yet', () => {
    const [w] = run(missed, wasAbsent)
    expect(w.level).toBe('watch')
    expect(w.action).toBe('Not tested on this topic yet')
  })

  it('counts repeated absences on one topic as a single warning', () => {
    const twoSessions = [
      session('s1', 'Fractions', '2025-02-01'),
      session('s2', 'Fractions', '2025-02-03'),
    ]
    const bothAbsent = [attendance('s1', 'absent'), attendance('s2', 'absent')]
    const warnings = run(twoSessions, bothAbsent)

    expect(warnings).toHaveLength(1)
    expect(warnings[0].action).toBe('Missed 2 sessions · no test yet')
  })

  it('reports the most recent absence date for the topic', () => {
    const twoSessions = [
      session('s1', 'Fractions', '2025-02-01'),
      session('s2', 'Fractions', '2025-02-14'),
    ]
    const bothAbsent = [attendance('s1', 'absent'), attendance('s2', 'absent')]
    expect(run(twoSessions, bothAbsent)[0].date).toBe('2025-02-14')
  })

  it('mentions the session count in the reason when more than one was missed', () => {
    const twoSessions = [
      session('s1', 'Fractions', '2025-02-01'),
      session('s2', 'Fractions', '2025-02-03'),
    ]
    const bothAbsent = [attendance('s1', 'absent'), attendance('s2', 'absent')]
    const [w] = run(twoSessions, bothAbsent, [mark('t1', 20)], [test('t1', 'Fractions')])
    expect(w.reason).toContain('2 sessions missed')
  })

  it('warns separately for each distinct topic missed', () => {
    const sessions = [
      session('s1', 'Fractions', '2025-02-01'),
      session('s2', 'Decimals', '2025-02-02'),
    ]
    const att = [attendance('s1', 'absent'), attendance('s2', 'absent')]
    const topicsWarned = run(sessions, att).map(w => w.topic)
    expect(new Set(topicsWarned)).toEqual(new Set(['Fractions', 'Decimals']))
  })
})

// ── Low marks without absence ─────────────────────────────────────────────────

describe('computeWarnings — low marks while present', () => {
  const attended = [session('s1', 'Fractions', '2025-02-01')]
  const wasPresent = [attendance('s1', 'present')]

  it('is critical below 40%', () => {
    const [w] = run(attended, wasPresent, [mark('t1', 35)], [test('t1', 'Fractions')])
    expect(w.level).toBe('critical')
    expect(w.category).toBe('low_marks')
    expect(w.reason).toContain('Fractions')
  })

  it('is a watch below 55%', () => {
    const [w] = run(attended, wasPresent, [mark('t1', 50)], [test('t1', 'Fractions')])
    expect(w.level).toBe('watch')
    expect(w.category).toBe('low_marks')
  })

  it('does not warn at or above 55%', () => {
    expect(run(attended, wasPresent, [mark('t1', 60)], [test('t1', 'Fractions')])).toEqual([])
  })

  it('averages multiple tests on the same topic rather than warning per test', () => {
    const tests = [test('t1', 'Fractions'), test('t2', 'Fractions')]
    const marks = [mark('t1', 20), mark('t2', 80)] // avg 50% → watch
    const warnings = run(attended, wasPresent, marks, tests)

    expect(warnings).toHaveLength(1)
    expect(warnings[0].level).toBe('watch')
  })

  it('does not double-report a topic already flagged for absence', () => {
    const wasAbsent = [attendance('s1', 'absent')]
    const warnings = run(attended, wasAbsent, [mark('t1', 20)], [test('t1', 'Fractions')])

    expect(warnings).toHaveLength(1)
    expect(warnings[0].category).toBe('absence')
  })

  it('scores against each test\'s own total, not a fixed 100', () => {
    // 6/20 = 30% → critical, even though the raw score is small
    const [w] = run(attended, wasPresent, [mark('t1', 6)], [test('t1', 'Fractions', 20)])
    expect(w.level).toBe('critical')
    expect(w.action).toContain('30%')
  })
})

// ── Repeated failure (mastery) ────────────────────────────────────────────────

describe('computeWarnings — repeated failure', () => {
  it('is critical after 3+ low-scoring attempts on a topic', () => {
    const [w] = run([], [], [], [], [mastery('Long Division', 0.3, 3)])
    expect(w.level).toBe('critical')
    expect(w.category).toBe('struggling')
    expect(w.topic).toBe('Long Division')
    expect(w.action).toContain('3 attempts')
  })

  it('does not fire before the third attempt', () => {
    expect(run([], [], [], [], [mastery('Long Division', 0.3, 2)])).toEqual([])
  })

  it('does not fire when mastery has recovered above 0.5', () => {
    expect(run([], [], [], [], [mastery('Long Division', 0.6, 5)])).toEqual([])
  })

  it('does not duplicate a topic already flagged by another rule', () => {
    const warnings = run(
      [session('s1', 'Fractions', '2025-02-01')],
      [attendance('s1', 'absent')],
      [mark('t1', 20)],
      [test('t1', 'Fractions')],
      [mastery('Fractions', 0.2, 4)],
    )
    expect(warnings.filter(w => w.topic === 'Fractions')).toHaveLength(1)
  })
})

// ── Output shape ──────────────────────────────────────────────────────────────

describe('computeWarnings — output limits', () => {
  it('caps the list at 8 warnings so the UI stays readable', () => {
    const sessions = Array.from({ length: 15 }, (_, i) => session(`s${i}`, `Topic ${i}`, '2025-02-01'))
    const att = sessions.map(s => attendance(s.id, 'absent'))

    const warnings = run(sessions, att)
    expect(warnings).toHaveLength(8)
  })

  it('always produces a level, category, reason and action', () => {
    const warnings = run(
      [session('s1', 'Fractions', '2025-02-01'), session('s2', 'Decimals', '2025-02-02')],
      [attendance('s1', 'absent'), attendance('s2', 'present')],
      [mark('t1', 20), mark('t2', 30)],
      [test('t1', 'Fractions'), test('t2', 'Decimals')],
      [mastery('Algebra', 0.1, 4)],
    )
    expect(warnings.length).toBeGreaterThan(0)
    for (const w of warnings) {
      expect(['critical', 'watch', 'info']).toContain(w.level)
      expect(['absence', 'low_marks', 'struggling']).toContain(w.category)
      expect(w.reason).toBeTruthy()
      expect(w.action).toBeTruthy()
    }
  })

  it('ignores marks whose test row is missing', () => {
    // orphaned mark — the test was deleted; must not crash or divide by undefined
    const warnings = run([], [], [mark('gone', 10)], [])
    expect(warnings).toEqual([])
  })
})
