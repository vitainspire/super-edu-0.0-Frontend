import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchSchoolSchedule, upsertSchoolSchedule } from '@/lib/admin-queries'
import { randomUUID } from 'crypto'

async function auth(userId: string, schoolId: string) {
  const ac = createAdminClient()
  const admin = await fetchAdmin(userId, ac)
  if (!admin || admin.schoolId !== schoolId) return null
  return { admin, ac }
}

function sb(cookieStore: ReturnType<typeof cookies>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}

export async function GET(_req: Request, { params }: { params: { schoolId: string } }) {
  const cookieStore = cookies()
  const { data: { user } } = await sb(cookieStore).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await auth(user.id, params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const schedule = await fetchSchoolSchedule(params.schoolId, ctx.ac)
  return NextResponse.json({ schedule })
}

export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  const cookieStore = cookies()
  const { data: { user } } = await sb(cookieStore).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await auth(user.id, params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slots } = await req.json()
  if (!Array.isArray(slots)) return NextResponse.json({ error: 'slots array required' }, { status: 400 })

  const existing = await fetchSchoolSchedule(params.schoolId, ctx.ac)
  const schedule = {
    id: existing?.id ?? randomUUID(),
    schoolId: params.schoolId,
    slots,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }

  try {
    await upsertSchoolSchedule(schedule, ctx.ac)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
  return NextResponse.json({ schedule })
}
