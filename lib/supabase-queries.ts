import { supabase } from './supabase'
import type {
  Teacher, Student, Test, Mark, TopicMastery, RecoveryAttempt,
  Class, SyllabusTopic, Attendance, Session, SyllabusSubTopic, TimetableEntry, CatchupMaterial, InterventionNote,
  TeacherClassAssignment, School, StudentDoubt, TopicPoll, Worksheet, PrepMaterial, TaughtTopic, LessonFeedback,
} from './types'

// ─── Schools ──────────────────────────────────────────────────────────────────

function genJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function createSchool(name: string, createdBy: string): Promise<School> {
  let code = genJoinCode()
  for (let i = 0; i < 5; i++) {
    const { error } = await supabase.from('schools').insert({
      name, join_code: code, created_by: createdBy,
    })
    if (!error) break
    if (error.code !== '23505') throw error
    code = genJoinCode()
  }
  const { data, error } = await supabase.from('schools')
    .select('*').eq('join_code', code).single()
  if (error || !data) throw error ?? new Error('School create failed')
  return { id: data.id, name: data.name, joinCode: data.join_code, createdBy: data.created_by, createdAt: data.created_at }
}

export async function joinSchool(joinCode: string): Promise<School | null> {
  const { data, error } = await supabase.from('schools')
    .select('*').eq('join_code', joinCode.toUpperCase().trim()).single()
  if (error || !data) return null
  return { id: data.id, name: data.name, joinCode: data.join_code, createdBy: data.created_by, createdAt: data.created_at }
}

export async function findSchoolByName(name: string): Promise<School | null> {
  const { data, error } = await supabase.from('schools')
    .select('*').ilike('name', name.trim()).limit(1).single()
  if (error || !data) return null
  return { id: data.id, name: data.name, joinCode: data.join_code, createdBy: data.created_by, createdAt: data.created_at }
}

export async function fetchSchoolById(schoolId: string): Promise<School | null> {
  const { data, error } = await supabase.from('schools')
    .select('*').eq('id', schoolId).single()
  if (error || !data) return null
  return { id: data.id, name: data.name, joinCode: data.join_code, createdBy: data.created_by, createdAt: data.created_at }
}

// ─── Teachers ─────────────────────────────────────────────────────────────────

export async function upsertTeacher(t: Teacher) {
  const { error } = await supabase.from('teachers').upsert({
    id: t.id,
    user_id: t.userId,
    name: t.name,
    school_name: t.schoolName,
    school_id: t.schoolId ?? null,
    subject: t.subject,
    grade: t.grade,
    phone: t.phone,
    language_preference: t.languagePreference,
    academic_year_start: t.academicYearStart ?? null,
    current_term: t.currentTerm ?? null,
    teacher_code: t.teacherCode ?? null,
    teaching_profile: t.teachingProfile ?? null,
  })
  if (error) throw error
}

export async function fetchTeacher(userId: string): Promise<Teacher | null> {
  const { data, error } = await supabase.from('teachers').select('*').eq('id', userId).single()
  if (error || !data) return null
  return {
    id: data.id,
    userId: data.user_id ?? data.id,
    name: data.name ?? '',
    schoolName: data.school_name ?? '',
    schoolId: data.school_id ?? undefined,
    subject: data.subject ?? '',
    grade: data.grade ?? '',
    phone: data.phone ?? '',
    languagePreference: data.language_preference ?? 'english',
    academicYearStart: data.academic_year_start ?? undefined,
    currentTerm: data.current_term ?? undefined,
    teacherCode: data.teacher_code ?? undefined,
    teachingProfile: data.teaching_profile ?? undefined,
  }
}

// ─── Classes ──────────────────────────────────────────────────────────────────

export async function upsertClass(c: Class) {
  const { error } = await supabase.from('classes').upsert({
    id: c.id, teacher_id: c.teacherId, school_name: c.schoolName,
    school_id: c.schoolId ?? null,
    name: c.name, grade: c.grade, section: c.section,
    academic_year: c.academicYear, created_at: c.createdAt,
    class_code: c.classCode ?? null,
  })
  if (error) throw error
}

