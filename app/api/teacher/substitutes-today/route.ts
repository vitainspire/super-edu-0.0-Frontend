import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { markTeacherUnavailable, revertTeacherAvailability } from '@/lib/admin-queries'
import type { TeacherAvailability } from '@/lib/types'

const EMPTY = { onLeave: false, reason: undefined, covering: [], coveredBy: [] }

function createSSRClient(cookieStore: ReturnType<typeof cookies>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )
}

type ResolveResult =
  | { ok: true; teacherId: string; schoolId: string }
  | { ok: false; status: number; error: string }

async function resolveTeacher(ac: ReturnType<typeof createAdminClient>): Promise<ResolveResult> {
  const cookieStore = cookies()
  const { data: { user } } = await createSSRClient(cookieStore).auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  const { data: teacherRow } = await ac
    .from('teachers')
    .select('id, school_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!teacherRow) return { ok: false, status: 401, error: 'Unauthorized' }
  if (!teacherRow.school_id) {
    return { ok: false, status: 400, error: "Your account isn't linked to a school yet — ask your admin to check your teacher record." }
  }

  return { ok: true, teacherId: teacherRow.id as string, schoolId: teacherRow.school_id as string }
}

async function buildStatus(teacherId: string, date: string, ac: ReturnType<typeof createAdminClient>) {
  const [{ data: avail }, { data: covering }, { data: coveredBy }] = await Promise.all([
    ac.from('teacher_availability').select('reason').eq('teacher_id', teacherId).eq('date', date).maybeSingle(),
    ac.from('timetable_substitutions').select('*').eq('substitute_teacher_id', teacherId).eq('date', date),
    ac.from('timetable_substitutions').select('*').eq('original_teacher_id', teacherId).eq('date', date),
  ])

  const coveringRows = covering ?? []
  const coveredByRows = coveredBy ?? []

  const classIds = [...new Set([...coveringRows, ...coveredByRows].map(r => r.class_id as string))]
  const otherTeacherIds = [...new Set([
    ...coveringRows.map(r => r.original_teacher_id as string),
    ...coveredByRows.map(r => r.substitute_teacher_id as string).filter(Boolean),
  ])]

  const [{ data: classRows }, { data: teacherRows }, { data: timetableRows }] = await Promise.all([
    classIds.length ? ac.from('classes').select('id, name').in('id', classIds) : Promise.resolve({ data: [] }),
    otherTeacherIds.length ? ac.from('teachers').select('id, name').in('id', otherTeacherIds) : Promise.resolve({ data: [] }),
    // Look up start/end times: they live on the ORIGINAL teacher's own published
    // timetable row for that class/day/period (substitutions are seeded from it).
    ac.from('timetable').select('teacher_id, class_id, day_of_week, period_number, start_time, end_time')
      .in('teacher_id', [teacherId, ...otherTeacherIds]),
  ])

  const className = new Map((classRows ?? []).map(r => [r.id as string, r.name as string]))
  const teacherName = new Map((teacherRows ?? []).map(r => [r.id as string, r.name as string]))
  const timeByKey = new Map(
    (timetableRows ?? []).map(r => [`${r.teacher_id}|${r.class_id}|${r.day_of_week}|${r.period_number}`, { startTime: r.start_time as string, endTime: r.end_time as string }])
  )

  return {
    onLeave: !!avail,
    reason: avail?.reason ?? undefined,
    covering: coveringRows.map(r => ({
      classId: r.class_id,
      className: className.get(r.class_id) ?? 'Class',
      subject: r.subject ?? undefined,
      periodNumber: r.period_number,
      ...(timeByKey.get(`${r.original_teacher_id}|${r.class_id}|${r.day_of_week}|${r.period_number}`) ?? {}),
      originalTeacherName: teacherName.get(r.original_teacher_id) ?? 'a teacher',
    })),
    coveredBy: coveredByRows.map(r => ({
      classId: r.class_id,
      className: className.get(r.class_id) ?? 'Class',
      subject: r.subject ?? undefined,
      periodNumber: r.period_number,
      ...(timeByKey.get(`${teacherId}|${r.class_id}|${r.day_of_week}|${r.period_number}`) ?? {}),
      substituteTeacherName: r.substitute_teacher_id ? (teacherName.get(r.substitute_teacher_id) ?? 'a colleague') : 'unassigned — needs admin attention',
    })),
  }
}

// GET /api/teacher/substitutes-today?date=YYYY-MM-DD (defaults to today)
// Returns whether the calling teacher is marked unavailable today, which of
// their own periods are being covered by someone else, and which other
// teachers' periods they're covering.
export async function GET(req: Request) {
  try {
    const ac = createAdminClient()
    const teacher = await resolveTeacher(ac)
    if (!teacher.ok) return NextResponse.json(EMPTY)

    const date = new URL(req.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
    return NextResponse.json(await buildStatus(teacher.teacherId, date, ac))
  } catch (err) {
    console.error('[teacher/substitutes-today GET] failed:', err)
    return NextResponse.json(EMPTY)
  }
}

// POST { reason } — the teacher's own daily check-in. Always applies to
// today (self check-in isn't for arbitrary dates). This is the PRIMARY way
// availability gets set; the admin's Substitutes page is a fallback override
// for teachers who can't check in themselves.
export async function POST(req: Request) {
  try {
    const ac = createAdminClient()
    const teacher = await resolveTeacher(ac)
    if (!teacher.ok) return NextResponse.json({ error: teacher.error }, { status: teacher.status })

    const { reason } = await req.json()
    if (!reason) return NextResponse.json({ error: 'reason is required.' }, { status: 400 })

    const today = new Date().toISOString().slice(0, 10)

    if (reason === 'available') {
      await revertTeacherAvailability(teacher.teacherId, today, ac)
    } else {
      await markTeacherUnavailable(
        teacher.schoolId, teacher.teacherId, today,
        reason as TeacherAvailability['reason'], 'teacher', undefined, ac
      )
    }

    return NextResponse.json(await buildStatus(teacher.teacherId, today, ac))
  } catch (err) {
    console.error('[teacher/substitutes-today POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
