import { supabase } from './supabase'
import { backendFetch } from './backend'
import type {
  Teacher, Student, Test, Mark, TopicMastery, RecoveryAttempt,
  Class, SyllabusTopic, Attendance, Session, SyllabusSubTopic, TimetableEntry, CatchupMaterial, InterventionNote,
  TeacherClassAssignment, School, StudentDoubt, TopicPoll, Worksheet, PrepMaterial, TaughtTopic, LessonFeedback,
} from './types'

// ─── Classes / Assignments ──────────────────────────────────────────────────
// Only the two writes lib/sync.ts's offline queue needs — reads and deletes
// go through context.tsx's own upsertOwnClass/upsertOwnAssignment-adjacent
// calls directly, not through this file, for those flows.

export async function upsertClass(c: Class) {
  const res = await backendFetch('/api/teacher/classes', { method: 'POST', body: JSON.stringify(c) })
  if (!res.ok) throw new Error(`Failed to save class (${res.status})`)
}

export async function upsertAssignment(a: TeacherClassAssignment) {
  const res = await backendFetch('/api/teacher/assignments', { method: 'POST', body: JSON.stringify(a) })
  if (!res.ok) throw new Error(`Failed to save assignment (${res.status})`)
}

// ─── Syllabus Topics ──────────────────────────────────────────────────────────

export async function upsertSyllabusTopic(t: SyllabusTopic) {
  const res = await backendFetch('/api/teacher/syllabus-topics', { method: 'POST', body: JSON.stringify(t) })
  if (!res.ok) throw new Error(`Failed to save syllabus topic (${res.status})`)
}

// Scoped by class only, not by who originally authored a topic — syllabus
// content belongs to the class (now typically admin-authored, grade+subject-
// wide), not to whichever teacher happened to create the row.
export async function fetchSyllabusTopics(_teacherId: string, classIds: string[]): Promise<SyllabusTopic[]> {
  if (!classIds.length) return []
  const res = await backendFetch(`/api/teacher/syllabus-topics?classIds=${classIds.map(encodeURIComponent).join(',')}`)
  if (!res.ok) throw new Error(`Failed to load syllabus topics (${res.status})`)
  const { topics } = await res.json() as { topics: SyllabusTopic[] }
  return topics
}

