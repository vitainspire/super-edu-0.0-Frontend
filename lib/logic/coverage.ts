import type { Session, Attendance, SyllabusTopic, TopicMastery, TopicCoverageStatus } from '../types'

export function computeTopicCoverage(
  studentId: string,
  syllabusTopic: SyllabusTopic,
  allSessions: Session[],
  allAttendance: Attendance[],
  allMastery: TopicMastery[],
): TopicCoverageStatus {
  const topicSessions = allSessions.filter(s => s.syllabusTopicId === syllabusTopic.id)

  let attended: boolean | null = null
  if (topicSessions.length > 0) {
    const sessionIds = new Set(topicSessions.map(s => s.id))
    const studentAtt = allAttendance.filter(
      a => a.studentId === studentId && sessionIds.has(a.sessionId)
    )
    // present in ANY session for this topic → attended
    attended = studentAtt.some(a => a.status !== 'absent')
  }

  const masteryRecord = allMastery.find(
    m => m.studentId === studentId && m.topic === syllabusTopic.topic
  )
  const score = masteryRecord ? masteryRecord.mastery : null

  let classification: TopicCoverageStatus['classification']
  if (attended === null) {
    classification = 'not-taught'
  } else if (attended) {
    if (score === null) classification = 'not-assessed'
    else if (score >= 0.7) classification = 'mastered'
    else classification = 'present-struggling'
  } else {
    if (score === null) classification = 'absent-untested'
    else if (score >= 0.7) classification = 'absent-good'
    else if (score >= 0.5) classification = 'absent-watch'
    else classification = 'absent-low'
  }

  return { syllabusTopicId: syllabusTopic.id, topic: syllabusTopic.topic, attended, score, classification }
}
