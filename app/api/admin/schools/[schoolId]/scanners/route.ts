import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchSchool } from '@/lib/admin-queries'

async function auth(userId: string, schoolId: string) {
  const ac = createAdminClient()
  const admin = await fetchAdmin(userId, ac)
  if (!admin || admin.schoolId !== schoolId) return null
  return { admin, ac }
}

function sb() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}

export async function GET(_req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await ctx.ac
      .from('scanner_profiles')
      .select('id, name, email, created_at')
      .eq('school_id', params.schoolId)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ scanners: data ?? [] })
  } catch (err) {
    console.error('[admin/scanners GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name, email, password } = await req.json()
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      return NextResponse.json({ error: 'Name, email and password (min 6 chars) are required.' }, { status: 400 })
    }

    // Create Supabase auth user
    const { data: authData, error: authErr } = await ctx.ac.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { name: name.trim(), role: 'scanner' },
    })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

    const scannerId = authData.user.id
    const school = await fetchSchool(params.schoolId, ctx.ac)

    const { error: dbErr } = await ctx.ac.from('scanner_profiles').insert({
      user_id: scannerId,
      school_id: params.schoolId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
    })

    if (dbErr) {
      await ctx.ac.auth.admin.deleteUser(scannerId)
      return NextResponse.json({ error: dbErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, schoolName: school?.name ?? '' })
  } catch (err) {
    console.error('[admin/scanners POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { scannerId } = await req.json()
    if (!scannerId) return NextResponse.json({ error: 'scannerId required' }, { status: 400 })

    // Get user_id before deleting profile
    const { data: profile } = await ctx.ac
      .from('scanner_profiles')
      .select('user_id')
      .eq('id', scannerId)
      .eq('school_id', params.schoolId)
      .maybeSingle()

    await ctx.ac.from('scanner_profiles').delete().eq('id', scannerId)

    if (profile?.user_id) {
      await ctx.ac.auth.admin.deleteUser(profile.user_id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/scanners DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
