import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchAcademicEvents, upsertAcademicEvent } from '@/lib/admin-queries'
import { parseBody, SeedHolidaysSchema } from '@/lib/schemas'
import { getIndianHolidaysForYear } from '@/lib/indian-holidays'
import { getMajorFestivalSuggestions } from '@/lib/indian-festivals'

async function auth(userId: string, schoolId: string) {
  const ac = createAdminClient()
  const admin = await fetchAdmin(userId, ac)
  if (!admin || admin.schoolId !== schoolId) return null
  return { admin, ac }
}

function sb() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}

// POST /api/admin/schools/[schoolId]/academic-events/seed-holidays — fills in
// India's public holidays for a given year (computed via date-holidays, not
// AI-guessed) as 'holiday' events. Skips any date already covered by an
// existing holiday event for this school, so it's safe to run more than once.
export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = parseBody(SeedHolidaysSchema, await req.json().catch(() => null))
    if (!parsed.ok) return parsed.response

    const existing = await fetchAcademicEvents(params.schoolId, ctx.ac)
    const existingHolidayDates = new Set(
      existing.filter(e => e.category === 'holiday').map(e => e.startDate)
    )

    const holidays = getIndianHolidaysForYear(parsed.data.year)
      .filter(h => !existingHolidayDates.has(h.startDate))

    const created = await Promise.all(holidays.map(async h => {
      const event = {
        id: randomUUID(),
        schoolId: params.schoolId,
        title: h.title,
        category: 'holiday' as const,
        holidaySubtype: 'public' as const,
        countsAsNonWorking: true,
        published: false, // draft — reviewed alongside everything else before "Publish Calendar"
        startDate: h.startDate,
        endDate: h.endDate,
        createdAt: new Date().toISOString(),
      }
      await upsertAcademicEvent(event, ctx.ac)
      return event
    }))

    // Festival dates are best-effort estimates (see lib/indian-festivals.ts),
    // not a verified source — never auto-inserted. Returned as suggestions
    // the admin confirms individually, excluding any already on the calendar.
    const existingTitleDates = new Set(existing.map(e => `${e.title}|${e.startDate}`))
    const suggested = getMajorFestivalSuggestions(parsed.data.year)
      .filter(f => !existingTitleDates.has(`${f.title}|${f.date}`))

    return NextResponse.json({
      created,
      skipped: getIndianHolidaysForYear(parsed.data.year).length - holidays.length,
      suggested,
    })
  } catch (err) {
    console.error('[admin/academic-events/seed-holidays POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
