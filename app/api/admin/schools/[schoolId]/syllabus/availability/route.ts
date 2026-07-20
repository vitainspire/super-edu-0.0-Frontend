import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin } from '@/lib/admin-queries'
import { computeSubjectSessionAvailability } from '@/lib/academic-calendar'

function sb() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}

function todayStr() { return new Date().toISOString().split('T')[0] }

// GET /api/admin/schools/[schoolId]/syllabus/availability?grade=5&subject=Science
// Real remaining class sessions for this exact grade+subject this year —
// grounded in the actual timetable (which weekdays, how many periods) and the
// academic calendar (holidays subtracted out), not a generic guess.
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ac = createAdminClient()
    const admin = await fetchAdmin(user.id, ac)
    if (!admin || admin.schoolId !== params.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const grade = req.nextUrl.searchParams.get('grade')
    const subject = req.nextUrl.searchParams.get('subject')
    if (!grade || !subject) return NextResponse.json({ error: 'grade and subject required' }, { status: 400 })

    const { data: classes } = await ac.from('classes').select('id').eq('school_id', params.schoolId).eq('grade', grade)
    const classIds = (classes ?? []).map(c => c.id)
    if (classIds.length === 0) return NextResponse.json({ availableSessions: 0, academicYearEnd: null })

    const { data: rawEvents } = await ac.from('academic_events').select('*').eq('school_id', params.schoolId)
    // computeSubjectSessionAvailability expects camelCase AcademicEvent fields —
    // map the raw DB rows before passing them in, not the snake_case originals.
    const events = (rawEvents ?? []).map(e => ({
      category: e.category as 'holiday' | 'exam' | 'term',
      startDate: e.start_date as string,
      endDate: e.end_date as string,
      countsAsNonWorking: e.counts_as_non_working ?? true,
    }))
    const yearEvent = (rawEvents ?? []).find(e => e.category === 'term' && e.title === 'Academic Year')
    if (!yearEvent) return NextResponse.json({ availableSessions: 0, academicYearEnd: null, error: 'No Academic Year set in the calendar yet' })

    const { data: timetable } = await ac.from('timetable').select('class_id, day_of_week, label').in('class_id', classIds)
    // Sections of a grade are assumed to share the same weekly pacing (the
    // syllabus itself is authored once per grade and fanned out per section) —
    // so exactly one section's timetable is the right scope here. Summing
    // periods across every section would multiply the count by however many
    // sections the grade has. Pick the first section that actually has a
    // timetable yet, in case classIds[0]'s hasn't been generated.
    const representativeClassId = classIds.find(id => (timetable ?? []).some(t => t.class_id === id)) ?? classIds[0]
    const representativeTimetable = (timetable ?? []).filter(t => t.class_id === representativeClassId)

    // Exact match (trimmed, case-insensitive) rather than substring — a substring
    // match risks false positives ("Science" inside "Home Science"); an exact
    // match at least fails loudly (0 sessions, surfaced below) instead of quietly
    // matching the wrong subject.
    const target = subject.trim().toLowerCase()
    const periodsPerWeekday: Record<number, number> = {}
    const otherLabelsSeen = new Set<string>()
    let matchedPeriods = 0
    for (const t of representativeTimetable) {
      const label = String(t.label ?? '').trim()
      if (label.toLowerCase() === target) {
        periodsPerWeekday[t.day_of_week] = (periodsPerWeekday[t.day_of_week] ?? 0) + 1
        matchedPeriods++
      } else if (label) {
        otherLabelsSeen.add(label)
      }
    }

    const from = todayStr() > yearEvent.start_date ? todayStr() : yearEvent.start_date
    const availableSessions = computeSubjectSessionAvailability(
      from, yearEvent.end_date, events ?? [], periodsPerWeekday,
    )

    return NextResponse.json({
      availableSessions, academicYearEnd: yearEvent.end_date,
      matchedPeriodsPerWeek: matchedPeriods,
      // Only surfaced when nothing matched — helps admin spot a naming
      // mismatch (e.g. Subject Lineup says "Science", timetable says "Gen. Science").
      otherTimetableLabels: matchedPeriods === 0 ? [...otherLabelsSeen].slice(0, 10) : undefined,
    })
  } catch (err) {
    console.error('[admin/syllabus/availability GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
