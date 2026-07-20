import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchSchool } from '@/lib/admin-queries'

export async function GET() {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ac = createAdminClient()
    const admin = await fetchAdmin(user.id, ac)
    if (!admin) return NextResponse.json({ error: 'Not an admin' }, { status: 403 })

    const school = await fetchSchool(admin.schoolId, ac)
    return NextResponse.json({ admin, school })
  } catch (err) {
    console.error('[admin/me] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