export async function deleteClass(id: string) {
  await supabase.from('classes').delete().eq('id', id)
}

export async function fetchClasses(teacherId: string, _schoolId?: string, _schoolName?: string): Promise<Class[]> {
  const mapRow = (r: Record<string, unknown>) => ({
    id: r.id as string, teacherId: r.teacher_id as string, schoolName: (r.school_name as string) ?? '',
    schoolId: (r.school_id as string) ?? undefined,
    name: r.name as string, grade: r.grade as string, section: (r.section as string) ?? '',
    academicYear: (r.academic_year as string) ?? '', createdAt: (r.created_at as string) ?? '',
    classCode: (r.class_code as string) ?? undefined,
  })

  // Fetch own classes and assignments in parallel
  const [ownResult, assignResult] = await Promise.all([
    supabase.from('classes').select('*').order('created_at').eq('teacher_id', teacherId),
    supabase.from('teacher_class_assignments').select('class_id').eq('teacher_id', teacherId),
  ])
  if (ownResult.error) throw ownResult.error

  const ownRows = ownResult.data ?? []
  const ownIds = new Set(ownRows.map((r: Record<string, unknown>) => r.id as string))

  // Admin-assigned classes not already owned
  const extraIds = (assignResult.data ?? [])
    .map((a: Record<string, unknown>) => a.class_id as string)
    .filter((id: string) => !ownIds.has(id))

  let extraRows: Record<string, unknown>[] = []
  if (extraIds.length > 0) {
    const { data } = await supabase.from('classes').select('*').in('id', extraIds).order('created_at')
    extraRows = data ?? []
  }

  return [...ownRows, ...extraRows].map(mapRow)
}

// ─── Syllabus Topics ──────────────────────────────────────────────────────────

export async function upsertSyllabusTopic(t: SyllabusTopic) {
  const { error } = await supabase.from('syllabus_topics').upsert({
    id: t.id, class_id: t.classId, teacher_id: t.teacherId ?? null,
    grade: t.grade ?? null, subject: t.subject ?? null, definition_id: t.definitionId ?? null,
    topic: t.topic, description: t.description,
    week_number: t.weekNumber ?? null, order_index: t.orderIndex,
    is_completed: t.isCompleted, created_at: t.createdAt,
    estimated_sessions: t.estimatedSessions ?? null,
    prerequisite_definition_id: t.prerequisiteDefinitionId ?? null,
  })
  if (error) throw error
}

// Scoped by class only, not by who originally authored a topic — syllabus
// content belongs to the class (now typically admin-authored, grade+subject-
// wide), not to whichever teacher happened to create the row.
export async function fetchSyllabusTopics(_teacherId: string, classIds: string[]): Promise<SyllabusTopic[]> {
  if (!classIds.length) return []
  const { data, error } = await supabase
    .from('syllabus_topics').select('*')
    .in('class_id', classIds)
    .order('order_index')
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id, classId: r.class_id, teacherId: r.teacher_id ?? undefined,
    grade: r.grade ?? undefined, subject: r.subject ?? undefined, definitionId: r.definition_id ?? undefined,
    topic: r.topic, description: r.description ?? '',
    weekNumber: r.week_number ?? undefined, orderIndex: r.order_index ?? 0,
    isCompleted: r.is_completed ?? false, createdAt: r.created_at ?? '',
    estimatedSessions: r.estimated_sessions ?? undefined,
    prerequisiteDefinitionId: r.prerequisite_definition_id ?? undefined,
  }))
}

