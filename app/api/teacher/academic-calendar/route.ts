import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchPublishedAcademicEvents } from '@/lib/admin-queries'

// GET /api/teacher/academic-calendar — the current teacher's school's
// PUBLISHED academic calendar (holidays, exam blocks). Mirrors
// /api/teacher/announcements' teacher→school_id resolution and its
// convention of returning an empty result rather than an error status when
// the caller isn't a recognised teacher yet.
export async function GET() {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ events: [] })

    const ac = createAdminClient()
    const { data: teacherRow } = await ac.from('teachers').select('id, school_id').eq('user_id', user.id).maybeSingle()
    if (!teacherRow?.school_id) return NextResponse.json({ events: [] })

    const events = await fetchPublishedAcademicEvents(teacherRow.school_id, ac)
    return NextResponse.json({ events })
  } catch (err) {
    console.error('[teacher/academic-calendar] failed:', err)
    return NextResponse.json({ events: [] })
  }
}
