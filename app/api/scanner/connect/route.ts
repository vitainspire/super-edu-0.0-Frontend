import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { apiLog, getClientIp } from '@/lib/logger'
import { checkAuthRateLimit } from '@/lib/rate-limit'
import { signSchoolToken } from '@/lib/scanner-auth'

// POST /api/scanner/connect — verify a school join code and mint a signed,
// school-scoped token the scanner portal presents on every write it makes.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const { allowed } = await checkAuthRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })

  let body: { joinCode?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const joinCode = body.joinCode?.trim().toUpperCase()
  if (!joinCode) return NextResponse.json({ error: 'School code required' }, { status: 400 })

  try {
    const admin = createAdminClient()
    const { data: school } = await admin
      .from('schools').select('id, name').eq('join_code', joinCode).maybeSingle()

    if (!school) {
      apiLog({ route: 'scanner/connect', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
      return NextResponse.json({ error: 'School code not found. Ask your school admin for the correct code.' }, { status: 404 })
    }

    apiLog({ route: 'scanner/connect', ip, userId: school.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ schoolId: school.id, schoolName: school.name ?? '', token: signSchoolToken(school.id) })
  } catch (err) {
    apiLog({ route: 'scanner/connect', ip, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
