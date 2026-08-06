import { createAdminClient } from '@/lib/supabase-admin'
import type { TeachingProfile, SmartLesson } from '@/lib/types'

// ── Shared prep/workbook context gathering ───────────────────────────────────
// The same class-specific inputs the Prep Sheet is built from — interests, weak
// topics, previous topic, textbook grounding, teacher profile — plus the already
// generated prep lesson for this topic (so the Workbook can be grounded in what
// was actually taught). Kept SELF-CONTAINED (the query logic mirrors the block
// in app/api/smart-lesson/route.ts) so the workbook route reuses it without
// touching the working prep pipeline.

type Admin = ReturnType<typeof createAdminClient>

export interface Grounding {
  chapterTitle?: string
  pageStart?: number
  pageEnd?: number
  exercises: { text: string; type: string }[]
  sidebars: string[]
}

// Class-wide signals (topic-independent).
export interface ClassContext {
  totalStudents: number
  classInterests: string[]
  weakTopics: string[]
  teachingProfile: TeachingProfile | null
}

// Per-topic signals.
export interface TopicContext {
  topic: string
  subtopic?: string
  grounding: Grounding | null
  prepLesson: SmartLesson | null   // existing prep-sheet content for this class+topic, if any
}

async function fetchGrounding(admin: Admin, topicDefinitionId: string): Promise<Grounding | null> {
  try {
    const { data: topicRows } = await admin
      .from('syllabus_topics')
      .select('id, chapter_id')
      .eq('definition_id', topicDefinitionId)
    if (!topicRows?.length) return null

    const topicIds = topicRows.map((t: { id: string }) => t.id)
    const chapterId = topicRows[0]?.chapter_id as string | null

    let chapterTitle: string | undefined
    let pageStart: number | undefined
    let pageEnd: number | undefined
    if (chapterId) {
      const { data: chapter } = await admin
        .from('syllabus_chapters')
        .select('title, page_start, page_end')
        .eq('id', chapterId)
        .maybeSingle()
      if (chapter) {
        chapterTitle = chapter.title ?? undefined
        pageStart = chapter.page_start ?? undefined
        pageEnd = chapter.page_end ?? undefined
      }
    }

    const { data: exRows } = await admin
      .from('syllabus_exercises')
      .select('text, exercise_type, definition_id')
      .in('topic_id', topicIds)
    const seenEx = new Set<string>()
    const exercises = (exRows ?? [])
      .filter((e: { definition_id: string }) => {
        if (seenEx.has(e.definition_id)) return false
        seenEx.add(e.definition_id)
        return true
      })
      .map((e: { text: string; exercise_type: string }) => ({ text: e.text, type: e.exercise_type }))

    const { data: sbRows } = await admin
      .from('syllabus_sidebars')
      .select('text, definition_id')
      .in('topic_id', topicIds)
    const seenSb = new Set<string>()
    const sidebars = (sbRows ?? [])
      .filter((s: { definition_id: string }) => {
        if (seenSb.has(s.definition_id)) return false
        seenSb.add(s.definition_id)
        return true
      })
      .map((s: { text: string }) => s.text)

    if (!chapterTitle && exercises.length === 0 && sidebars.length === 0) return null
    return { chapterTitle, pageStart, pageEnd, exercises, sidebars }
  } catch {
    return null
  }
}

async function fetchPrepLesson(admin: Admin, classId: string, topic: string, subtopic?: string): Promise<SmartLesson | null> {
  try {
    const { data: rows } = await admin
      .from('prep_materials')
      .select('lesson, subtopic')
      .eq('class_id', classId)
      .ilike('topic', topic)   // case-insensitive exact match (no wildcards)
    if (!rows?.length) return null
    const wantSub = (subtopic ?? '').trim().toLowerCase()
    const exact = rows.find((r: { subtopic?: string | null }) => (r.subtopic ?? '').trim().toLowerCase() === wantSub)
    return ((exact ?? rows[0]) as { lesson?: SmartLesson }).lesson ?? null
  } catch {
    return null
  }
}

// Class-wide context — gathered ONCE per workbook, independent of topic.
export async function gatherClassContext(
  admin: Admin,
  opts: { classId: string; teacherId?: string },
): Promise<ClassContext> {
  const { classId, teacherId } = opts

  const { data: students } = await admin
    .from('students')
    .select('id, interests')
    .eq('class_id', classId)
    .eq('is_active', true)
  const totalStudents = (students ?? []).length

  const interestCounts = new Map<string, number>()
  for (const s of (students ?? []) as { interests?: string[] | null }[]) {
    for (const raw of s.interests ?? []) {
      const i = (raw ?? '').trim()
      if (!i) continue
      interestCounts.set(i, (interestCounts.get(i) ?? 0) + 1)
    }
  }
  const classInterests = [...interestCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([i]) => i)
    .slice(0, 5)

  const teachingProfile: TeachingProfile | null = teacherId
    ? (await admin.from('teachers').select('teaching_profile').eq('id', teacherId).maybeSingle()).data?.teaching_profile ?? null
    : null

  const { data: allMarks } = await admin
    .from('marks')
    .select('student_id, score, tests(topic, total_marks)')
    .in('student_id', (students ?? []).map((s: { id: string }) => s.id))

  type MarkRow = { student_id: string; score: number; tests: { topic: string; total_marks: number } | null }
  const marks = (allMarks ?? []) as unknown as MarkRow[]
  const topicStats = new Map<string, { totalPct: number; count: number }>()
  for (const mark of marks) {
    if (!mark.tests?.total_marks) continue
    const t = mark.tests.topic
    const pct = mark.score / mark.tests.total_marks
    const cur = topicStats.get(t) ?? { totalPct: 0, count: 0 }
    topicStats.set(t, { totalPct: cur.totalPct + pct, count: cur.count + 1 })
  }
  const weakTopics = [...topicStats.entries()]
    .filter(([, s]) => s.totalPct / s.count < 0.65)
    .map(([t]) => t)
    .slice(0, 3)

  return { totalStudents, classInterests, weakTopics, teachingProfile }
}

// Per-topic context — grounding + any existing prep lesson for that topic.
export async function gatherTopicContext(
  admin: Admin,
  opts: { classId: string; topic: string; subtopic?: string; topicDefinitionId?: string },
): Promise<TopicContext> {
  const { classId, topic, subtopic, topicDefinitionId } = opts
  const grounding = topicDefinitionId ? await fetchGrounding(admin, topicDefinitionId) : null
  const prepLesson = await fetchPrepLesson(admin, classId, topic, subtopic)
  return { topic, subtopic, grounding, prepLesson }
}
