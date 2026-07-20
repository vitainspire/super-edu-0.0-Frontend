import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchAcademicEvents, upsertAcademicEvent, deleteAcademicEvent } from '@/lib/admin-queries'
import { parseBody, AcademicEventSchema } from '@/lib/schemas'

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

export async function GET(_req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const events = await fetchAcademicEvents(params.schoolId, ctx.ac)
    return NextResponse.json({ events })
  } catch (err) {
    console.error('[admin/academic-events GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const rawBody = await req.json().catch(() => null) as ({ id?: string } | null)
    const parsed = parseBody(AcademicEventSchema, rawBody)
    if (!parsed.ok) return parsed.response

    // Editing an already-published event keeps it published — only brand-new
    // events start as drafts, waiting for the next "Publish Calendar" pass.
    let published = false
    if (rawBody?.id) {
      const existing = await fetchAcademicEvents(params.schoolId, ctx.ac)
      published = existing.find(e => e.id === rawBody.id)?.published ?? false
    }

    const event = {
      id: rawBody?.id ?? randomUUID(),
      schoolId: params.schoolId,
      title: parsed.data.title,
      category: parsed.data.category,
      holidaySubtype: parsed.data.holidaySubtype,
      countsAsNonWorking: parsed.data.countsAsNonWorking ?? true,
      published,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      description: parsed.data.description,
      createdAt: new Date().toISOString(),
    }
    await upsertAcademicEvent(event, ctx.ac)
    return NextResponse.json({ event }, { status: 201 })
  } catch (err) {
    console.error('[admin/academic-events POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await deleteAcademicEvent(id, params.schoolId, ctx.ac)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/academic-events DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
