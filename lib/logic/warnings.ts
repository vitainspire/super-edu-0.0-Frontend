import type { TopicMastery, Session, Attendance, Mark, Test, Warning } from '../types'

export function computeWarnings(
  studentId: string,
  sessions: Session[],
  attendance: Attendance[],
  marks: Mark[],
  tests: Test[],
  masteryData: TopicMastery[],
): Warning[] {
  const warnings: Warning[] = []
  const topicsWithAbsenceWarning = new Set<string>()

  // ── Absence-based warnings ────────────────────────────────────────────────
  const absentSessions = sessions.filter(s => {
    const att = attendance.find(a => a.sessionId === s.id && a.studentId === studentId)
    return att?.status === 'absent'
  })

  const seenTopicIds = new Set<string>()
  for (const session of absentSessions) {
    if (seenTopicIds.has(session.syllabusTopicId)) continue
    seenTopicIds.add(session.syllabusTopicId)

    const topicAbsences = absentSessions.filter(s => s.syllabusTopicId === session.syllabusTopicId)
    const absentCount   = topicAbsences.length
    const topicName     = session.topic
    const latestDate    = topicAbsences.sort((a, b) => b.date.localeCompare(a.date))[0].date

    const topicMarks = marks.filter(m => {
      const t = tests.find(t => t.id === m.testId)
      return m.studentId === studentId && t?.topic === topicName
    })

    topicsWithAbsenceWarning.add(topicName.toLowerCase())

    if (topicMarks.length > 0) {
      const avgScore = topicMarks.reduce((sum, m) => {
        const t = tests.find(t => t.id === m.testId)
        return sum + (t ? m.score / t.totalMarks : 0)
      }, 0) / topicMarks.length

      if (avgScore < 0.5) {
        warnings.push({
          level: 'critical',
          category: 'absence',
          topic: topicName,
          reason: `Absent for "${topicName}"${absentCount > 1 ? ` · ${absentCount} sessions missed` : ''}`,
          action: `Scored ${Math.round(avgScore * 100)}% on the test — needs to catch up`,
          date: latestDate,
        })
      } else if (avgScore < 0.7) {
        warnings.push({
          level: 'watch',
          category: 'absence',
          topic: topicName,
          reason: `Absent for "${topicName}"`,
          action: `Scored ${Math.round(avgScore * 100)}% — keep an eye on this`,
          date: latestDate,
        })
      }
    } else {
      warnings.push({
        level: 'watch',
        category: 'absence',
        topic: topicName,
        reason: `Absent for "${topicName}"`,
        action: absentCount > 1 ? `Missed ${absentCount} sessions · no test yet` : 'Not tested on this topic yet',
        date: latestDate,
      })
    }
  }

  // ── Low marks warnings (no absence required) ──────────────────────────────
  // Group marks by topic, pick lowest avg per topic
  const marksByTopic = new Map<string, { marks: Mark[]; topicName: string }>()
  for (const m of marks.filter(m2 => m2.studentId === studentId)) {
    const t = tests.find(t2 => t2.id === m.testId)
    if (!t) continue
    const key = t.topic
    if (!marksByTopic.has(key)) marksByTopic.set(key, { marks: [], topicName: key })
    marksByTopic.get(key)!.marks.push(m)
  }

  for (const [topicName, { marks: topicMarks }] of marksByTopic) {
    // Skip if already covered by an absence warning
    if (topicsWithAbsenceWarning.has(topicName.toLowerCase())) continue

    const avgScore = topicMarks.reduce((sum, m) => {
      const t = tests.find(t2 => t2.id === m.testId)
      return sum + (t ? m.score / t.totalMarks : 0)
    }, 0) / topicMarks.length

    if (avgScore < 0.4) {
      warnings.push({
        level: 'critical',
        category: 'low_marks',
        topic: topicName,
        reason: `Low score in "${topicName}"`,
        action: `Scored ${Math.round(avgScore * 100)}% — needs extra support`,
      })
    } else if (avgScore < 0.55) {
      warnings.push({
        level: 'watch',
        category: 'low_marks',
        topic: topicName,
        reason: `Below average in "${topicName}"`,
        action: `Scored ${Math.round(avgScore * 100)}% — monitor closely`,
      })
    }
  }

  // ── Repeated failure (struggling) ─────────────────────────────────────────
  const repeatedFails = masteryData.filter(t => t.mastery < 0.5 && t.attempts >= 3)
  for (const fail of repeatedFails) {
    const already = warnings.some(w => w.topic === fail.topic)
    if (!already) {
      warnings.push({
        level: 'critical',
        category: 'struggling',
        topic: fail.topic,
        reason: `Struggling with "${fail.topic}"`,
        action: `Low score across ${fail.attempts} attempts — try a different approach`,
      })
    }
  }

  return warnings.slice(0, 8)
}