export async function deleteSyllabusTopics(ids: string[]) {
  if (!ids.length) return
  await supabase.from('syllabus_topics').delete().in('id', ids)
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function upsertSession(s: Session) {
  const { error } = await supabase.from('sessions').upsert({
    id: s.id, class_id: s.classId, teacher_id: s.teacherId,
    syllabus_topic_id: s.syllabusTopicId || null, topic: s.topic,
    date: s.date, created_at: s.createdAt,
    session_note: s.sessionNote ?? null,
    lesson_snapshot: s.lessonSnapshot ? JSON.stringify(s.lessonSnapshot) : null,
  }, { onConflict: 'id' })
  if (error) throw error
}

export async function fetchSessions(teacherId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions').select('*').eq('teacher_id', teacherId).order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id, classId: r.class_id, teacherId: r.teacher_id,
    syllabusTopicId: r.syllabus_topic_id, topic: r.topic,
    date: r.date, createdAt: r.created_at ?? '',
    sessionNote: r.session_note ?? undefined,
    lessonSnapshot: r.lesson_snapshot
      ? (typeof r.lesson_snapshot === 'string' ? JSON.parse(r.lesson_snapshot) : r.lesson_snapshot)
      : undefined,
  }))
}

// ─── Students ─────────────────────────────────────────────────────────────────

export async function upsertStudent(s: Student) {
  const { error } = await supabase.from('students').upsert({
    id: s.id, teacher_id: s.teacherId, class_id: s.classId, name: s.name,
    roll_number: s.rollNumber, is_active: s.isActive, interests: s.interests, goal: s.goal,
    pin: s.pin ?? null, student_code: s.studentCode ?? null,
  })
  if (error) throw error
}

export async function fetchStudents(teacherId: string): Promise<Student[]> {
  const { data, error } = await supabase.from('students').select('*').eq('teacher_id', teacherId).order('roll_number')
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id, teacherId: r.teacher_id, classId: r.class_id ?? '',
    name: r.name, rollNumber: r.roll_number, isActive: r.is_active,
    interests: r.interests ?? [], goal: r.goal ?? '',
    pin: r.pin ?? undefined,
    studentCode: r.student_code ?? undefined,
  }))
}

export async function fetchStudentsByClasses(classIds: string[]): Promise<Student[]> {
  if (!classIds.length) return []
  const { data, error } = await supabase
    .from('students').select('*').in('class_id', classIds).order('roll_number')
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id, teacherId: r.teacher_id, classId: r.class_id ?? '',
    name: r.name, rollNumber: r.roll_number, isActive: r.is_active,
    interests: r.interests ?? [], goal: r.goal ?? '',
    pin: r.pin ?? undefined,
    studentCode: r.student_code ?? undefined,
  }))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

export async function upsertTest(t: Test) {
  const { error } = await supabase.from('tests').upsert({
    id: t.id, teacher_id: t.teacherId, class_id: t.classId ?? null,
    subject: t.subject, topic: t.topic, total_marks: t.totalMarks, conducted_on: t.conductedOn,
    term: t.term ?? null,
    questions: t.questions ? JSON.stringify(t.questions) : null,
  })
  if (error) throw error
}

export async function fetchTests(teacherId: string): Promise<Test[]> {
  const { data, error } = await supabase.from('tests').select('*').eq('teacher_id', teacherId).order('conducted_on', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id, teacherId: r.teacher_id, classId: r.class_id ?? undefined,
    subject: r.subject, topic: r.topic, totalMarks: r.total_marks, conductedOn: r.conducted_on,
    term: r.term ?? undefined,
    questions: r.questions
      ? (typeof r.questions === 'string' ? JSON.parse(r.questions) : r.questions)
      : undefined,
  }))
}

// ─── Marks ────────────────────────────────────────────────────────────────────

export async function upsertMark(m: Mark) {
  const { error } = await supabase.from('marks').upsert({
    id: m.id, test_id: m.testId, student_id: m.studentId, score: m.score,
    feedback: m.feedback ?? null,
    breakdown: m.breakdown ?? null,
    entered_at: m.enteredAt,
    source: m.source ?? 'manual',
    image_url: m.imageUrl ?? null,
    drive_url: m.driveUrl ?? null,
  })
  if (error) throw error
}

