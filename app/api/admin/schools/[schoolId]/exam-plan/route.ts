import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchExamPlanItems, upsertExamPlanItem, deleteExamPlanItem } from '@/lib/admin-queries'

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
  try {
    const cookieStore = cookies()
    const { data: { user } } = await sb(cookieStore).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const items = await fetchExamPlanItems(params.schoolId, ctx.ac)
    return NextResponse.json({ items })
  } catch (err) {
    console.error('[exam-plan GET] failed:', err)
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
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    let orderIndex = body.orderIndex
    if (orderIndex === undefined) {
      const existing = await fetchExamPlanItems(params.schoolId, ctx.ac)
      orderIndex = existing.length
    }

    const item = {
      id: body.id ?? randomUUID(),
      schoolId: params.schoolId,
      name: body.name.trim(),
      count: Number.isFinite(Number(body.count)) ? Math.max(1, Number(body.count)) : 1,
      orderIndex,
      createdAt: new Date().toISOString(),
    }
    await upsertExamPlanItem(item, ctx.ac)
    return NextResponse.json({ item })
  } catch (err) {
    console.error('[exam-plan POST] failed:', err)
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
    await deleteExamPlanItem(id, ctx.ac)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[exam-plan DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
