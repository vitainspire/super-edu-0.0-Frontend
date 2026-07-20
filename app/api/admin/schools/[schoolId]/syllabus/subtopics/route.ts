import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin } from '@/lib/admin-queries'

function sb() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}

async function auth(schoolId: string) {
  const { data: { user } } = await sb().auth.getUser()
  if (!user) return null
  const ac = createAdminClient()
  const admin = await fetchAdmin(user.id, ac)
  if (!admin || admin.schoolId !== schoolId) return null
  return { ac }
}

// GET /api/admin/schools/[schoolId]/syllabus/subtopics?topicDefinitionId=X
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const ctx = await auth(params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { ac } = ctx

  const topicDefinitionId = req.nextUrl.searchParams.get('topicDefinitionId')
  if (!topicDefinitionId) return NextResponse.json({ error: 'topicDefinitionId required' }, { status: 400 })

  try {
    const { data: topicRows } = await ac.from('syllabus_topics').select('id').eq('definition_id', topicDefinitionId)
    const topicIds = (topicRows ?? []).map(t => t.id)
    if (topicIds.length === 0) return NextResponse.json({ subtopics: [] })

    const { data } = await ac.from('syllabus_sub_topics').select('*').in('topic_id', topicIds).order('order_index')
    const seen = new Set<string>()
    const subtopics = (data ?? []).filter(s => {
      const key = s.definition_id ?? s.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).map(s => ({
      id: s.id, definitionId: s.definition_id ?? s.id,
      name: s.name, description: s.description ?? '',
      orderIndex: s.order_index ?? 0, estimatedSessions: s.estimated_sessions ?? undefined,
    }))
    return NextResponse.json({ subtopics })
  } catch (err) {
    console.error('[admin/syllabus/subtopics GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST — add a sub-topic under a topic, fanned out to every section's copy of that topic.
export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const ctx = await auth(params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { ac } = ctx

  const body = await req.json().catch(() => null)
  const topicDefinitionId = body?.topicDefinitionId
  const name = body?.name?.trim()
  if (!topicDefinitionId || !name) return NextResponse.json({ error: 'topicDefinitionId and name required' }, { status: 400 })

  try {
    const { data: topicRows } = await ac.from('syllabus_topics').select('id, class_id').eq('definition_id', topicDefinitionId)
    if (!topicRows || topicRows.length === 0) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

    const { data: existing } = await ac.from('syllabus_sub_topics').select('order_index').in('topic_id', topicRows.map(t => t.id)).order('order_index', { ascending: false }).limit(1)
    const nextOrder = (existing?.[0]?.order_index ?? -1) + 1
    const definitionId = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    const rows = topicRows.map(t => ({
      id: crypto.randomUUID(), topic_id: t.id, class_id: t.class_id, teacher_id: null,
      definition_id: definitionId, name, description: body?.description?.trim() ?? null,
      order_index: nextOrder, is_completed: false, created_at: createdAt,
    }))
    const { error } = await ac.from('syllabus_sub_topics').insert(rows)
    if (error) throw error

    return NextResponse.json({ definitionId })
  } catch (err) {
    console.error('[admin/syllabus/subtopics POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH — update a sub-topic's estimated sessions, fanned out by its own definitionId.
export async function PATCH(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const ctx = await auth(params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { ac } = ctx

  const body = await req.json().catch(() => null)
  const definitionId = body?.definitionId
  if (!definitionId || typeof body.estimatedSessions !== 'number') {
    return NextResponse.json({ error: 'definitionId and estimatedSessions required' }, { status: 400 })
  }

  try {
    const { error } = await ac.from('syllabus_sub_topics').update({ estimated_sessions: body.estimatedSessions }).eq('definition_id', definitionId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/syllabus/subtopics PATCH] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE — remove a sub-topic across every section's copy.
export async function DELETE(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const ctx = await auth(params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { ac } = ctx

  const body = await req.json().catch(() => null)
  const definitionId = body?.definitionId
  if (!definitionId) return NextResponse.json({ error: 'definitionId required' }, { status: 400 })

  try {
    const { error } = await ac.from('syllabus_sub_topics').delete().eq('definition_id', definitionId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/syllabus/subtopics DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
