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

// Every section of the given grade in this school — admin-authored syllabus
// topics fan out to all of them, the same "shared across sections" mechanism
// the teacher-side hook already used, just triggered from admin now.
async function gradeClassIds(ac: ReturnType<typeof createAdminClient>, schoolId: string, grade: string): Promise<string[]> {
  const { data } = await ac.from('classes').select('id').eq('school_id', schoolId).eq('grade', grade)
  return (data ?? []).map(c => c.id)
}

// GET /api/admin/schools/[schoolId]/syllabus?grade=5&subject=Science — this
// grade+subject's syllabus, deduped to one row per definitionId (every
// section's copy is identical).
export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const ctx = await auth(params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { ac } = ctx

  const grade = req.nextUrl.searchParams.get('grade')
  const subject = req.nextUrl.searchParams.get('subject')
  if (!grade || !subject) return NextResponse.json({ error: 'grade and subject required' }, { status: 400 })

  try {
    const classIds = await gradeClassIds(ac, params.schoolId, grade)
    if (classIds.length === 0) return NextResponse.json({ topics: [] })

    // Exact subject match only. This used to also match subject IS NULL and
    // silently tag every untagged topic for the class with whatever subject
    // was opened first — that assumed a class only ever had one untagged
    // subject's worth of legacy topics, which isn't true in general (a class
    // holds every subject's topics, distinguished only by this column) and
    // led to real mislabeling (e.g. an EVS syllabus permanently retagged as
    // Mathematics just because Mathematics was viewed first). Untagged
    // legacy topics now need a deliberate, explicit fix rather than an
    // automatic guess.
    const { data } = await ac.from('syllabus_topics').select('*').in('class_id', classIds).eq('subject', subject).order('order_index')

    const seen = new Set<string>()
    const topics = (data ?? []).filter(t => {
      const key = t.definition_id ?? t.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).map(t => ({
      id: t.id, definitionId: t.definition_id ?? t.id, subject,
      topic: t.topic, description: t.description ?? '', weekNumber: t.week_number ?? undefined,
      orderIndex: t.order_index ?? 0, estimatedSessions: t.estimated_sessions ?? undefined,
      prerequisiteDefinitionId: t.prerequisite_definition_id ?? undefined,
      wasLegacy: false,
    }))
    return NextResponse.json({ topics })
  } catch (err) {
    console.error('[admin/syllabus GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST — add one topic, fanned out across every section of the grade.
export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const ctx = await auth(params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { ac } = ctx

  const body = await req.json().catch(() => null)
  const grade = body?.grade, subject = body?.subject, topic = body?.topic?.trim()
  if (!grade || !subject || !topic) return NextResponse.json({ error: 'grade, subject, and topic required' }, { status: 400 })

  try {
    const classIds = await gradeClassIds(ac, params.schoolId, grade)
    if (classIds.length === 0) return NextResponse.json({ error: 'No classes found for this grade' }, { status: 404 })

    const { data: existing } = await ac.from('syllabus_topics').select('order_index').in('class_id', classIds).order('order_index', { ascending: false }).limit(1)
    const nextOrder = (existing?.[0]?.order_index ?? -1) + 1
    const definitionId = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    const rows = classIds.map(classId => ({
      id: crypto.randomUUID(), class_id: classId, teacher_id: null,
      grade, subject, definition_id: definitionId,
      topic, description: body?.description?.trim() ?? '',
      week_number: body?.weekNumber ?? null, order_index: nextOrder,
      is_completed: false, created_at: createdAt,
    }))
    const { error } = await ac.from('syllabus_topics').insert(rows)
    if (error) throw error

    return NextResponse.json({ definitionId })
  } catch (err) {
    console.error('[admin/syllabus POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH — update a topic (description/weekNumber/estimatedSessions/prerequisite),
// fanned out to every section sharing its definitionId.
export async function PATCH(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const ctx = await auth(params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { ac } = ctx

  const body = await req.json().catch(() => null)
  const definitionId = body?.definitionId
  if (!definitionId) return NextResponse.json({ error: 'definitionId required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.estimatedSessions === 'number') update.estimated_sessions = body.estimatedSessions
  if (typeof body.description === 'string') update.description = body.description
  if (typeof body.weekNumber === 'number') update.week_number = body.weekNumber
  if (body.prerequisiteDefinitionId !== undefined) update.prerequisite_definition_id = body.prerequisiteDefinitionId || null
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  try {
    const { error } = await ac.from('syllabus_topics').update(update).eq('definition_id', definitionId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/syllabus PATCH] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE — remove a topic across every section sharing its definitionId.
export async function DELETE(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const ctx = await auth(params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { ac } = ctx

  const body = await req.json().catch(() => null)
  const definitionId = body?.definitionId
  if (!definitionId) return NextResponse.json({ error: 'definitionId required' }, { status: 400 })

  try {
    const { data: topicRows } = await ac.from('syllabus_topics').select('id').eq('definition_id', definitionId)
    const topicIds = (topicRows ?? []).map(t => t.id)
    if (topicIds.length > 0) await ac.from('syllabus_sub_topics').delete().in('topic_id', topicIds)
    const { error } = await ac.from('syllabus_topics').delete().eq('definition_id', definitionId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/syllabus DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
