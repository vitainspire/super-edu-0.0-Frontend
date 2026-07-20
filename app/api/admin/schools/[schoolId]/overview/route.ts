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

    return NextResponse.json({
      teacherCount: teachers.length,
      classCount: classes.length,
      studentCount: students.length,
      timetableCoverage,
      totalPeriods: timetable.length,
    })
  } catch (err) {
    console.error('[admin/overview] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
