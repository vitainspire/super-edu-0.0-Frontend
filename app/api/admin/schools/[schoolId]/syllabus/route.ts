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
      // school_id was missing here, and every topic this route created was
      // invisible to the endpoints that scope by tenant — the grade-syllabus
      // reader and the progression writer both filter on it.
      school_id: params.schoolId,
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

// The rest of a PDF-imported ontology. persist_extraction writes seven tables;
// chapters, concept dependencies and the extraction record are scoped to
// school+grade+subject rather than to any one topic, so a bulk wipe has to
// clear them explicitly or a re-import stacks on top of the old ontology.
async function deleteSyllabusScoped(
  ac: ReturnType<typeof createAdminClient>, schoolId: string, grade: string, subject: string,
) {
  for (const table of ['syllabus_chapters', 'syllabus_dependencies', 'syllabus_ontology_extractions']) {
    const { error } = await ac.from(table).delete()
      .eq('school_id', schoolId).eq('grade', grade).eq('subject', subject)
    if (error) throw error
  }
}

// DELETE — two modes:
//   { definitionId }    remove one topic across every section sharing it
//   { grade, subject }  remove that grade+subject's entire syllabus
//
// The bulk mode exists because an AI-imported textbook yields ~100 topics, and
// clearing a bad import one row at a time is not a real option.
export async function DELETE(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const ctx = await auth(params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { ac } = ctx

  const body = await req.json().catch(() => null)
  const definitionId = body?.definitionId
  const grade = body?.grade, subject = body?.subject

  if (!definitionId && !(grade && subject)) {
    return NextResponse.json({ error: 'definitionId, or grade and subject, required' }, { status: 400 })
  }

  try {
    // Resolve the target rows. The bulk branch scopes by this school's classes
    // for the grade and an exact subject match — the same filter GET uses, so
    // "delete the syllabus" can only ever remove what the page was showing.
    let topicIds: string[]
    if (definitionId) {
      const { data } = await ac.from('syllabus_topics').select('id').eq('definition_id', definitionId)
      topicIds = (data ?? []).map(t => t.id)
    } else {
      const classIds = await gradeClassIds(ac, params.schoolId, grade)
      if (classIds.length === 0) {
        // No classes means no topics, but chapters/dependencies/extractions are
        // keyed to school+grade+subject and can outlive them — fall through to
        // the scoped cleanup below rather than returning early.
        topicIds = []
      } else {
        const { data } = await ac.from('syllabus_topics').select('id').in('class_id', classIds).eq('subject', subject)
        topicIds = (data ?? []).map(t => t.id)
      }
    }

    if (topicIds.length === 0) {
      // Nothing to remove, but a bulk wipe should still clear grade+subject
      // scoped rows that outlive their topics (e.g. a part-cleared import).
      if (!definitionId) await deleteSyllabusScoped(ac, params.schoolId, grade, subject)
      return NextResponse.json({ ok: true, deletedTopics: 0 })
    }

    // Children first — all three hang off topic_id. A PDF import writes
    // exercises and sidebars alongside sub-topics, and deleting only sub-topics
    // (as this route used to) left them orphaned with no owning topic.
    for (const table of ['syllabus_exercises', 'syllabus_sidebars', 'syllabus_sub_topics']) {
      const { error } = await ac.from(table).delete().in('topic_id', topicIds)
      if (error) throw error
    }

    // Delete by the ids we just resolved rather than re-running the filter, so
    // a topic created between the two queries cannot be caught by surprise.
    const { error } = await ac.from('syllabus_topics').delete().in('id', topicIds)
    if (error) throw error

    if (definitionId) {
      // Concept edges are keyed by definition_id, not topic_id, so they survive
      // the delete above and would dangle. Both directions have to go.
      for (const col of ['from_definition_id', 'to_definition_id']) {
        await ac.from('syllabus_dependencies').delete().eq(col, definitionId)
      }
    } else {
      await deleteSyllabusScoped(ac, params.schoolId, grade, subject)
    }

    return NextResponse.json({ ok: true, deletedTopics: topicIds.length })
  } catch (err) {
    console.error('[admin/syllabus DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