export async function fetchMarks(teacherId: string): Promise<Mark[]> {
  const { data: tests, error: testError } = await supabase.from('tests').select('id').eq('teacher_id', teacherId)
  if (testError) throw testError
  if (!tests?.length) return []
  const { data, error } = await supabase.from('marks').select('*').in('test_id', tests.map(t => t.id))
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id, testId: r.test_id, studentId: r.student_id, score: r.score,
    feedback: r.feedback ?? undefined,
    breakdown: r.breakdown ?? undefined,
    enteredAt: r.entered_at,
    source: (r.source as Mark['source']) ?? undefined,
    imageUrl: r.image_url ?? undefined,
    driveUrl: r.drive_url ?? undefined,
  }))
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export async function upsertAttendanceRecord(a: Attendance) {
  const { error } = await supabase.from('attendance').upsert({
    id: a.id,
    session_id: a.sessionId || null,
    student_id: a.studentId,
    class_id: a.classId,
    syllabus_topic_id: a.syllabusTopicId || null,
    date: a.date,
    status: a.status,
  })
  if (error) throw error
}

export async function fetchAttendance(classIds: string[]): Promise<Attendance[]> {
  if (!classIds.length) return []
  const { data, error } = await supabase
    .from('attendance').select('*').in('class_id', classIds).order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id,
    sessionId: r.session_id ?? '',
    studentId: r.student_id,
    classId: r.class_id ?? '',
    syllabusTopicId: r.syllabus_topic_id ?? '',
    date: r.date,
    status: r.status,
  }))
}

export async function deleteAttendanceBySession(sessionId: string) {
  try {
    await supabase.from('attendance').delete().eq('session_id', sessionId)
  } catch { /* ignore */ }
}

// ─── Topic Mastery ────────────────────────────────────────────────────────────

export async function upsertTopicMastery(m: TopicMastery) {
  const { error } = await supabase.from('student_topic_mastery').upsert(
    {
      id: m.id, student_id: m.studentId, topic: m.topic, subject: m.subject,
      mastery: m.mastery, attempts: m.attempts, last_updated: m.lastUpdated,
    },
    { onConflict: 'student_id,topic' }
  )
  if (error) throw error
}

export async function fetchTopicMastery(teacherId: string, classIds?: string[]): Promise<TopicMastery[]> {
  const { data: students, error: studentsError } = classIds?.length
    ? await supabase.from('students').select('id').in('class_id', classIds)
    : await supabase.from('students').select('id').eq('teacher_id', teacherId)
  if (studentsError) throw studentsError
  if (!students?.length) return []
  const { data, error } = await supabase.from('student_topic_mastery').select('*').in('student_id', students.map(s => s.id))
  if (error) throw error
  return (data ?? []).map(r => ({
    id: r.id, studentId: r.student_id, topic: r.topic, subject: r.subject,
    mastery: r.mastery, attempts: r.attempts, lastUpdated: r.last_updated,
  }))
}

// ─── Syllabus Sub-Topics ──────────────────────────────────────────────────────

export async function upsertSubTopic(t: SyllabusSubTopic): Promise<void> {
  try {
    const { error } = await supabase.from('syllabus_sub_topics').upsert({
      id: t.id, topic_id: t.topicId, class_id: t.classId,
      teacher_id: t.teacherId ?? null, definition_id: t.definitionId ?? null,
      name: t.name, description: t.description ?? null, order_index: t.orderIndex,
      is_completed: t.isCompleted, completed_at: t.completedAt ?? null, created_at: t.createdAt,
      estimated_sessions: t.estimatedSessions ?? null,
    })
    if (error) throw error
  } catch { /* table may not exist yet */ }
}

// Scoped by class only, not by author — same fix as fetchSyllabusTopics, now
// load-bearing here too since admin-authored sub-topics have no teacher_id
// a teacher's own fetch could ever match.
export async function fetchSubTopics(_teacherId: string, classIds: string[]): Promise<SyllabusSubTopic[]> {
  try {
    if (!classIds.length) return []
    const { data, error } = await supabase
      .from('syllabus_sub_topics').select('*')
      .in('class_id', classIds)
      .order('order_index')
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id, topicId: r.topic_id, classId: r.class_id,
      teacherId: r.teacher_id ?? undefined, definitionId: r.definition_id ?? undefined,
      name: r.name, description: r.description ?? undefined, orderIndex: r.order_index ?? 0,
      isCompleted: r.is_completed ?? false, completedAt: r.completed_at ?? undefined,
      createdAt: r.created_at ?? '', estimatedSessions: r.estimated_sessions ?? undefined,
    }))
  } catch { return [] }
}

