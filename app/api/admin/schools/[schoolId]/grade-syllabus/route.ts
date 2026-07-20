import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchSchoolClasses } from '@/lib/admin-queries'
import { randomUUID } from 'crypto'

type AC = ReturnType<typeof createAdminClient>
type Row = Record<string, unknown>

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

// Same lookup order used by the per-class syllabus route: explicit assignment first, else timetable
async function findClassTeacher(classId: string, ac: AC): Promise<string | null> {
  const { data: asgRow } = await ac
    .from('teacher_class_assignments').select('teacher_id').eq('class_id', classId).limit(1).maybeSingle()
  let teacherId = (asgRow as Row | null)?.teacher_id as string | null ?? null
  if (!teacherId) {
    const { data: stp } = await ac
      .from('school_timetable_periods').select('teacher_id').eq('class_id', classId).limit(1).maybeSingle()
    teacherId = (stp as Row | null)?.teacher_id as string | null ?? null
  }
  return teacherId
}

function mapTopic(r: Row) {
  return {
    definitionId: r.definition_id as string,
    subject: (r.subject as string) ?? '',
    topic: r.topic as string,
    description: (r.description as string) ?? '',
    weekNumber: (r.week_number as number) ?? null,
    orderIndex: (r.order_index as number) ?? 0,
  }
}

// ── GET — list a grade+subject's shared topics (deduped across sections by definition_id) ──
export async function GET(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await sb(cookieStore).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url)
    const grade = url.searchParams.get('grade')
    const subject = url.searchParams.get('subject')
    if (!grade) return NextResponse.json({ error: 'grade is required' }, { status: 400 })
    if (!subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 })

    const { data, error } = await ctx.ac
      .from('syllabus_topics')
      .select('*')
      .eq('school_id', params.schoolId)
      .eq('grade', grade)
      .eq('subject', subject)
      .order('order_index')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const byDef = new Map<string, Row>()
    for (const r of (data ?? []) as Row[]) {
      const defId = (r.definition_id as string) ?? (r.id as string)
      if (!byDef.has(defId)) byDef.set(defId, { ...r, definition_id: defId })
    }
    const topics = [...byDef.values()].map(mapTopic).sort((a, b) => a.orderIndex - b.orderIndex)
    return NextResponse.json({ topics })
  } catch (err) {
    console.error('[grade-syllabus GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── POST — add a topic, fanned out to every section of the grade ──────────────
export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await sb(cookieStore).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body: { grade: string; subject: string; topic: string; description?: string; weekNumber?: number } = await req.json()
    if (!body.grade || !body.subject?.trim() || !body.topic?.trim()) {
      return NextResponse.json({ error: 'grade, subject and topic are required' }, { status: 400 })
    }

    const allClasses = await fetchSchoolClasses(params.schoolId, ctx.ac)
    const sections = allClasses.filter(c => c.grade === body.grade)
    if (sections.length === 0) {
      return NextResponse.json({ error: `No classes found for grade ${body.grade}.` }, { status: 400 })
    }

    const { data: existing } = await ctx.ac
      .from('syllabus_topics')
      .select('order_index')
      .eq('school_id', params.schoolId)
      .eq('grade', body.grade)
      .eq('subject', body.subject.trim())
      .order('order_index', { ascending: false })
      .limit(1)
    const nextIndex = ((existing?.[0] as Row | undefined)?.order_index as number ?? -1) + 1

    const definitionId = randomUUID()
    const teacherIds = await Promise.all(sections.map(s => findClassTeacher(s.id, ctx.ac)))

    const rows = sections.map((sec, i) => ({
      id: randomUUID(),
      class_id: sec.id,
      teacher_id: teacherIds[i],
      grade: body.grade,
      subject: body.subject.trim(),
      school_id: params.schoolId,
      definition_id: definitionId,
      topic: body.topic.trim(),
      description: body.description?.trim() ?? '',
      week_number: body.weekNumber ?? null,
      order_index: nextIndex,
      is_completed: false,
    }))

    const { error } = await ctx.ac.from('syllabus_topics').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ definitionId }, { status: 201 })
  } catch (err) {
    console.error('[grade-syllabus POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ── DELETE — remove a topic from every section sharing its definition_id ──────
export async function DELETE(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const { data: { user } } = await sb(cookieStore).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { definitionId }: { definitionId: string } = await req.json()
    if (!definitionId) return NextResponse.json({ error: 'definitionId is required' }, { status: 400 })

    const { data: topics } = await ctx.ac
      .from('syllabus_topics').select('id').eq('definition_id', definitionId)
    const topicIds = (topics ?? []).map((t: Row) => t.id as string)

    if (topicIds.length > 0) {
      await ctx.ac.from('syllabus_sub_topics').delete().in('topic_id', topicIds)
    }
    const { error } = await ctx.ac.from('syllabus_topics').delete().eq('definition_id', definitionId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[grade-syllabus DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
