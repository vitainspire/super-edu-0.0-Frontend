import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, publishTimetable, publishTimetableForClasses } from '@/lib/admin-queries'

export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ac = createAdminClient()
    const admin = await fetchAdmin(user.id, ac)
    if (!admin || admin.schoolId !== params.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({} as { classIds?: string[] }))

    if (Array.isArray(body.classIds) && body.classIds.length > 0) {
      const count = await publishTimetableForClasses(params.schoolId, body.classIds, ac)
      return NextResponse.json({ ok: true, published: count })
    }

    await publishTimetable(params.schoolId, ac)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/timetable/publish] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
