import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchSchoolAnnouncements } from '@/lib/admin-queries'

// GET /api/teacher/announcements — the current teacher's school's announcements,
// newest first. Mirrors /api/teacher/school-data's teacher→school_id resolution
// and its convention of returning an empty result rather than an error status
// when the caller isn't a recognised teacher yet.
export async function GET() {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ announcements: [] })

    const ac = createAdminClient()
    const { data: teacherRow } = await ac.from('teachers').select('id, school_id').eq('user_id', user.id).maybeSingle()
    if (!teacherRow?.school_id) return NextResponse.json({ announcements: [] })

    const announcements = await fetchSchoolAnnouncements(teacherRow.school_id, ac)
    return NextResponse.json({ announcements: announcements.slice(0, 20) })
  } catch (err) {
    console.error('[teacher/announcements] failed:', err)
    return NextResponse.json({ announcements: [] })
  }
}
