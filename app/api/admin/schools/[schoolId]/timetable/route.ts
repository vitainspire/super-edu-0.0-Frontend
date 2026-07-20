import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchSchoolTimetable, upsertSchoolTimetablePeriod, deleteSchoolTimetablePeriod } from '@/lib/admin-queries'
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

export async function GET(_req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await sb(cookieStore).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const periods = await fetchSchoolTimetable(params.schoolId, ctx.ac)
    return NextResponse.json({ periods })
  } catch (err) {
    console.error('[admin/timetable GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await sb(cookieStore).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()

    // Conflict check: same teacher already assigned to a different class at this day + period
    if (body.teacherId) {
      const { data: conflict } = await ctx.ac
        .from('school_timetable_periods')
        .select('id, class_id, start_time, end_time')
        .eq('school_id', params.schoolId)
        .eq('teacher_id', body.teacherId)
        .eq('day_of_week', body.dayOfWeek)
        .eq('period_number', body.periodNumber)
        .neq('class_id', body.classId)
        .maybeSingle()

      if (conflict) {
        const { data: cls } = await ctx.ac
          .from('classes')
          .select('name')
          .eq('id', conflict.class_id)
          .single()

        const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const dayName   = DAY_NAMES[body.dayOfWeek] ?? `Day ${body.dayOfWeek}`
        const className = cls?.name ?? 'another class'

        return NextResponse.json({
          error: 'conflict',
          message: `This teacher is already assigned to ${className} during Period ${body.periodNumber} (${conflict.start_time}–${conflict.end_time}) on ${dayName}.`,
        }, { status: 409 })
      }
    }

    const period = {
      id: body.id ?? randomUUID(),
      schoolId: params.schoolId,
      dayOfWeek: body.dayOfWeek,
      periodNumber: body.periodNumber,
      startTime: body.startTime,
      endTime: body.endTime,
      classId: body.classId,
      teacherId: body.teacherId ?? undefined,
      label: body.label ?? undefined,
      createdAt: new Date().toISOString(),
    }
    await upsertSchoolTimetablePeriod(period, ctx.ac)
    return NextResponse.json({ period })
  } catch (err) {
    console.error('[admin/timetable POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await sb(cookieStore).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { periodId } = await req.json()
    await deleteSchoolTimetablePeriod(periodId, ctx.ac)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/timetable DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
