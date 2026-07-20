import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, publishAcademicEvents } from '@/lib/admin-queries'

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

// POST /api/admin/schools/[schoolId]/academic-events/publish — makes every
// current draft event visible to teachers in one deliberate action.
export async function POST(_req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const publishedCount = await publishAcademicEvents(params.schoolId, ctx.ac)
    return NextResponse.json({ ok: true, publishedCount })
  } catch (err) {
    console.error('[admin/academic-events/publish POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