export async function deleteSyllabusTopics(ids: string[]) {
  if (!ids.length) return
  await backendFetch(`/api/teacher/syllabus-topics?ids=${ids.map(encodeURIComponent).join(',')}`, { method: 'DELETE' })
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function upsertSession(s: Session) {
  const res = await backendFetch('/api/teacher/sessions', { method: 'POST', body: JSON.stringify(s) })
  if (!res.ok) throw new Error(`Failed to save session (${res.status})`)
}

export async function fetchSessions(_teacherId: string): Promise<Session[]> {
  const res = await backendFetch('/api/teacher/sessions')
  if (!res.ok) throw new Error(`Failed to load sessions (${res.status})`)
  const { sessions } = await res.json() as { sessions: Session[] }
  return sessions
}

// ─── Students ─────────────────────────────────────────────────────────────────

export async function upsertStudent(s: Student) {
  const res = await backendFetch('/api/teacher/students', { method: 'POST', body: JSON.stringify(s) })
  if (!res.ok) throw new Error(`Failed to save student (${res.status})`)
}

export async function fetchStudentsByClasses(classIds: string[]): Promise<Student[]> {
  if (!classIds.length) return []
  const res = await backendFetch(`/api/teacher/students?classIds=${classIds.map(encodeURIComponent).join(',')}`)
  if (!res.ok) throw new Error(`Failed to load students (${res.status})`)
  const { students } = await res.json() as { students: Student[] }
  return students
}

// ─── Tests ────────────────────────────────────────────────────────────────────

export async function upsertTest(t: Test) {
  const res = await backendFetch('/api/teacher/tests', { method: 'POST', body: JSON.stringify(t) })
  if (!res.ok) throw new Error(`Failed to save test (${res.status})`)
}

export async function fetchTests(_teacherId: string): Promise<Test[]> {
  const res = await backendFetch('/api/teacher/tests')
  if (!res.ok) throw new Error(`Failed to load tests (${res.status})`)
  const { tests } = await res.json() as { tests: Test[] }
  return tests
}

// ─── Marks ────────────────────────────────────────────────────────────────────

export async function upsertMark(m: Mark) {
  const res = await backendFetch('/api/teacher/marks', { method: 'POST', body: JSON.stringify(m) })
  if (!res.ok) throw new Error(`Failed to save mark (${res.status})`)
}

export async function fetchMarks(_teacherId: string): Promise<Mark[]> {
  const res = await backendFetch('/api/teacher/marks')
  if (!res.ok) throw new Error(`Failed to load marks (${res.status})`)
  const { marks } = await res.json() as { marks: Mark[] }
  return marks
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export async function upsertAttendanceRecord(a: Attendance) {
  const res = await backendFetch('/api/teacher/attendance', { method: 'POST', body: JSON.stringify(a) })
  if (!res.ok) throw new Error(`Failed to save attendance (${res.status})`)
}

export async function fetchAttendance(classIds: string[]): Promise<Attendance[]> {
  if (!classIds.length) return []
  const res = await backendFetch(`/api/teacher/attendance?classIds=${classIds.map(encodeURIComponent).join(',')}`)
  if (!res.ok) throw new Error(`Failed to load attendance (${res.status})`)
  const { attendance } = await res.json() as { attendance: Attendance[] }
  return attendance
}

export async function deleteAttendanceBySession(sessionId: string) {
  try {
    await backendFetch(`/api/teacher/attendance?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
  } catch { /* ignore */ }
}

// ─── Topic Mastery ────────────────────────────────────────────────────────────

export async function upsertTopicMastery(m: TopicMastery) {
  const res = await backendFetch('/api/teacher/topic-mastery', { method: 'POST', body: JSON.stringify(m) })
  if (!res.ok) throw new Error(`Failed to save topic mastery (${res.status})`)
}

export async function fetchTopicMastery(_teacherId: string, classIds?: string[]): Promise<TopicMastery[]> {
  const qs = classIds?.length ? `?classIds=${classIds.map(encodeURIComponent).join(',')}` : ''
  const res = await backendFetch(`/api/teacher/topic-mastery${qs}`)
  if (!res.ok) throw new Error(`Failed to load topic mastery (${res.status})`)
  const { mastery } = await res.json() as { mastery: TopicMastery[] }
  return mastery
}

// ─── Syllabus Sub-Topics ──────────────────────────────────────────────────────

export async function upsertSubTopic(t: SyllabusSubTopic): Promise<void> {
  try {
    const res = await backendFetch('/api/teacher/syllabus-sub-topics', { method: 'POST', body: JSON.stringify(t) })
    if (!res.ok) throw new Error(`Failed to save sub-topic (${res.status})`)
  } catch { /* table may not exist yet */ }
}

// Scoped by class only, not by author — same fix as fetchSyllabusTopics, now
// load-bearing here too since admin-authored sub-topics have no teacher_id
// a teacher's own fetch could ever match.
export async function fetchSubTopics(_teacherId: string, classIds: string[]): Promise<SyllabusSubTopic[]> {
  try {
    if (!classIds.length) return []
    const res = await backendFetch(`/api/teacher/syllabus-sub-topics?classIds=${classIds.map(encodeURIComponent).join(',')}`)
    if (!res.ok) return []
    const { subTopics } = await res.json() as { subTopics: SyllabusSubTopic[] }
    return subTopics
  } catch { return [] }
}

export async function deleteSubTopics(ids: string[]) {
  if (!ids.length) return
  try {
    await backendFetch(`/api/teacher/syllabus-sub-topics?ids=${ids.map(encodeURIComponent).join(',')}`, { method: 'DELETE' })
  } catch { /* ignore */ }
}

// ─── Recovery Attempts ────────────────────────────────────────────────────────

export async function upsertRecoveryAttempt(r: RecoveryAttempt) {
  const res = await backendFetch('/api/teacher/recovery-attempts', { method: 'POST', body: JSON.stringify(r) })
  if (!res.ok) throw new Error(`Failed to save recovery attempt (${res.status})`)
}

// ─── Timetable ────────────────────────────────────────────────────────────────

export async function upsertTimetableEntry(e: TimetableEntry) {
  try {
    const res = await backendFetch('/api/teacher/timetable', { method: 'POST', body: JSON.stringify(e) })
    if (!res.ok) throw new Error(`Failed to save timetable entry (${res.status})`)
  } catch { /* table may not exist yet */ }
}

export async function fetchTimetableEntries(_teacherId: string): Promise<TimetableEntry[]> {
  try {
    const res = await backendFetch('/api/teacher/timetable')
    if (!res.ok) return []
    const { timetable } = await res.json() as { timetable: TimetableEntry[] }
    return timetable
  } catch { return [] }
}

export async function deleteTimetableEntry(id: string) {
  try {
    await backendFetch(`/api/teacher/timetable?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch { /* ignore */ }
}

// ─── Catchup Materials ────────────────────────────────────────────────────────

export async function upsertCatchupMaterial(m: CatchupMaterial) {
  try {
    const res = await backendFetch('/api/teacher/catchup-materials', { method: 'POST', body: JSON.stringify(m) })
    if (!res.ok) throw new Error(`Failed to save catchup material (${res.status})`)
  } catch { /* table may not exist yet */ }
}

export async function fetchCatchupMaterials(_teacherId: string): Promise<CatchupMaterial[]> {
  try {
    const res = await backendFetch('/api/teacher/catchup-materials')
    if (!res.ok) return []
    const { catchupMaterials } = await res.json() as { catchupMaterials: CatchupMaterial[] }
    return catchupMaterials
  } catch { return [] }
}

export async function updateCatchupStatus(id: string, status: CatchupMaterial['status']) {
  try {
    await backendFetch(`/api/teacher/catchup-materials/${encodeURIComponent(id)}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH' })
  } catch { /* ignore */ }
}

// ─── Prep Materials ───────────────────────────────────────────────────────────

export async function upsertPrepMaterial(m: PrepMaterial) {
  try {
    const res = await backendFetch('/api/teacher/prep-materials', { method: 'POST', body: JSON.stringify(m) })
    if (!res.ok) throw new Error(`Save failed (${res.status})`)
  } catch (err) {
    // Best-effort — the teacher already has the generated lesson on screen, so a save
    // failure shouldn't block them. But it must not disappear silently either, or a
    // schema mismatch like the missing `lesson` column bug can hide indefinitely.
    console.error('upsertPrepMaterial failed:', err)
  }
}

export async function fetchPrepMaterials(_teacherId: string): Promise<PrepMaterial[]> {
  try {
    const res = await backendFetch('/api/teacher/prep-materials')
    if (!res.ok) return []
    const { prepMaterials } = await res.json() as { prepMaterials: PrepMaterial[] }
    return prepMaterials
  } catch { return [] }
}

// ─── Taught Topics (per-day, shown on the timetable) ──────────────────────────

export async function upsertTaughtTopic(t: TaughtTopic) {
  try {
    const res = await backendFetch('/api/teacher/taught-topics', { method: 'POST', body: JSON.stringify(t) })
    if (!res.ok) throw new Error(`Failed to save taught topic (${res.status})`)
  } catch { /* table may not exist yet */ }
}

export async function fetchTaughtTopics(_teacherId: string): Promise<TaughtTopic[]> {
  try {
    const res = await backendFetch('/api/teacher/taught-topics')
    if (!res.ok) return []
    const { taughtTopics } = await res.json() as { taughtTopics: TaughtTopic[] }
    return taughtTopics
  } catch { return [] }
}

// ─── Lesson Feedback (post-Classroom-Mode reflection) ─────────────────────────

export async function upsertLessonFeedback(f: LessonFeedback) {
  try {
    const res = await backendFetch('/api/teacher/lesson-feedback', { method: 'POST', body: JSON.stringify(f) })
    if (!res.ok) throw new Error(`Save failed (${res.status})`)
  } catch (err) {
    console.error('upsertLessonFeedback failed:', err)
  }
}

// First real read path against this table — it was write-only before the
// post-class feedback loop closed the gap. Returns the most recent flagged
// feedback for this exact class+topic, if any.
export async function getLatestLessonFeedback(classId: string, topic: string): Promise<LessonFeedback | null> {
  try {
    const res = await backendFetch(`/api/teacher/lesson-feedback/latest?classId=${encodeURIComponent(classId)}&topic=${encodeURIComponent(topic)}`)
    if (!res.ok) return null
    const { feedback } = await res.json() as { feedback: LessonFeedback | null }
    return feedback
  } catch { return null }
}

// Fills in the interpreted takeaway for one feedback row, after the fact —
// only called when something on it was actually flagged.
export async function updateLessonFeedbackInsight(feedbackId: string, insight: string) {
  try {
    const res = await backendFetch(`/api/teacher/lesson-feedback/${encodeURIComponent(feedbackId)}/insight?insight=${encodeURIComponent(insight)}`, { method: 'PATCH' })
    if (!res.ok) throw new Error(`Failed (${res.status})`)
  } catch (err) {
    console.error('updateLessonFeedbackInsight failed:', err)
  }
}

// Replaces this class's running feedback-tendency summary in place — read by
// every future prep-material generation for this class, regardless of topic.
export async function updateClassFeedbackProfile(classId: string, profile: string) {
  try {
    const res = await backendFetch(`/api/teacher/classes/${encodeURIComponent(classId)}/feedback-profile?profile=${encodeURIComponent(profile)}`, { method: 'PATCH' })
    if (!res.ok) throw new Error(`Failed (${res.status})`)
  } catch (err) {
    console.error('updateClassFeedbackProfile failed:', err)
  }
}

// ─── Interventions ────────────────────────────────────────────────────────────

export async function upsertIntervention(n: InterventionNote) {
  try {
    const res = await backendFetch('/api/teacher/interventions', { method: 'POST', body: JSON.stringify(n) })
    if (!res.ok) throw new Error(`Failed to save intervention (${res.status})`)
  } catch { /* table may not exist yet */ }
}

export async function fetchInterventions(_teacherId: string): Promise<InterventionNote[]> {
  try {
    const res = await backendFetch('/api/teacher/interventions')
    if (!res.ok) return []
    const { interventions } = await res.json() as { interventions: InterventionNote[] }
    return interventions
  } catch { return [] }
}

export async function fetchInterventionsByStudent(studentId: string): Promise<InterventionNote[]> {
  try {
    const res = await backendFetch(`/api/teacher/interventions/by-student?studentId=${encodeURIComponent(studentId)}`)
    if (!res.ok) return []
    const { interventions } = await res.json() as { interventions: InterventionNote[] }
    return interventions
  } catch { return [] }
}

export async function deleteIntervention(id: string) {
  try {
    await backendFetch(`/api/teacher/interventions?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch { /* ignore */ }
}

// ─── Teacher Class Assignments ────────────────────────────────────────────────

// ─── Student Doubts ───────────────────────────────────────────────────────────

export async function upsertStudentDoubt(d: StudentDoubt) {
  try {
    const res = await backendFetch('/api/teacher/student-doubts', { method: 'POST', body: JSON.stringify(d) })
    if (!res.ok) throw new Error(`Failed to save doubt (${res.status})`)
  } catch { /* table may not exist yet */ }
}

export async function fetchStudentDoubtsByClasses(classIds: string[]): Promise<StudentDoubt[]> {
  if (!classIds.length) return []
  try {
    const res = await backendFetch(`/api/teacher/student-doubts?classIds=${classIds.map(encodeURIComponent).join(',')}`)
    if (!res.ok) return []
    const { doubts } = await res.json() as { doubts: StudentDoubt[] }
    return doubts
  } catch { return [] }
}

export async function updateDoubtAnswer(id: string, answer: string) {
  try {
    await backendFetch(`/api/teacher/student-doubts/${encodeURIComponent(id)}/answer?answer=${encodeURIComponent(answer)}`, { method: 'PATCH' })
  } catch { /* ignore */ }
}

export async function countPendingDoubts(classIds: string[]): Promise<number> {
  if (!classIds.length) return 0
  try {
    const res = await backendFetch(`/api/teacher/student-doubts/pending-count?classIds=${classIds.map(encodeURIComponent).join(',')}`)
    if (!res.ok) return 0
    const { count } = await res.json() as { count: number }
    return count
  } catch { return 0 }
}

// ─── Topic Polls ──────────────────────────────────────────────────────────────

export async function fetchTopicPollsByClass(classId: string): Promise<TopicPoll[]> {
  try {
    const res = await backendFetch(`/api/teacher/topic-polls?classId=${encodeURIComponent(classId)}`)
    if (!res.ok) return []
    const { polls } = await res.json() as { polls: TopicPoll[] }
    return polls
  } catch { return [] }
}

// ─── Worksheets ───────────────────────────────────────────────────────────────

export async function fetchWorksheets(teacherId: string): Promise<Worksheet[]> {
  try {
    const res = await backendFetch(`/api/worksheets?teacherId=${encodeURIComponent(teacherId)}`)
    if (!res.ok) return []
    const { worksheets: data } = await res.json()
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id, teacherId: r.teacher_id,
      classId: r.class_id ?? undefined,
      topic: r.topic, subject: (r.subject as string) ?? '',
      grade: (r.grade as string) ?? '', template: (r.template as string) ?? undefined,
      totalMarks: (r.total_marks as number) ?? 0,
      sections: r.sections ?? [],
      answerKey: r.answer_key ?? {},
      createdAt: (r.created_at as string) ?? '',
    }))
  } catch { return [] }
}

export async function upsertWorksheet(w: Worksheet) {
  const res = await backendFetch('/api/worksheets', {
    method: 'POST',
    body: JSON.stringify({
      id: w.id, teacherId: w.teacherId,
      classId: w.classId ?? null,
      topic: w.topic, subject: w.subject, grade: w.grade,
      template: w.template ?? null,
      totalMarks: w.totalMarks,
      sections: w.sections,
      answerKey: w.answerKey,
      createdAt: w.createdAt,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Save failed (${res.status})`)
  }
}

export async function deleteWorksheet(id: string) {
  await backendFetch(`/api/worksheets?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}
