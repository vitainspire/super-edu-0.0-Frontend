import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin } from '@/lib/admin-queries'
import { apiLog, getClientIp } from '@/lib/logger'
import { checkAuthRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const { allowed } = await checkAuthRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'admin/login', ip, durationMs: Date.now() - t, fromCache: false, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

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

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      apiLog({ route: 'admin/login', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
      return NextResponse.json({ error: error?.message ?? 'Invalid credentials' }, { status: 401 })
    }

    const ac = createAdminClient()
    const admin = await fetchAdmin(data.user.id, ac)
    if (!admin) {
      await supabase.auth.signOut()
      apiLog({ route: 'admin/login', ip, durationMs: Date.now() - t, fromCache: false, status: 'forbidden' })
      return NextResponse.json({ error: 'No admin account found for this email' }, { status: 403 })
    }

    apiLog({ route: 'admin/login', ip, userId: admin.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    const res = NextResponse.json({ admin })
    res.cookies.set('edu-role', 'admin', { path: '/', sameSite: 'strict', maxAge: 60 * 60 * 24 * 7 })
    res.cookies.set('edu-session', '1', { path: '/', sameSite: 'strict', maxAge: 60 * 60 * 24 * 7 })
    return res
  } catch (err) {
    apiLog({ route: 'admin/login', ip, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
