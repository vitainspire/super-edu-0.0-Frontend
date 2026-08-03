import type { Attendance, Student, TopicMastery, Warning } from '@/lib/types'

export interface ClassSnapshot {
  /** Active students on the roll. */
  students: number
  /** Percent present, 0-100. null when nothing has been recorded yet. */
  attendancePct: number | null
  /** Average mastery, 0-100. null when nothing has been assessed yet. */
  masteryPct: number | null
  /** Students carrying at least one warning. */
  needAttention: number
}

/**
 * The four numbers worth showing next to a class on the schedule card.
 *
 * Deliberately returns null rather than 0 for attendance and mastery when
 * there is nothing to average. A class that has never been assessed is not a
 * class averaging 0%, and showing "0%" against a new roster reads as a
 * catastrophe instead of an absence of data — the chip is hidden instead.
 *
 * Counts are computed from what the app has already loaded, so this adds no
 * fetch: the schedule card renders inside a page that holds the whole roster,
 * attendance and mastery in context regardless.
 */
export function classSnapshot(
  classId: string,
  {
    students,
    attendance,
    mastery,
    getStudentWarnings,
  }: {
    students: Student[]
    attendance: Attendance[]
    mastery: TopicMastery[]
    getStudentWarnings: (studentId: string) => Warning[]
  },
): ClassSnapshot {
  const roster = students.filter(s => s.classId === classId && s.isActive)
  const rosterIds = new Set(roster.map(s => s.id))

  const records = attendance.filter(a => a.classId === classId)
  const present = records.filter(a => a.status === 'present' || a.status === 'late').length

  // Mastery is stored per student per topic, with no class column, so it is
  // reached through the roster.
  const scores = mastery.filter(m => rosterIds.has(m.studentId)).map(m => m.mastery)

  return {
    students: roster.length,
    attendancePct: records.length ? Math.round((present / records.length) * 100) : null,
    masteryPct: scores.length
      ? Math.round((scores.reduce((sum, m) => sum + m, 0) / scores.length) * 100)
      : null,
    needAttention: roster.filter(s => getStudentWarnings(s.id).length > 0).length,
  }
}
