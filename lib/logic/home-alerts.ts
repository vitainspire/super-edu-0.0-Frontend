import type { Class, Session, Student, Warning } from '../types'

export interface HomeAlert {
  id: string
  level: 'critical' | 'watch' | 'info'
  title: string
  subtitle: string
  actionHref: string
}

export function computeHomeAlerts(
  classes: Class[],
  sessions: Session[],
  students: Student[],
  getStudentWarnings: (studentId: string) => Warning[],
): HomeAlert[] {
  const alerts: HomeAlert[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const cls of classes) {
    const classSessions = sessions
      .filter(s => s.classId === cls.id)
      .sort((a, b) => b.date.localeCompare(a.date))

    const lastSession = classSessions[0]
    if (lastSession) {
      const lastDate = new Date(lastSession.date + 'T00:00:00')
      const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / 86400000)
      if (daysDiff >= 7) {
        alerts.push({
          id: `gap_${cls.id}`,
          level: 'critical',
          title: `${cls.name} — ${daysDiff} days without a session`,
          subtitle: `Last taught: ${lastSession.topic}`,
          actionHref: `/classes/${cls.id}/attendance`,
        })
      } else if (daysDiff >= 4) {
        alerts.push({
          id: `gap_${cls.id}`,
          level: 'watch',
          title: `${cls.name} — ${daysDiff} days since last session`,
          subtitle: `Last taught: ${lastSession.topic}`,
          actionHref: `/classes/${cls.id}/attendance`,
        })
      }
    }

    const classStudents = students.filter(s => s.classId === cls.id && s.isActive)
    const criticalStudents = classStudents.filter(s =>
      getStudentWarnings(s.id).some(w => w.level === 'critical')
    )
    if (criticalStudents.length > 0) {
      const names = criticalStudents.slice(0, 2).map(s => s.name).join(', ')
      const extra = criticalStudents.length > 2 ? ` +${criticalStudents.length - 2} more` : ''
      alerts.push({
        id: `students_${cls.id}`,
        level: criticalStudents.length >= 3 ? 'critical' : 'watch',
        title: `${criticalStudents.length} student${criticalStudents.length > 1 ? 's' : ''} need attention — ${cls.name}`,
        subtitle: names + extra,
        actionHref: '/alerts',
      })
    }
  }

  return alerts
    .sort((a, b) => {
      const order = { critical: 0, watch: 1, info: 2 }
      return order[a.level] - order[b.level]
    })
    .slice(0, 5)
}

/**
 * Distinct students with an absence or low-mark/struggling warning, across
 * every active student in every class — the same per-student criteria the
 * Alerts page itself uses, so a count shown elsewhere (e.g. the Home screen)
 * always matches what "View" on the Alerts page reveals.
 */
export function countStudentsNeedingAttention(
  classes: Class[],
  students: Student[],
  getStudentWarnings: (studentId: string) => Warning[],
): number {
  let count = 0
  for (const cls of classes) {
    for (const s of students.filter(st => st.classId === cls.id && st.isActive)) {
      const warnings = getStudentWarnings(s.id)
      const hasAbsence = warnings.some(w => w.category === 'absence')
      const hasLowMark = warnings.some(w => w.category === 'low_marks' || w.category === 'struggling')
      if (hasAbsence || hasLowMark) count++
    }
  }
  return count
}