export async function deleteSubTopics(ids: string[]) {
  if (!ids.length) return
  try {
    await supabase.from('syllabus_sub_topics').delete().in('id', ids)
  } catch { /* ignore */ }
}

// ─── Recovery Attempts ────────────────────────────────────────────────────────

export async function upsertRecoveryAttempt(r: RecoveryAttempt) {
  const { error } = await supabase.from('recovery_attempts').upsert({
    id: r.id, student_id: r.studentId, topic: r.topic,
    approach_used: r.approachUsed, helped: r.helped, generated_at: r.generatedAt,
  })
  if (error) throw error
}

export async function fetchPreviousApproaches(studentId: string, topic: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('recovery_attempts').select('approach_used').eq('student_id', studentId).eq('topic', topic)
    .order('generated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(r => r.approach_used).filter(Boolean)
}

// ─── Timetable ────────────────────────────────────────────────────────────────

export async function upsertTimetableEntry(e: TimetableEntry) {
  try {
    const { error } = await supabase.from('timetable').upsert({
      id: e.id, teacher_id: e.teacherId, class_id: e.classId,
      day_of_week: e.dayOfWeek, period_number: e.periodNumber,
      start_time: e.startTime, end_time: e.endTime,
      label: e.label ?? null,
    })
    if (error) throw error
  } catch { /* table may not exist yet */ }
}

export async function fetchTimetableEntries(teacherId: string): Promise<TimetableEntry[]> {
  try {
    const { data, error } = await supabase.from('timetable').select('*').eq('teacher_id', teacherId)
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id, teacherId: r.teacher_id, classId: r.class_id,
      dayOfWeek: r.day_of_week, periodNumber: r.period_number,
      startTime: r.start_time, endTime: r.end_time,
      label: r.label ?? undefined,
    }))
  } catch { return [] }
}

export async function deleteTimetableEntry(id: string) {
  try {
    await supabase.from('timetable').delete().eq('id', id)
  } catch { /* ignore */ }
}

// ─── Catchup Materials ────────────────────────────────────────────────────────

export async function upsertCatchupMaterial(m: CatchupMaterial) {
  try {
    const { error } = await supabase.from('catchup_materials').upsert({
      id: m.id, teacher_id: m.teacherId, student_id: m.studentId,
      student_name: m.studentName, topic: m.topic, subject: m.subject,
      grade: m.grade, explanation: m.explanation,
      practice_questions: m.practiceQuestions,
      activity: m.activity, focus_note: m.focusNote,
      status: m.status, created_at: m.createdAt,
      reason: m.reason ?? null,
    })
    if (error) throw error
  } catch { /* table may not exist yet */ }
}

export async function fetchCatchupMaterials(teacherId: string): Promise<CatchupMaterial[]> {
  try {
    const { data, error } = await supabase
      .from('catchup_materials').select('*').eq('teacher_id', teacherId)
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id, teacherId: r.teacher_id, studentId: r.student_id,
      studentName: r.student_name, topic: r.topic, subject: r.subject,
      grade: r.grade, explanation: r.explanation,
      practiceQuestions: r.practice_questions ?? [],
      activity: r.activity, focusNote: r.focus_note,
      status: r.status, createdAt: r.created_at,
      reason: r.reason ?? undefined,
    }))
  } catch { return [] }
}

export async function updateCatchupStatus(id: string, status: CatchupMaterial['status']) {
  try {
    await supabase.from('catchup_materials').update({ status }).eq('id', id)
  } catch { /* ignore */ }
}

// ─── Prep Materials ───────────────────────────────────────────────────────────

