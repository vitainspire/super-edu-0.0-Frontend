import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ac = createAdminClient()

    // Verify caller is a teacher
    const { data: teacher } = await ac.from('teachers').select('id, name, school_id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Fetch student
    const { data: student } = await ac.from('students').select('*').eq('id', params.studentId).maybeSingle()
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    // Fetch the student's primary class
    const { data: cls } = await ac.from('classes').select('*').eq('id', student.class_id).maybeSingle()
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

    // School isolation: teacher may only view students from their own school
    if (teacher.school_id && cls.school_id && teacher.school_id !== cls.school_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Build subject list (same dual-model logic as /api/student/init)
    const subjects: Array<{
      classId: string
      subjectName: string
      teacherName: string
      teacherId: string | null
      // The row that actually owns this subject's attendance/marks — in the
      // legacy model each subject is a separate class with its own sibling
      // `students` row for the same physical child, distinct from `student.id`.
      studentRowId: string
    }> = []

    const { data: assignments } = await ac
      .from('teacher_class_assignments')
      .select('teacher_id, subject')
      .eq('class_id', cls.id)

    if (assignments && assignments.length > 0 && assignments.some((a: { subject: string }) => a.subject)) {
      // New model: one tab per subject assignment on this class — same student row throughout.
      for (const a of assignments) {
        const { data: t } = await ac.from('teachers').select('name').eq('id', a.teacher_id).maybeSingle()
        subjects.push({
          classId: cls.id,
          subjectName: a.subject || 'Subject',
          teacherName: t?.name ?? 'Unknown Teacher',
          teacherId: a.teacher_id,
          studentRowId: student.id,
        })
      }
    } else {
      // Legacy model: each class = one subject, find all classes for same grade+section+school
      let q = ac.from('classes').select('*').eq('grade', cls.grade)
      if (cls.section) q = q.eq('section', cls.section)
      if (cls.school_id) q = q.eq('school_id', cls.school_id)
      else q = q.eq('school_name', cls.school_name)
      const { data: allClasses } = await q

      for (const c of allClasses ?? []) {
        // Check student exists in this class (by roll number) — this sibling
        // row's own id is what its attendance/marks are actually recorded against.
        const { data: st } = await ac
          .from('students').select('id')
          .eq('class_id', c.id)
          .eq('roll_number', student.roll_number)
          .eq('is_active', true)
          .maybeSingle()
        if (!st) continue

        const { data: t } = await ac.from('teachers').select('name, subject').eq('id', c.teacher_id).maybeSingle()
        subjects.push({
          classId: c.id,
          subjectName: t?.subject || c.name,
          teacherName: t?.name ?? 'Unknown Teacher',
          teacherId: c.teacher_id,
          studentRowId: st.id,
        })
      }
    }

    // For each subject, fetch attendance stats and recent marks
    const subjectData = await Promise.all(
      subjects.map(async (s) => {
        // Attendance stats for this student in this class — keyed to the row
        // that actually owns this subject (see `studentRowId` above).
        const { data: attRows } = await ac
          .from('attendance')
          .select('status')
          .eq('student_id', s.studentRowId)
          .eq('class_id', s.classId)

        const totalSessions = attRows?.length ?? 0
        const presentCount = attRows?.filter((a: { status: string }) => a.status === 'present' || a.status === 'late').length ?? 0
        const attendanceRate = totalSessions > 0 ? presentCount / totalSessions : 0

        // Marks via tests for this teacher+class
        let recentMarks: Array<{ topic: string; score: number; totalMarks: number; date: string }> = []
        let avgScore = 0

        if (s.teacherId) {
          const { data: tests } = await ac
            .from('tests')
            .select('id, topic, total_marks, conducted_on')
            .eq('teacher_id', s.teacherId)
            .eq('class_id', s.classId)

          if (tests && tests.length > 0) {
            const testIds = tests.map((t: { id: string }) => t.id)
            const { data: marks } = await ac
              .from('marks')
              .select('test_id, score')
              .eq('student_id', s.studentRowId)
              .in('test_id', testIds)

            if (marks && marks.length > 0) {
              const testMap = new Map(tests.map((t: { id: string; topic: string; total_marks: number; conducted_on: string }) => [t.id, t]))
              const totalPct = marks.reduce((sum: number, m: { test_id: string; score: number }) => {
                const t = testMap.get(m.test_id)
                return sum + (t ? m.score / t.total_marks : 0)
              }, 0)
              avgScore = totalPct / marks.length

              const allMarks = marks
                .map((m: { test_id: string; score: number }) => {
                  const t = testMap.get(m.test_id)
                  if (!t) return null
                  return { topic: t.topic, score: m.score, totalMarks: t.total_marks, date: t.conducted_on }
                })
                .filter((x): x is { topic: string; score: number; totalMarks: number; date: string } => x !== null)
                .sort((a, b) => b.date.localeCompare(a.date))

              const totalTests = allMarks.length
              recentMarks = allMarks.slice(0, 5)

              return {
                classId: s.classId,
                subjectName: s.subjectName,
                teacherName: s.teacherName,
                attendanceRate,
                totalSessions,
                avgScore,
                totalTests,
                recentMarks,
              }
            }
          }
        }

        return {
          classId: s.classId,
          subjectName: s.subjectName,
          teacherName: s.teacherName,
          attendanceRate,
          totalSessions,
          avgScore,
          totalTests: recentMarks.length,
          recentMarks,
        }
      })
    )

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.name,
        rollNumber: student.roll_number,
        studentCode: student.student_code ?? null,
        grade: cls.grade ?? '',
        section: cls.section ?? '',
      },
      subjects: subjectData,
    })
  } catch (err) {
    console.error('[teacher/student-overview] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
