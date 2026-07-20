import type { SyllabusTopic } from '../types'

export interface PacingResult {
  currentWeek: number
  expectedTopicIndex: number   // 0-based index of the topic we should be on by now
  actualTopicIndex: number     // 0-based index of last completed topic
  weeksAhead: number           // positive = ahead, negative = behind
  status: 'on-track' | 'ahead' | 'behind' | 'not-started'
  expectedTopicName: string | null
  actualTopicName: string | null
  completedCount: number
  totalCount: number
  completionPct: number
}

export function computePacing(
  academicYearStart: string | undefined,
  topics: SyllabusTopic[],
): PacingResult | null {
  if (!academicYearStart || topics.length === 0) return null

  const start = new Date(academicYearStart + 'T00:00:00')
  const now   = new Date()
  const diffMs = now.getTime() - start.getTime()
  if (diffMs < 0) return null  // year hasn't started yet

  const currentWeek = Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1)

  const sorted = [...topics].sort((a, b) => {
    if (a.weekNumber != null && b.weekNumber != null) return a.weekNumber - b.weekNumber
    return a.orderIndex - b.orderIndex
  })

  const completedCount = sorted.filter(t => t.isCompleted).length
  const totalCount     = sorted.length

  // Expected: how many topics should be done by currentWeek
  // Use weekNumber if set, otherwise distribute evenly across 36 weeks
  let expectedCount: number
  const hasWeekNumbers = sorted.some(t => t.weekNumber != null)
  if (hasWeekNumbers) {
    expectedCount = sorted.filter(t => (t.weekNumber ?? 999) <= currentWeek).length
  } else {
    // Even distribution: assume 36-week school year
    expectedCount = Math.round((currentWeek / 36) * totalCount)
  }
  expectedCount = Math.min(expectedCount, totalCount)

  const expectedTopicIndex = Math.max(0, expectedCount - 1)
  const actualTopicIndex   = Math.max(0, completedCount - 1)
  const weeksAhead         = completedCount - expectedCount

  let status: PacingResult['status']
  if (completedCount === 0 && expectedCount === 0) status = 'not-started'
  else if (weeksAhead >= 0) status = weeksAhead === 0 ? 'on-track' : 'ahead'
  else status = 'behind'

  return {
    currentWeek,
    expectedTopicIndex,
    actualTopicIndex,
    weeksAhead,
    status,
    expectedTopicName: sorted[expectedTopicIndex]?.topic ?? null,
    actualTopicName:   completedCount > 0 ? sorted[actualTopicIndex]?.topic ?? null : null,
    completedCount,
    totalCount,
    completionPct: totalCount > 0 ? completedCount / totalCount : 0,
  }
}
