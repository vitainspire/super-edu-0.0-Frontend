import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchTeacherAvailabilityForTeacher, markTeacherUnavailable, revertTeacherAvailability } from '@/lib/admin-queries'
import type { TeacherAvailability } from '@/lib/types'

const ALLOWED_REASONS = new Set(['on_leave', 'late_arrival', 'official_duty', 'other'])
const MAX_RANGE_DAYS = 60

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

// Date handling here stays entirely in local-calendar terms end to end — no
// UTC round-trip. toISOString() always converts to UTC, which silently
// shifts a date back a day whenever the server's local timezone is ahead of
// UTC (e.g. IST) — reading the Date's local fields directly avoids that.
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayStr() {
  return toDateStr(new Date())
}

function parseDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

// GET — the calling teacher's own upcoming leave requests (today onward).
export async function GET() {
  try {
    const ac = createAdminClient()
    const teacher = await resolveTeacher(ac)
    if (!teacher.ok) return NextResponse.json({ error: teacher.error }, { status: teacher.status })

    const leaves = await fetchTeacherAvailabilityForTeacher(teacher.teacherId, todayStr(), ac)
    return NextResponse.json({ leaves })
  } catch (err) {
    console.error('[teacher/leaves GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST { startDate, endDate, reason, note? } — the teacher requests leave for
// a date (or inclusive date range). Takes effect immediately, same as the
// existing same-day check-in — there's no approval step in this system, and
// the admin's Substitutes page can always override any date afterward.
// Internally this is just the existing per-date markTeacherUnavailable call,
// looped once per date in the range.
export async function POST(req: Request) {
  try {
    const ac = createAdminClient()
    const teacher = await resolveTeacher(ac)
    if (!teacher.ok) return NextResponse.json({ error: teacher.error }, { status: teacher.status })

    const { startDate, endDate, reason, note } = await req.json().catch(() => ({}))
    if (!startDate || !endDate || !reason) {
      return NextResponse.json({ error: 'startDate, endDate and reason are required.' }, { status: 400 })
    }
    if (!ALLOWED_REASONS.has(reason)) {
      return NextResponse.json({ error: 'Invalid reason.' }, { status: 400 })
    }

    const start = parseDate(startDate)
    const end = parseDate(endDate)
    if (!start || !end) return NextResponse.json({ error: 'Dates must be YYYY-MM-DD.' }, { status: 400 })
    if (end < start) return NextResponse.json({ error: 'End date must be on or after start date.' }, { status: 400 })

    const today = parseDate(todayStr())!
    if (end < today) return NextResponse.json({ error: "Can't request leave for dates entirely in the past." }, { status: 400 })

    const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    if (spanDays > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Leave requests can span at most ${MAX_RANGE_DAYS} days.` }, { status: 400 })
    }

    // Skip any days already in the past within the range (e.g. a range that
    // starts yesterday and ends next week) rather than rejecting the whole request.
    for (let d = new Date(Math.max(start.getTime(), today.getTime())); d <= end; d.setDate(d.getDate() + 1)) {
      await markTeacherUnavailable(
        teacher.schoolId, teacher.teacherId, toDateStr(d),
        reason as TeacherAvailability['reason'], 'teacher', note || undefined, ac
      )
    }

    const leaves = await fetchTeacherAvailabilityForTeacher(teacher.teacherId, todayStr(), ac)
    return NextResponse.json({ leaves })
  } catch (err) {
    console.error('[teacher/leaves POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE { startDate, endDate } — cancels an upcoming leave request (or part
// of one). Only affects today-or-future dates within the given range; past
// dates are left as history.
export async function DELETE(req: Request) {
  try {
    const ac = createAdminClient()
    const teacher = await resolveTeacher(ac)
    if (!teacher.ok) return NextResponse.json({ error: teacher.error }, { status: teacher.status })

    const { startDate, endDate } = await req.json().catch(() => ({}))
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required.' }, { status: 400 })
    }
    const start = parseDate(startDate)
    const end = parseDate(endDate)
    if (!start || !end) return NextResponse.json({ error: 'Dates must be YYYY-MM-DD.' }, { status: 400 })

    const today = parseDate(todayStr())!
    for (let d = new Date(Math.max(start.getTime(), today.getTime())); d <= end; d.setDate(d.getDate() + 1)) {
      await revertTeacherAvailability(teacher.teacherId, toDateStr(d), ac)
    }

    const leaves = await fetchTeacherAvailabilityForTeacher(teacher.teacherId, todayStr(), ac)
    return NextResponse.json({ leaves })
  } catch (err) {
    console.error('[teacher/leaves DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