export async function upsertPrepMaterial(m: PrepMaterial) {
  try {
    const { error } = await supabase.from('prep_materials').upsert({
      id: m.id, teacher_id: m.teacherId, class_id: m.classId,
      subject: m.subject, grade: m.grade, topic: m.topic,
      subtopic: m.subtopic ?? null,
      lesson: m.lesson,
      created_at: m.createdAt,
    })
    if (error) throw error
  } catch (err) {
    // Best-effort — the teacher already has the generated lesson on screen, so a save
    // failure shouldn't block them. But it must not disappear silently either, or a
    // schema mismatch like the missing `lesson` column bug can hide indefinitely.
    console.error('upsertPrepMaterial failed:', err)
  }
}

export async function fetchPrepMaterials(teacherId: string): Promise<PrepMaterial[]> {
  try {
    const { data, error } = await supabase
      .from('prep_materials').select('*').eq('teacher_id', teacherId)
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id, teacherId: r.teacher_id, classId: r.class_id,
      subject: r.subject, grade: r.grade, topic: r.topic,
      subtopic: r.subtopic ?? undefined,
      gapTopics: r.gap_topics ?? [], lesson: r.lesson,
      createdAt: r.created_at,
    }))
  } catch { return [] }
}

// ─── Taught Topics (per-day, shown on the timetable) ──────────────────────────

export async function upsertTaughtTopic(t: TaughtTopic) {
  try {
    const { error } = await supabase.from('taught_topics').upsert({
      id: t.id, teacher_id: t.teacherId, class_id: t.classId,
      date: t.date, topic: t.topic, subtopic: t.subtopic ?? null,
      created_at: t.createdAt,
    })
    if (error) throw error
  } catch { /* table may not exist yet */ }
}

export async function fetchTaughtTopics(teacherId: string): Promise<TaughtTopic[]> {
  try {
    const { data, error } = await supabase
      .from('taught_topics').select('*').eq('teacher_id', teacherId)
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id, teacherId: r.teacher_id, classId: r.class_id,
      date: r.date, topic: r.topic, subtopic: r.subtopic ?? undefined,
      createdAt: r.created_at,
    }))
  } catch { return [] }
}

// ─── Lesson Feedback (post-Classroom-Mode reflection) ─────────────────────────

export async function upsertLessonFeedback(f: LessonFeedback) {
  try {
    const { error } = await supabase.from('lesson_feedback').upsert({
      id: f.id, teacher_id: f.teacherId, class_id: f.classId,
      date: f.date, topic: f.topic, subtopic: f.subtopic ?? null,
      engagement: f.engagement, comprehension: f.comprehension, pacing: f.pacing,
      other_feedback: f.otherFeedback?.trim() || null,
      created_at: f.createdAt,
    })
    if (error) throw error
  } catch (err) {
    console.error('upsertLessonFeedback failed:', err)
  }
}

// ─── Interventions ────────────────────────────────────────────────────────────

export async function upsertIntervention(n: InterventionNote) {
  try {
    const { error } = await supabase.from('interventions').upsert({
      id: n.id, student_id: n.studentId, teacher_id: n.teacherId,
      note: n.note, date: n.date, created_at: n.createdAt,
    })
    if (error) throw error
  } catch { /* table may not exist yet */ }
}

export async function fetchInterventions(teacherId: string): Promise<InterventionNote[]> {
  try {
    const { data, error } = await supabase.from('interventions').select('*').eq('teacher_id', teacherId)
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id, studentId: r.student_id, teacherId: r.teacher_id,
      note: r.note, date: r.date, createdAt: r.created_at,
    }))
  } catch { return [] }
}

export async function fetchInterventionsByStudent(studentId: string): Promise<InterventionNote[]> {
  try {
    const { data, error } = await supabase.from('interventions').select('*').eq('student_id', studentId)
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id, studentId: r.student_id, teacherId: r.teacher_id,
      note: r.note, date: r.date, createdAt: r.created_at,
    }))
  } catch { return [] }
}

export async function deleteIntervention(id: string) {
  try {
    await supabase.from('interventions').delete().eq('id', id)
  } catch { /* ignore */ }
}

// ─── Teacher Class Assignments ────────────────────────────────────────────────

