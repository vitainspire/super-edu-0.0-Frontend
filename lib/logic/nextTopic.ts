import type { SyllabusTopic } from '../types'

/**
 * What this class should be taught next, and why.
 *
 * The admin sets a progression — the order topics are taught in, and which week
 * each belongs to. This is the one place that reads it, so the teacher never
 * has to decide. They can still override; the point is that they do not have to.
 *
 * Extracted from inside PrepMaterialModal, which had this rule inline. Once the
 * schedule card started showing the planned topic too, two copies of "what is
 * next" would have drifted apart — and a card promising one topic while the
 * prep sheet opens on another is worse than showing nothing.
 *
 * The rule is simply: the first unfinished topic in the admin's order. No
 * special case for the current week, deliberately.
 *
 * The tempting alternative is to prefer this week's work and move on. It is
 * wrong: a syllabus is a sequence, later topics assume earlier ones (the schema
 * even carries prerequisite_definition_id), and a topic that gets skipped
 * because its week passed is never taught at all. Falling a week behind is
 * recoverable; a hole in the curriculum is not. So an unfinished week 1 topic
 * is still what comes next in week 3 — labelled overdue, so nobody thinks the
 * plan is on schedule.
 *
 * Topics with no week are the tail of the plan, never the front of it.
 */

export type NextTopicReason = 'this-week' | 'overdue' | 'ahead' | 'unscheduled' | 'all-done'

export interface NextTopic {
  topic: SyllabusTopic
  reason: NextTopicReason
  /** The week it was planned for, when the admin set one. */
  weekNumber: number | null
}

/** Teaching order: the admin's week first, then their sequence within it. */
export function byProgression(a: SyllabusTopic, b: SyllabusTopic): number {
  const aw = a.weekNumber ?? Number.MAX_SAFE_INTEGER
  const bw = b.weekNumber ?? Number.MAX_SAFE_INTEGER
  if (aw !== bw) return aw - bw
  return (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
}

export function nextTopicFor(
  topics: SyllabusTopic[],
  currentWeek: number | null,
): NextTopic | null {
  const pending = [...topics].filter(t => !t.isCompleted).sort(byProgression)
  if (!pending.length) {
    // Distinguished from "no syllabus": everything planned has been taught,
    // which the UI should celebrate rather than treat as missing data.
    return topics.length
      ? { topic: topics[topics.length - 1], reason: 'all-done', weekNumber: null }
      : null
  }

  // The next one in the plan, full stop. The reason is then just a reading of
  // where that topic sits relative to today — it never changes the choice.
  const first = pending[0]
  const week = first.weekNumber ?? null

  let reason: NextTopicReason
  if (week == null) reason = 'unscheduled'
  else if (currentWeek == null) reason = 'this-week'
  else if (week < currentWeek) reason = 'overdue'
  else if (week > currentWeek) reason = 'ahead'
  else reason = 'this-week'

  return { topic: first, reason, weekNumber: week }
}

/** A short phrase for the UI, e.g. "Week 3 · planned". */
export function nextTopicLabel(next: NextTopic): string {
  switch (next.reason) {
    case 'this-week':
      return next.weekNumber != null ? `Week ${next.weekNumber} · planned` : 'Next in the plan'
    case 'overdue':
      return `Week ${next.weekNumber} · overdue`
    case 'ahead':
      return `Week ${next.weekNumber} · ahead of plan`
    case 'unscheduled':
      return 'Next in the plan'
    case 'all-done':
      return 'Syllabus complete'
  }
}
