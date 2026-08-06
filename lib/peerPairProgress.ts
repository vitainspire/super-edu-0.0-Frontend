import { createAdminClient } from './supabase-admin'

// A pairing needs at least this long to actually show up in mastery data
// before judging it — otherwise every fresh pairing would look stagnant.
export const RECHECK_WINDOW_DAYS = 14
// Minimum mastery gain (on a 0-1 scale) to count as real movement, not noise.
export const IMPROVEMENT_THRESHOLD = 0.05

export type ProgressStatus = 'too_early' | 'improving' | 'no_change' | 'unknown'

/** Average mastery for a student, scoped to a subject if one is given, else overall. */
export async function computeAvgMastery(
  ac: ReturnType<typeof createAdminClient>,
  studentId: string,
  subject?: string,
): Promise<number | null> {
  let q = ac.from('student_topic_mastery').select('mastery').eq('student_id', studentId)
  if (subject) q = q.eq('subject', subject)
  const { data } = await q
  if (!data || data.length === 0) return null
  return data.reduce((sum, r) => sum + r.mastery, 0) / data.length
}

function daysSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 86_400_000
}

/**
 * Compares each student's current mastery to their baseline at pairing time.
 * "Improving" if EITHER student moved up by at least the threshold — the
 * pairing is meant to help either direction, not just the weaker student.
 */
export function computeProgressStatus(
  respondedAt: string,
  baselineRequester: number | null,
  baselineTarget: number | null,
  currentRequester: number | null,
  currentTarget: number | null,
): ProgressStatus {
  if (daysSince(respondedAt) < RECHECK_WINDOW_DAYS) return 'too_early'

  const reqDelta = baselineRequester != null && currentRequester != null ? currentRequester - baselineRequester : null
  const tgtDelta = baselineTarget != null && currentTarget != null ? currentTarget - baselineTarget : null
  if (reqDelta == null && tgtDelta == null) return 'unknown'

  const improved = (reqDelta != null && reqDelta >= IMPROVEMENT_THRESHOLD) || (tgtDelta != null && tgtDelta >= IMPROVEMENT_THRESHOLD)
  return improved ? 'improving' : 'no_change'
}
