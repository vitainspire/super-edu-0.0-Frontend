import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  fetchAdmin, fetchSchoolClasses, fetchSchoolSchedule, fetchSchoolTimetable,
  fetchGradeSubjects, fetchClassAssignments,
  deleteSchoolTimetablePeriodsForClasses, bulkInsertSchoolTimetablePeriods,
} from '@/lib/admin-queries'
import { generateShuffledTimetable } from '@/lib/timetableShuffle'
import { randomUUID } from 'crypto'

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

export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  const cookieStore = cookies()
  const { data: { user } } = await sb(cookieStore).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await auth(user.id, params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { grade } = await req.json()
  if (!grade) return NextResponse.json({ error: 'grade is required' }, { status: 400 })

  const [schedule, lineup, allClasses, allPeriods] = await Promise.all([
    fetchSchoolSchedule(params.schoolId, ctx.ac),
    fetchGradeSubjects(params.schoolId, grade, ctx.ac),
    fetchSchoolClasses(params.schoolId, ctx.ac),
    fetchSchoolTimetable(params.schoolId, ctx.ac),
  ])

  if (!schedule || schedule.slots.filter(s => s.type === 'period').length === 0) {
    return NextResponse.json({ error: 'Set up the school schedule template first.' }, { status: 400 })
  }
  if (lineup.length === 0) {
    return NextResponse.json({ error: "Add at least one subject to this grade's lineup first." }, { status: 400 })
  }

  const sectionsOfGrade = allClasses.filter(c => c.grade === grade)
  if (sectionsOfGrade.length === 0) {
    return NextResponse.json({ error: `No classes found for grade ${grade}.` }, { status: 400 })
  }

  const sectionClassIds = new Set(sectionsOfGrade.map(c => c.id))

  const assignmentsPerSection = await Promise.all(
    sectionsOfGrade.map(c => fetchClassAssignments(c.id, ctx.ac))
  )
  const sections = sectionsOfGrade.map((c, i) => {
    const subjectTeacher: Record<string, string | undefined> = {}
    for (const a of assignmentsPerSection[i]) {
      if (a.subject) subjectTeacher[a.subject] = a.teacherId
    }
    return { classId: c.id, className: c.name, subjectTeacher }
  })

  // Teacher slots already booked by classes NOT part of this reshuffle
  const busyTeacherSlots = new Set(
    allPeriods
      .filter(p => p.teacherId && !sectionClassIds.has(p.classId))
      .map(p => `${p.teacherId}|${p.dayOfWeek}|${p.periodNumber}`)
  )

  const { periods, sectionStats } = generateShuffledTimetable(
    schedule.slots,
    sections,
    lineup.map(l => ({ subject: l.subject, periodsPerWeek: l.periodsPerWeek })),
    busyTeacherSlots,
  )

  await deleteSchoolTimetablePeriodsForClasses([...sectionClassIds], ctx.ac)

  try {
    await bulkInsertSchoolTimetablePeriods(
      periods.map(p => ({
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

  return NextResponse.json({ ok: true, sections: sectionStats })
}
