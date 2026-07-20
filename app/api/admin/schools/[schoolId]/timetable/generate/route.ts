import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  fetchAdmin, fetchSchoolClasses, fetchSchoolSchedule, fetchSchoolTeachers,
  fetchAllGradeSubjects, fetchClassAssignments, fetchSchoolTimetable,
  deleteSchoolTimetablePeriodsForClasses, bulkInsertSchoolTimetablePeriods,
} from '@/lib/admin-queries'
import { generateSchoolTimetable } from '@/lib/timetableGenerator'
import { SIX_DAY_WEEK, FIVE_DAY_WEEK } from '@/lib/academic-calendar'

async function auth(userId: string, schoolId: string) {
  const ac = createAdminClient()
  const admin = await fetchAdmin(userId, ac)
  if (!admin || admin.schoolId !== schoolId) return null
  return { admin, ac }
}

function sb(cookieStore: ReturnType<typeof cookies>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}

// POST /api/admin/schools/[schoolId]/timetable/generate — generates the
// ENTIRE school's timetable in one pass (every grade, every section), so
// teachers who cover multiple grades/subjects are scheduled as one shared
// resource instead of per-grade in isolation.
//
// STABLE, not a blind wipe-and-rebuild: any already-published period whose
// (class, subject, teacher) still matches what's currently required is kept
// in its exact slot. Only new/changed requirements get freshly placed — so
// re-running this after one small change doesn't reshuffle the whole school.
export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await sb(cookieStore).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({} as { sixDayWeek?: boolean }))
    const workingWeekdays = body?.sixDayWeek === false ? FIVE_DAY_WEEK : SIX_DAY_WEEK

    const [schedule, lineup, classes, teachers, existingTimetable] = await Promise.all([
      fetchSchoolSchedule(params.schoolId, ctx.ac),
      fetchAllGradeSubjects(params.schoolId, ctx.ac),
      fetchSchoolClasses(params.schoolId, ctx.ac),
      fetchSchoolTeachers(params.schoolId, ctx.ac),
      fetchSchoolTimetable(params.schoolId, ctx.ac),
    ])

    if (!schedule || schedule.slots.filter(s => s.type === 'period').length === 0) {
      return NextResponse.json({ error: 'Set up the school schedule template first.' }, { status: 400 })
    }
    if (lineup.length === 0) {
      return NextResponse.json({ error: 'Add at least one subject to a grade\'s lineup first.' }, { status: 400 })
    }
    if (classes.length === 0) {
      return NextResponse.json({ error: 'No classes found for this school.' }, { status: 400 })
    }

    const assignmentsPerClass = await Promise.all(classes.map(c => fetchClassAssignments(c.id, ctx.ac)))
    const assignments = classes.flatMap((c, i) =>
      assignmentsPerClass[i]
        .filter(a => a.subject)
        .map(a => ({ classId: c.id, subject: a.subject!, teacherId: a.teacherId }))
    )

    const classIds = new Set(classes.map(c => c.id))
    const existingPeriods = existingTimetable
      .filter(p => classIds.has(p.classId))
      .map(p => ({
        classId: p.classId, dayOfWeek: p.dayOfWeek, periodNumber: p.periodNumber,
        startTime: p.startTime, endTime: p.endTime, teacherId: p.teacherId, label: p.label ?? '',
      }))

    const result = generateSchoolTimetable(
      schedule.slots,
      workingWeekdays,
      classes.map(c => ({ classId: c.id, className: c.name, grade: c.grade })),
      lineup.map(l => ({ grade: l.grade, subject: l.subject, periodsPerWeek: l.periodsPerWeek, category: l.category })),
      assignments,
      teachers.map(t => ({ teacherId: t.id, teacherName: t.name, maxPeriodsPerDay: t.maxPeriodsPerDay, maxPeriodsPerWeek: t.maxPeriodsPerWeek })),
      existingPeriods,
    )

    await deleteSchoolTimetablePeriodsForClasses(classes.map(c => c.id), ctx.ac)

    try {
      await bulkInsertSchoolTimetablePeriods(
        result.periods.map(p => ({
          id: randomUUID(),
          schoolId: params.schoolId,
          dayOfWeek: p.dayOfWeek,
          periodNumber: p.periodNumber,
          startTime: p.startTime,
          endTime: p.endTime,
          classId: p.classId,
          teacherId: p.teacherId,
          label: p.label,
          createdAt: new Date().toISOString(),
        })),
        ctx.ac,
      )
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      classStats: result.classStats,
      teacherWarnings: result.teacherWarnings,
      unplaced: result.unplaced,
      keptCount: result.keptCount,
      placedCount: result.placedCount,
    })
  } catch (err) {
    console.error('[admin/timetable/generate POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
