/**
 * Which topic a teacher is told to teach next.
 *
 * The teacher stops choosing, so this had better be right: the prep sheet and
 * the schedule card both read it, and a wrong answer means a class is taught
 * out of the admin's order without anyone noticing.
 */

import { describe, it, expect } from 'vitest'
import { nextTopicFor, nextTopicLabel, byProgression } from '@/lib/logic/nextTopic'
import type { SyllabusTopic } from '@/lib/types'

const topic = (
  name: string,
  orderIndex: number,
  weekNumber: number | null,
  isCompleted = false,
): SyllabusTopic => ({
  id: name, classId: 'c1', topic: name, description: '',
  orderIndex, weekNumber: weekNumber ?? undefined, isCompleted, createdAt: '',
})

describe('byProgression', () => {
  it('orders by week, then by the admin’s sequence within it', () => {
    const sorted = [topic('c', 0, 2), topic('a', 1, 1), topic('b', 0, 1)].sort(byProgression)
    expect(sorted.map(t => t.topic)).toEqual(['b', 'a', 'c'])
  })

  it('puts topics with no week last, never first', () => {
    const sorted = [topic('none', 0, null), topic('wk5', 9, 5)].sort(byProgression)
    expect(sorted.map(t => t.topic)).toEqual(['wk5', 'none'])
  })
})

describe('nextTopicFor', () => {
  const plan = [
    topic('Counting', 0, 1, true),
    topic('Shapes', 1, 1),
    topic('Patterns', 2, 2),
    topic('Extra practice', 3, null),
  ]

  it('picks this week’s first incomplete topic', () => {
    const next = nextTopicFor(plan, 1)!
    expect(next.topic.topic).toBe('Shapes')
    expect(next.reason).toBe('this-week')
  })

  it('skips what is already taught', () => {
    // Counting is week 1 and complete; it must not be offered again.
    expect(nextTopicFor(plan, 1)!.topic.topic).not.toBe('Counting')
  })

  it('flags an unfinished earlier week as overdue rather than moving on', () => {
    // Week 3 has nothing, but Shapes was never finished in week 1.
    const next = nextTopicFor(plan, 3)!
    expect(next.topic.topic).toBe('Shapes')
    expect(next.reason).toBe('overdue')
    expect(next.weekNumber).toBe(1)
  })

  it('falls through to the plan order when no week is set anywhere', () => {
    const unplanned = [topic('B', 1, null), topic('A', 0, null)]
    const next = nextTopicFor(unplanned, 4)!
    expect(next.topic.topic).toBe('A')
    expect(next.reason).toBe('unscheduled')
  })

  it('works before the academic year starts, when there is no current week', () => {
    const next = nextTopicFor(plan, null)!
    expect(next.topic.topic).toBe('Shapes')
  })

  it('reports completion instead of an empty answer', () => {
    const done = plan.map(t => ({ ...t, isCompleted: true }))
    const next = nextTopicFor(done, 2)!
    expect(next.reason).toBe('all-done')
  })

  it('returns null only when there is no syllabus at all', () => {
    expect(nextTopicFor([], 1)).toBeNull()
  })

  it('never picks an unscheduled topic while scheduled work remains', () => {
    const next = nextTopicFor(plan, 2)!
    expect(next.topic.topic).toBe('Shapes')   // week 1, overdue — not 'Extra practice'
  })

  it('finishes an overdue topic before starting this week’s', () => {
    // Week 2 has Patterns waiting, but Shapes was never finished in week 1.
    // A skipped topic is never taught; a week behind is recoverable.
    const next = nextTopicFor(plan, 2)!
    expect(next.topic.topic).toBe('Shapes')
    expect(next.reason).toBe('overdue')
  })

  it('says so when the class is running ahead of the plan', () => {
    const early = [topic('Counting', 0, 1, true), topic('Patterns', 1, 5)]
    const next = nextTopicFor(early, 2)!
    expect(next.topic.topic).toBe('Patterns')
    expect(next.reason).toBe('ahead')
  })
})

describe('nextTopicLabel', () => {
  it('names the week for planned and overdue work', () => {
    expect(nextTopicLabel({ topic: topic('x', 0, 3), reason: 'this-week', weekNumber: 3 }))
      .toBe('Week 3 · planned')
    expect(nextTopicLabel({ topic: topic('x', 0, 1), reason: 'overdue', weekNumber: 1 }))
      .toBe('Week 1 · overdue')
  })

  it('avoids inventing a week when none was set', () => {
    expect(nextTopicLabel({ topic: topic('x', 0, null), reason: 'unscheduled', weekNumber: null }))
      .toBe('Next in the plan')
  })
})
