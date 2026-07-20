import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  fetchAdmin, fetchSchoolTeachers, fetchSchoolClasses,
  fetchTeacherAvailability, fetchSubstitutionsForDate,
  updateSubstituteAssignment, markTeacherUnavailable, revertTeacherAvailability,
  fetchTeacherEligibilityData,
} from '@/lib/admin-queries'
import { suggestSwap, type ClassPeriod } from '@/lib/substituteFinder'

async function auth(userId: string, schoolId: string) {
  const ac = createAdminClient()
  const admin = await fetchAdmin(userId, ac)
  if (!admin || admin.schoolId !== schoolId) return null
  return { admin, ac }
}

async function requireUser() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Builds the response payload GET returns, and that POST/PATCH return after mutating.
async function buildPayload(schoolId: string, date: string, ac: ReturnType<typeof createAdminClient>) {
  const [teachers, classes, availability, substitutions] = await Promise.all([
    fetchSchoolTeachers(schoolId, ac),
    fetchSchoolClasses(schoolId, ac),
    fetchTeacherAvailability(schoolId, date, ac),
    fetchSubstitutionsForDate(schoolId, date, ac),
  ])

  const teacherName = new Map(teachers.map(t => [t.id, t.name]))
  const className = new Map(classes.map(c => [c.id, c.name]))

  // For any unresolved period, check whether swapping this class's schedule
  // for the day would free up a qualified teacher — suggestion only, never
  // auto-applied. Only bothers with the extra queries when something's
  // actually unresolved.
  const unresolved = substitutions.filter(s => s.status === 'unresolved')
  const suggestionByTeacherSlot = new Map<string, ReturnType<typeof suggestSwap>>()
  if (unresolved.length > 0) {
    const candidates = await fetchTeacherEligibilityData(schoolId, date, ac)
    const excludeTeacherIds = new Set(availability.map(a => a.teacherId))
    const usedBySlot = new Map<number, Set<string>>()
    for (const s of substitutions) {
      if (!s.substituteTeacherId) continue
      if (!usedBySlot.has(s.periodNumber)) usedBySlot.set(s.periodNumber, new Set())
      usedBySlot.get(s.periodNumber)!.add(s.substituteTeacherId)
    }

    for (const s of unresolved) {
      const { data: rows } = await ac
        .from('timetable')
        .select('period_number, label, teacher_id')
        .eq('class_id', s.classId)
        .eq('day_of_week', s.dayOfWeek)
        .neq('period_number', s.periodNumber)
      const classPeriods: ClassPeriod[] = (rows ?? []).map(r => ({
        periodNumber: r.period_number as number, subject: (r.label as string) ?? '', teacherId: r.teacher_id as string,
      }))

      const suggestion = suggestSwap(
        { dayOfWeek: s.dayOfWeek, periodNumber: s.periodNumber, subject: s.subject ?? '' },
        classPeriods, candidates, excludeTeacherIds,
        (pn) => usedBySlot.get(pn) ?? new Set()
      )
      if (suggestion) suggestionByTeacherSlot.set(s.id, suggestion)
    }
  }

  return {
    teachers,
    availability,
    substitutions: substitutions.map(s => {
      const suggestion = suggestionByTeacherSlot.get(s.id)
      return {
        ...s,
        className: className.get(s.classId) ?? 'Class',
        originalTeacherName: teacherName.get(s.originalTeacherId) ?? 'Teacher',
        substituteTeacherName: s.substituteTeacherId ? (teacherName.get(s.substituteTeacherId) ?? 'Teacher') : undefined,
        suggestion: suggestion ? {
          swapPeriodNumber: suggestion.swapPeriodNumber,
          swapSubject: suggestion.swapSubject,
          movingTeacherName: teacherName.get(suggestion.movingTeacherId) ?? 'a teacher',
          freeingTeacherName: teacherName.get(suggestion.freeingTeacherId) ?? 'a teacher',
        } : undefined,
      }
    }),
  }
}

export async function GET(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const date = new URL(req.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
    const payload = await buildPayload(params.schoolId, date, ctx.ac)
    return NextResponse.json(payload)
  } catch (err) {
    console.error('[admin/substitutes GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Admin fallback override: marks a teacher unavailable (reason != 'available')
// or reverts them to available, then (re)computes substitute assignments.
// Teacher self-reporting is the primary path (see /api/teacher/substitutes-today);
// this exists for teachers who can't check in themselves (e.g. unreachable/sick).
export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { date, teacherId, reason, note } = await req.json()
    if (!date || !teacherId || !reason) {
      return NextResponse.json({ error: 'date, teacherId and reason are required.' }, { status: 400 })
    }

    const schoolId = params.schoolId
    const { ac } = ctx

    if (reason === 'available') {
      await revertTeacherAvailability(teacherId, date, ac)
    } else {
      await markTeacherUnavailable(schoolId, teacherId, date, reason, 'admin', note, ac)
    }

    return NextResponse.json(await buildPayload(schoolId, date, ac))
  } catch (err) {
    console.error('[admin/substitutes POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Manual override of a single substitution's assigned substitute teacher.
export async function PATCH(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const user = await requireUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { substitutionId, substituteTeacherId, date } = await req.json()
    if (!substitutionId || !substituteTeacherId || !date) {
      return NextResponse.json({ error: 'substitutionId, substituteTeacherId and date are required.' }, { status: 400 })
    }

    await updateSubstituteAssignment(substitutionId, substituteTeacherId, ctx.ac)
    return NextResponse.json(await buildPayload(params.schoolId, date, ctx.ac))
  } catch (err) {
    console.error('[admin/substitutes PATCH] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
