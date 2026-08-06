export interface SubstituteCandidate {
  teacherId: string
  name: string
  subjectsTaught: Set<string>
  busySlots: Set<string>   // `${dayOfWeek}|${periodNumber}` from the candidate's own published timetable
  maxPeriodsPerDay?: number | null    // optional workload cap — null/undefined = no cap
  maxPeriodsPerWeek?: number | null
  weeklyLoad: number           // regular periods this week + substitute periods already picked up this week
}

export interface SubstituteNeed {
  dayOfWeek: number
  periodNumber: number
  subject: string
}

/**
 * Finds the best-fit substitute for one period. By default only considers
 * teachers who actually teach the period's subject (derived elsewhere from
 * their real assignments/timetable, since Teacher.subject/grade aren't
 * reliable). Pass `requireSubjectMatch: false` to drop that requirement —
 * used as a last-resort fallback (see markTeacherUnavailable) when no
 * subject-qualified teacher is free, so the period isn't left uncovered.
 * Hard-excludes anyone who'd breach their own daily/weekly workload cap by
 * taking this period, regardless of subject match. Ranks survivors by fewest
 * periods already on that weekday, then name, for a deterministic pick.
 */
export function findSubstitute(
  need: SubstituteNeed,
  candidates: SubstituteCandidate[],
  excludeTeacherIds: Set<string>,
  alreadyUsedThisSlot: Set<string>,
  requireSubjectMatch = true,
): string | null {
  const slotKey = `${need.dayOfWeek}|${need.periodNumber}`
  const dayPrefix = `${need.dayOfWeek}|`

  const periodsOnDay = (c: SubstituteCandidate) =>
    [...c.busySlots].filter(k => k.startsWith(dayPrefix)).length

  const pool = candidates.filter(c =>
    !excludeTeacherIds.has(c.teacherId) &&
    !alreadyUsedThisSlot.has(c.teacherId) &&
    !c.busySlots.has(slotKey) &&
    (!requireSubjectMatch || c.subjectsTaught.has(need.subject)) &&
    // `== null` (not `=== undefined`): teachers.max_periods_per_* is a nullable
    // column, so an uncapped teacher arrives as null on any path that doesn't
    // run it through admin-queries' `?? undefined` mapping. Comparing a number
    // against null coerces it to 0, which silently excluded *every* uncapped
    // teacher and left periods uncovered.
    (c.maxPeriodsPerDay == null || periodsOnDay(c) < c.maxPeriodsPerDay) &&
    (c.maxPeriodsPerWeek == null || c.weeklyLoad < c.maxPeriodsPerWeek)
  )
  if (pool.length === 0) return null

  const sorted = [...pool].sort((a, b) =>
    periodsOnDay(a) - periodsOnDay(b) || a.name.localeCompare(b.name)
  )
  return sorted[0].teacherId
}

export interface ClassPeriod {
  periodNumber: number
  subject: string
  teacherId: string
}

export interface SwapSuggestion {
  swapPeriodNumber: number
  swapSubject: string
  movingTeacherId: string     // currently teaches swapSubject at swapPeriodNumber; would move to need.periodNumber
  freeingTeacherId: string    // qualified for need.subject and free at swapPeriodNumber; would teach there instead
}

/**
 * When no substitute is free at the exact period, checks whether swapping
 * this class's schedule for the day would resolve it: is there another
 * period Q (same class, same day) where (a) a qualified substitute for the
 * needed subject is free, and (b) Q's regular teacher is free at the
 * original period P? If so, the class could do Q's subject at P (taught by
 * Q's regular teacher) and the needed subject at Q (taught by the found
 * substitute) — nobody's own schedule is disrupted, just this class's order
 * for the day. Suggestion only — never auto-applied.
 */
export function suggestSwap(
  need: SubstituteNeed,
  classPeriodsThatDay: ClassPeriod[],
  candidates: SubstituteCandidate[],
  excludeTeacherIds: Set<string>,
  alreadyUsedThisSlot: (periodNumber: number) => Set<string>,
): SwapSuggestion | null {
  const candidateById = new Map(candidates.map(c => [c.teacherId, c]))
  const needSlotKey = `${need.dayOfWeek}|${need.periodNumber}`

  for (const period of classPeriodsThatDay) {
    if (period.periodNumber === need.periodNumber) continue

    const freeingTeacherId = findSubstitute(
      { dayOfWeek: need.dayOfWeek, periodNumber: period.periodNumber, subject: need.subject },
      candidates, excludeTeacherIds, alreadyUsedThisSlot(period.periodNumber)
    )
    if (!freeingTeacherId) continue

    const movingTeacher = candidateById.get(period.teacherId)
    if (!movingTeacher || movingTeacher.busySlots.has(needSlotKey)) continue

    return { swapPeriodNumber: period.periodNumber, swapSubject: period.subject, movingTeacherId: period.teacherId, freeingTeacherId }
  }
  return null
}
