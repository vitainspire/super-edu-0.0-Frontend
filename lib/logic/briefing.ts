import type { BriefingFinding, TopicMastery, Student } from '../types'

function avg(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export interface StudentRisk {
  student: Student
  attendanceRate: number
  masteryTrend: 'improving' | 'declining' | 'stable'
}

export function computeBriefingFindings(
  masteryData: TopicMastery[],
  students: Student[],
  thisWeekScores: number[],
  lastWeekScores: number[],
  studentRisks: StudentRisk[]
): BriefingFinding[] {
  const findings: BriefingFinding[] = []

  // Finding 1: Students stuck on same topic
  const repeatedFails = masteryData.filter((t) => t.mastery < 0.5 && t.attempts >= 3)
  if (repeatedFails.length > 0) {
    const topicGroups: Record<string, number> = {}
    repeatedFails.forEach((t) => {
      topicGroups[t.topic] = (topicGroups[t.topic] || 0) + 1
    })
    const topTopic = Object.entries(topicGroups).sort((a, b) => b[1] - a[1])[0]
    findings.push({
      type: 'repeated_failures',
      data: {
        topic: topTopic[0],
        studentCount: topTopic[1],
      },
    })
  }

  // Finding 2: Class average trend
  if (thisWeekScores.length > 0 && lastWeekScores.length > 0) {
    const thisAvg = avg(thisWeekScores)
    const lastAvg = avg(lastWeekScores)
    const pctChange = lastAvg > 0 ? Math.round(Math.abs((thisAvg - lastAvg) / lastAvg) * 100) : 0
    findings.push({
      type: 'trend',
      data: { direction: thisAvg >= lastAvg ? 'up' : 'down', pctChange },
    })
  }

  // Finding 3: At-risk students (low attendance + declining scores)
  const atRisk = studentRisks.filter((s) => s.attendanceRate < 0.7 && s.masteryTrend === 'declining')
  if (atRisk.length > 0) {
    findings.push({
      type: 'at_risk',
      data: { students: atRisk.slice(0, 3).map((s) => s.student.name), count: atRisk.length },
    })
  }

  // Finding 4: Class readiness to advance
  if (students.length > 0) {
    const proficientStudentIds = new Set(
      masteryData.filter((t) => t.mastery >= 0.75).map((t) => t.studentId)
    )
    const classReadiness = proficientStudentIds.size / students.length
    findings.push({
      type: 'readiness',
      data: {
        readyToAdvance: classReadiness > 0.75,
        proficientCount: proficientStudentIds.size,
        totalStudents: students.length,
        pct: Math.round(classReadiness * 100),
      },
    })
  }

  return findings
}
