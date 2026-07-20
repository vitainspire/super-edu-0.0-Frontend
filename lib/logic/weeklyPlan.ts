import type { SyllabusTopic } from '../types'
import { getCurrentWeek } from './pacing'

export const UNSCHEDULED = 'unscheduled' as const
export type WeekKey = number | typeof UNSCHEDULED

export interface WeekTab {
  key: WeekKey
  label: string
  isCurrent: boolean
  completedCount: number
  totalCount: number
}

export function buildWeekTabs(topics: SyllabusTopic[], academicYearStart?: string): WeekTab[] {
  const currentWeek = getCurrentWeek(academicYearStart)

  const weekNumbers = Array.from(
    new Set(topics.map(t => t.weekNumber).filter((w): w is number => w != null)),
  ).sort((a, b) => a - b)

  const tabs: WeekTab[] = weekNumbers.map(week => {
    const weekTopics = topics.filter(t => t.weekNumber === week)
    return {
      key: week,
      label: `Week ${week}`,
      isCurrent: week === currentWeek,
      completedCount: weekTopics.filter(t => t.isCompleted).length,
      totalCount: weekTopics.length,
    }
  })

  const unscheduled = topics.filter(t => t.weekNumber == null)
  if (unscheduled.length > 0) {
    tabs.push({
      key: UNSCHEDULED,
      label: 'Unscheduled',
      isCurrent: false,
      completedCount: unscheduled.filter(t => t.isCompleted).length,
      totalCount: unscheduled.length,
    })
  }

  return tabs
}

export function topicsForWeek(topics: SyllabusTopic[], week: WeekKey): SyllabusTopic[] {
  return week === UNSCHEDULED
    ? topics.filter(t => t.weekNumber == null)
    : topics.filter(t => t.weekNumber === week)
}

export function defaultSelectedWeek(tabs: WeekTab[]): WeekKey | null {
  return tabs.find(t => t.isCurrent)?.key ?? tabs[0]?.key ?? null
}
