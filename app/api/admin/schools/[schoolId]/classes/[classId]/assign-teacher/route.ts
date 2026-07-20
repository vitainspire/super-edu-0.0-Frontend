import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, assignTeacherToClass, removeTeacherFromClass, fetchClassAssignments } from '@/lib/admin-queries'
import { randomUUID } from 'crypto'

async function getUser(cookieStore: ReturnType<typeof cookies>) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
  return supabase.auth.getUser()
}

export async function GET(_req: Request, { params }: { params: { schoolId: string; classId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await getUser(cookieStore)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ac = createAdminClient()
    const admin = await fetchAdmin(user.id, ac)
    if (!admin || admin.schoolId !== params.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const assignments = await fetchClassAssignments(params.classId, ac)
    return NextResponse.json({ assignments })
  } catch (err) {
    console.error('[assign-teacher GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { schoolId: string; classId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await getUser(cookieStore)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ac = createAdminClient()
    const admin = await fetchAdmin(user.id, ac)
    if (!admin || admin.schoolId !== params.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { teacherId, subject } = await req.json()
    await assignTeacherToClass(randomUUID(), teacherId, params.classId, ac, subject ?? undefined)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[assign-teacher POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { schoolId: string; classId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await getUser(cookieStore)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ac = createAdminClient()
    const admin = await fetchAdmin(user.id, ac)
    if (!admin || admin.schoolId !== params.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { teacherId } = await req.json()
    await removeTeacherFromClass(teacherId, params.classId, ac)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[assign-teacher DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
