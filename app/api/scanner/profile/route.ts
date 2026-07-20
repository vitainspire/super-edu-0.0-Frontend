import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ac = createAdminClient()
    const { data } = await ac
      .from('scanner_profiles')
      .select('id, name, email, school_id, schools(name)')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!data) return NextResponse.json({ error: 'No scanner account found. Ask your school admin to create your account.' }, { status: 403 })

    return NextResponse.json({
      id: data.id,
      name: data.name,
      email: data.email,
      schoolId: data.school_id,
      schoolName: (data as any).schools?.name ?? '',
    })
  } catch (err) {
    console.error('[scanner/profile] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
