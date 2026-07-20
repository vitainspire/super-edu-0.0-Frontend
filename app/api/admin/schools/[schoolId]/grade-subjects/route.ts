import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchGradeSubjects, upsertGradeSubject, deleteGradeSubject } from '@/lib/admin-queries'
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

export async function GET(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await sb(cookieStore).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const grade = new URL(req.url).searchParams.get('grade')
    if (!grade) return NextResponse.json({ error: 'grade is required' }, { status: 400 })

    const subjects = await fetchGradeSubjects(params.schoolId, grade, ctx.ac)
    return NextResponse.json({ subjects })
  } catch (err) {
    console.error('[grade-subjects GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await sb(cookieStore).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    if (!body.grade || !body.subject?.trim()) {
      return NextResponse.json({ error: 'grade and subject are required' }, { status: 400 })
    }

    let orderIndex = body.orderIndex
    if (orderIndex === undefined) {
      const existing = await fetchGradeSubjects(params.schoolId, body.grade, ctx.ac)
      orderIndex = existing.length
    }

    const subject = {
      id: body.id ?? randomUUID(),
      schoolId: params.schoolId,
      grade: body.grade,
      subject: body.subject.trim(),
      periodsPerWeek: Number.isFinite(Number(body.periodsPerWeek)) ? Number(body.periodsPerWeek) : 0,
      category: (body.category === 'special' ? 'special' : 'core') as 'core' | 'special',
      orderIndex,
      createdAt: new Date().toISOString(),
    }
    await upsertGradeSubject(subject, ctx.ac)
    return NextResponse.json({ subject })
  } catch (err) {
    console.error('[grade-subjects POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await sb(cookieStore).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await deleteGradeSubject(id, ctx.ac)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[grade-subjects DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
