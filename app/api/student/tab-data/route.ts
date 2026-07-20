import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { apiLog, getClientIp } from '@/lib/logger'
import { verifyStudentCookie, verifyStudentAccess } from '@/lib/student-auth'

export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()
  try {
    const cookieStudentId = verifyStudentCookie(req.cookies.get('edu-student-id')?.value)
    if (!cookieStudentId) {
      apiLog({ route: 'student/tab-data', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const classId   = searchParams.get('classId')
    const studentId = searchParams.get('studentId')
    const teacherId = searchParams.get('teacherId') // optional — scopes data to a specific teacher

    if (!classId || !studentId) {
      apiLog({ route: 'student/tab-data', ip, userId: cookieStudentId, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
      return NextResponse.json({ error: 'classId and studentId required' }, { status: 400 })
    }

    // The requested (studentId, classId) must belong to the same physical student as
    // the authenticated cookie — closes an IDOR that let any student read any other
    // student's attendance/marks/mastery by just changing these query params.
    if (!(await verifyStudentAccess(cookieStudentId, studentId, classId))) {
      apiLog({ route: 'student/tab-data', ip, userId: cookieStudentId, durationMs: Date.now() - t, fromCache: false, status: 'forbidden' })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createAdminClient()

    // When teacherId is provided, filter teacher-owned data (sessions/syllabus/tests) by that teacher
    let testsQ = supabase.from('tests').select('*').eq('class_id', classId)
    let sessionsQ = supabase.from('sessions').select('*').eq('class_id', classId)
    let syllabusQ = supabase.from('syllabus_topics').select('*').eq('class_id', classId).order('order_index')
    if (teacherId) {
      testsQ = testsQ.eq('teacher_id', teacherId)
      sessionsQ = sessionsQ.eq('teacher_id', teacherId)
      syllabusQ = syllabusQ.eq('teacher_id', teacherId)
    }

    const today = new Date().toISOString().slice(0, 10)

    const [
      attendanceRes,
      marksRes,
      testsRes,
      masteryRes,
      catchupRes,
      sessionsRes,
      syllabusRes,
      timetableRes,
      doubtsRes,
      pollsRes,
      substitutionsRes,
    ] = await Promise.all([
      supabase.from('attendance').select('*').eq('student_id', studentId).eq('class_id', classId),
      supabase.from('marks').select('*').eq('student_id', studentId),
      testsQ,
      supabase.from('student_topic_mastery').select('*').eq('student_id', studentId),
      supabase.from('catchup_materials').select('*').eq('student_id', studentId),
      sessionsQ,
      syllabusQ,
      supabase.from('timetable').select('*').eq('class_id', classId),
      supabase.from('student_doubts').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
      supabase.from('topic_polls').select('*').eq('student_id', studentId).eq('class_id', classId),
      supabase.from('timetable_substitutions').select('*').eq('class_id', classId).eq('date', today),
    ])

    // A failed query (network blip, RLS/permissions issue) must not silently look
    // like "no data" — surface it as an error instead of an empty-looking dashboard.
    const results = [
      attendanceRes, marksRes, testsRes, masteryRes, catchupRes,
      sessionsRes, syllabusRes, timetableRes, doubtsRes, pollsRes, substitutionsRes,
    ]
    const failed = results.find(r => r.error)
    if (failed?.error) throw new Error(failed.error.message)

    const substituteTeacherIds = [...new Set((substitutionsRes.data ?? []).map(r => r.substitute_teacher_id).filter(Boolean))]
    const substituteNames = substituteTeacherIds.length
      ? await supabase.from('teachers').select('id, name').in('id', substituteTeacherIds)
      : { data: [] as { id: string; name: string }[] }
    const nameById = new Map((substituteNames.data ?? []).map(t => [t.id, t.name]))

    apiLog({ route: 'student/tab-data', ip, userId: cookieStudentId, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({
      attendance: (attendanceRes.data ?? []).map(r => ({
        id: r.id, sessionId: r.session_id ?? '', studentId: r.student_id,
        classId: r.class_id ?? '', syllabusTopicId: r.syllabus_topic_id ?? '',
        date: r.date, status: r.status,
      })),
      marks: (marksRes.data ?? []).map(r => {
        const test = (testsRes.data ?? []).find(t => t.id === r.test_id)
        return {
          id: r.id, testId: r.test_id, studentId: r.student_id, score: r.score,
          feedback: r.feedback ?? undefined, enteredAt: r.entered_at,
          source: r.source ?? undefined,
          topic: test?.topic ?? '',
          totalMarks: test?.total_marks ?? 0,
          conductedOn: test?.conducted_on ?? '',
        }
      }).filter(m => m.topic !== ''),
      tests: (testsRes.data ?? []).map(r => ({
        id: r.id, teacherId: r.teacher_id, classId: r.class_id,
        subject: r.subject, topic: r.topic, totalMarks: r.total_marks,
        conductedOn: r.conducted_on, term: r.term ?? undefined,
      })),
      mastery: (masteryRes.data ?? []).map(r => ({
        id: r.id, studentId: r.student_id, topic: r.topic, subject: r.subject,
        mastery: r.mastery, attempts: r.attempts, lastUpdated: r.last_updated,
      })),
      catchupMaterials: (catchupRes.data ?? []).map(r => ({
        id: r.id, teacherId: r.teacher_id, studentId: r.student_id,
        studentName: r.student_name, topic: r.topic, subject: r.subject,
        grade: r.grade, explanation: r.explanation,
        practiceQuestions: r.practice_questions ?? [],
        activity: r.activity, focusNote: r.focus_note,
        status: r.status, createdAt: r.created_at,
        reason: r.reason ?? undefined,
      })),
      sessions: (sessionsRes.data ?? []).map(r => ({
        id: r.id, classId: r.class_id, teacherId: r.teacher_id,
        syllabusTopicId: r.syllabus_topic_id, topic: r.topic,
        date: r.date, createdAt: r.created_at ?? '',
      })),
      syllabusTopics: (syllabusRes.data ?? []).map(r => ({
        id: r.id, classId: r.class_id, teacherId: r.teacher_id,
        topic: r.topic, description: r.description ?? '',
        weekNumber: r.week_number ?? undefined, orderIndex: r.order_index ?? 0,
        isCompleted: r.is_completed ?? false, createdAt: r.created_at ?? '',
        estimatedSessions: r.estimated_sessions ?? undefined,
        definitionId: r.definition_id ?? undefined,
        subject: r.subject ?? undefined,
        prerequisiteDefinitionId: r.prerequisite_definition_id ?? undefined,
      })),
      timetable: (timetableRes.data ?? []).map(r => ({
        id: r.id, teacherId: r.teacher_id, classId: r.class_id,
        dayOfWeek: r.day_of_week, periodNumber: r.period_number,
        startTime: r.start_time, endTime: r.end_time,
        label: r.label ?? undefined,
      })),
      // Today's substitute coverage for this class, if any — periodNumber
      // matches a row in `timetable` above so the client can flag that period.
      substitutions: (substitutionsRes.data ?? []).map(r => ({
        periodNumber: r.period_number,
        subject: r.subject ?? undefined,
        substituteTeacherName: r.substitute_teacher_id ? (nameById.get(r.substitute_teacher_id) ?? 'a substitute teacher') : undefined,
        status: r.status,
      })),
      doubts: (doubtsRes.data ?? []).map(r => ({
        id: r.id, studentId: r.student_id, studentName: r.student_name,
        classId: r.class_id, subject: r.subject, question: r.question,
        answer: r.answer ?? undefined, answeredAt: r.answered_at ?? undefined,
        createdAt: r.created_at ?? '', status: r.status ?? 'pending',
      })),
      polls: (pollsRes.data ?? []).map(r => ({
        id: r.id, studentId: r.student_id, classId: r.class_id,
        syllabusTopicId: r.syllabus_topic_id, topic: r.topic,
        subject: r.subject, response: r.response, respondedAt: r.responded_at,
      })),
    })
  } catch (err) {
    apiLog({ route: 'student/tab-data', ip, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
