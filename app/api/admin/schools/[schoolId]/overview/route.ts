import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchSchoolTeachers, fetchSchoolClasses, fetchSchoolStudents, fetchSchoolTimetable } from '@/lib/admin-queries'

async function getVerifiedAdmin(userId: string, schoolId: string) {
  const ac = createAdminClient()
  const admin = await fetchAdmin(userId, ac)
  if (!admin || admin.schoolId !== schoolId) return null
  return { admin, ac }
}

export async function GET(_req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await getVerifiedAdmin(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [teachers, classes, students, timetable] = await Promise.all([
      fetchSchoolTeachers(params.schoolId, ctx.ac),
      fetchSchoolClasses(params.schoolId, ctx.ac),
      fetchSchoolStudents(params.schoolId, ctx.ac),
      fetchSchoolTimetable(params.schoolId, ctx.ac),
    ])

    const publishedPeriods = timetable.filter(p => p.teacherId).length
    const timetableCoverage = timetable.length > 0 ? Math.round((publishedPeriods / timetable.length) * 100) : 0

    const classIds = classes.map(c => c.id)
    const today = new Date().toISOString().slice(0, 10)
    // A week back, inclusive of today.
    const weekAgo = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10)

    // Counts only — `head: true` means PostgREST returns the number without the
    // rows, so a school with 50k attendance records still costs one cheap query.
    const [assignments, syllabus, attendance, doubts, absences, substitutions] =
      classIds.length
        ? await Promise.all([
            ctx.ac.from('teacher_class_assignments').select('class_id').in('class_id', classIds),
            ctx.ac.from('syllabus_topics').select('class_id, is_completed').in('class_id', classIds),
            ctx.ac.from('attendance').select('status').in('class_id', classIds).gte('date', weekAgo),
            ctx.ac.from('student_doubts').select('id', { count: 'exact', head: true })
              .in('class_id', classIds).eq('status', 'pending'),
            ctx.ac.from('teacher_availability').select('id', { count: 'exact', head: true })
              .eq('school_id', params.schoolId).eq('date', today),
            ctx.ac.from('timetable_substitutions').select('status')
              .eq('school_id', params.schoolId).eq('date', today),
          ])
        : [null, null, null, null, null, null]

    const withTeacher = new Set((assignments?.data ?? []).map((a: { class_id: string }) => a.class_id))
    const withStudents = new Set(students.map(s => s.classId))
    const syllabusRows = (syllabus?.data ?? []) as { class_id: string; is_completed: boolean }[]
    const withSyllabus = new Set(syllabusRows.map(t => t.class_id))

    const attendanceRows = (attendance?.data ?? []) as { status: string }[]
    const present = attendanceRows.filter(a => a.status === 'present' || a.status === 'late').length
    const subRows = (substitutions?.data ?? []) as { status: string }[]

    return NextResponse.json({
      teacherCount: teachers.length,
      classCount: classes.length,
      studentCount: students.length,
      timetableCoverage,
      totalPeriods: timetable.length,

      // ── Readiness: what is stopping this school from working ──────────────
      // Counts of the gap, not of what exists. "40 classes" reads healthy while
      // 36 of them have nobody teaching them, nobody in them, and no syllabus.
      readiness: {
        classesWithoutTeacher: classes.filter(c => !withTeacher.has(c.id)).length,
        classesWithoutStudents: classes.filter(c => !withStudents.has(c.id)).length,
        classesWithoutSyllabus: classes.filter(c => !withSyllabus.has(c.id)).length,
        unstaffedPeriods: timetable.filter(p => !p.teacherId).length,
        publishedPeriods,
      },

      // ── Operations: what needs attention today ────────────────────────────
      operations: {
        // Null rather than 0 when nothing has been recorded: a school that has
        // taken no attendance is not a school with 0% attendance.
        attendanceRate: attendanceRows.length
          ? Math.round((present / attendanceRows.length) * 100)
          : null,
        attendanceRecords: attendanceRows.length,
        pendingDoubts: doubts?.count ?? 0,
        teachersAbsentToday: absences?.count ?? 0,
        // The one an admin must see before the first bell: a period whose
        // teacher is away and for whom nobody has been found.
        unresolvedCover: subRows.filter(s => s.status === 'unresolved').length,
      },
    })
  } catch (err) {
    console.error('[admin/overview] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