export async function upsertAssignment(a: TeacherClassAssignment) {
  try {
    const { error } = await supabase.from('teacher_class_assignments').upsert({
      id: a.id, teacher_id: a.teacherId, class_id: a.classId,
      subject: a.subject ?? null, created_at: a.createdAt,
    }, { onConflict: 'teacher_id,class_id' })
    if (error) throw error
  } catch { /* ignore if table not yet created */ }
}

export async function deleteAssignment(teacherId: string, classId: string) {
  try {
    await supabase.from('teacher_class_assignments')
      .delete().eq('teacher_id', teacherId).eq('class_id', classId)
  } catch { /* ignore */ }
}

export async function fetchAssignments(teacherId: string): Promise<TeacherClassAssignment[]> {
  try {
    const { data, error } = await supabase
      .from('teacher_class_assignments').select('*').eq('teacher_id', teacherId)
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id, teacherId: r.teacher_id, classId: r.class_id,
      subject: r.subject ?? undefined, createdAt: r.created_at ?? '',
    }))
  } catch { return [] }
}

// ─── Student Doubts ───────────────────────────────────────────────────────────

export async function upsertStudentDoubt(d: StudentDoubt) {
  try {
    const { error } = await supabase.from('student_doubts').upsert({
      id: d.id, student_id: d.studentId, student_name: d.studentName ?? '',
      class_id: d.classId, subject: d.subject ?? '', question: d.question,
      answer: d.answer ?? null, answered_at: d.answeredAt ?? null,
      created_at: d.createdAt, status: d.status,
    })
    if (error) throw error
  } catch { /* table may not exist yet */ }
}

export async function fetchStudentDoubtsByClasses(classIds: string[]): Promise<StudentDoubt[]> {
  if (!classIds.length) return []
  try {
    const { data, error } = await supabase
      .from('student_doubts').select('*')
      .in('class_id', classIds)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id, studentId: r.student_id, studentName: r.student_name ?? '',
      classId: r.class_id, subject: r.subject ?? '',
      question: r.question, answer: r.answer ?? undefined,
      answeredAt: r.answered_at ?? undefined,
      createdAt: r.created_at ?? '', status: r.status ?? 'pending',
    }))
  } catch { return [] }
}

export async function updateDoubtAnswer(id: string, answer: string) {
  try {
    const { error } = await supabase.from('student_doubts').update({
      answer, answered_at: new Date().toISOString(), status: 'answered',
    }).eq('id', id)
    if (error) throw error
  } catch { /* ignore */ }
}

export async function countPendingDoubts(classIds: string[]): Promise<number> {
  if (!classIds.length) return 0
  try {
    const { count } = await supabase
      .from('student_doubts')
      .select('id', { count: 'exact', head: true })
      .in('class_id', classIds)
      .eq('status', 'pending')
    return count ?? 0
  } catch { return 0 }
}

// ─── Topic Polls ──────────────────────────────────────────────────────────────

export async function upsertTopicPoll(p: TopicPoll) {
  try {
    const { error } = await supabase.from('topic_polls').upsert(
      {
        id: p.id, student_id: p.studentId, class_id: p.classId,
        syllabus_topic_id: p.syllabusTopicId, topic: p.topic,
        subject: p.subject, response: p.response, responded_at: p.respondedAt,
      },
      { onConflict: 'student_id,syllabus_topic_id' },
    )
    if (error) throw error
  } catch { /* table may not exist yet */ }
}

export async function fetchTopicPollsByClass(classId: string): Promise<TopicPoll[]> {
  try {
    const { data, error } = await supabase
      .from('topic_polls').select('*').eq('class_id', classId)
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id, studentId: r.student_id, classId: r.class_id,
      syllabusTopicId: r.syllabus_topic_id, topic: r.topic,
      subject: r.subject, response: r.response, respondedAt: r.responded_at,
    }))
  } catch { return [] }
}

// ─── Worksheets ───────────────────────────────────────────────────────────────

export async function fetchWorksheets(teacherId: string): Promise<Worksheet[]> {
  try {
    const res = await fetch(`/api/worksheets?teacherId=${encodeURIComponent(teacherId)}`)
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
  const res = await fetch('/api/worksheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  await fetch(`/api/worksheets?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}
