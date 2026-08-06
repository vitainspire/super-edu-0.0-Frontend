import type { createAdminClient } from '@/lib/supabase-admin'

// ── Previous topic for the lesson refresher ("Last time: …").
//
// The syllabus is the authoritative ordered curriculum: topics by order_index,
// and within each topic its sub-topics by order_index. Flattening those two
// levels gives the exact sequence the class works through, so "what came just
// before this lesson" is a lookup, not a guess.
//
// That matters because the previous implementation asked taught_topics instead —
// "what did this class most recently log?" — and taught_topics is only written
// when a teacher logs attendance with a topic or opens the prep modal. In a class
// that stopped logging after Week 1, the newest row WAS Week 1, so a Week-8
// "Measurement" lesson opened with a place-value recap of "Large Numbers".
//
// Order of preference:
//   1. Previous SUB-TOPIC inside the same topic — mid-unit, this is exactly the
//      last thing the class did, and it's guaranteed related.
//   2. At a topic boundary: the declared prerequisite (teacher's "Requires
//      first"), then the extracted dependency graph.
//   3. Still at a boundary: the last sub-topic of the preceding topic.
//   4. Recency-bounded taught_topics — only when the topic isn't in the syllabus
//      at all (ad-hoc lesson), since then there's no sequence to walk.
// Nothing qualifying returns null, and the lesson gets no refresher — correct far
// more often than inventing a bridge between unrelated topics.
//
// Note there is deliberately no "distance" guard on the walk. Steps are adjacent
// entries in the flattened sequence, so the previous step is never more than one
// topic back — that's what walking the syllabus buys over querying taught_topics,
// where a Week-1 row could be "most recent" in Week 8. Whether the previous unit
// is pedagogically RELATED is a judgment the prompt makes (it may set the
// refresher to null); this function's job is to report the sequence faithfully.

// How stale a taught_topics row may be before it stops counting as "last time".
// Only used for lessons with no syllabus position to walk.
const REFRESHER_MAX_AGE_DAYS = 28

type TopicRow = {
  id: string
  topic: string
  definition_id: string | null
  order_index: number | null
  is_completed: boolean | null
  subject: string | null
}

type SubTopicRow = {
  topic_id: string
  name: string
  order_index: number | null
  is_completed: boolean | null
}

// One lesson-sized step through the curriculum. A topic with no sub-topics
// contributes a single entry whose `subtopicName` is null.
type CurriculumStep = {
  topicIndex: number
  topicName: string
  topicDefId: string | null
  subtopicName: string | null
  isCompleted: boolean
}

function label(step: CurriculumStep): string {
  return (step.subtopicName ?? step.topicName).trim()
}

export async function fetchPreviousTopic(
  admin: ReturnType<typeof createAdminClient>, classId: string, topic: string,
  topicDefinitionId?: string, currentSubtopic?: string, subject?: string,
): Promise<string | null> {
  const curTopic = topic.trim().toLowerCase()
  const curSub = (currentSubtopic ?? '').trim().toLowerCase()
  const curSubject = (subject ?? '').trim().toLowerCase()

  // ── Load the syllabus for this class ──────────────────────────────────────
  let topicRows: TopicRow[] = []
  try {
    const { data } = await admin
      .from('syllabus_topics')
      .select('id, topic, definition_id, order_index, is_completed, subject')
      .eq('class_id', classId)
      .order('order_index', { ascending: true })
    topicRows = (data ?? []) as TopicRow[]
  } catch { /* table missing — every branch below degrades to null */ }

  // Same-subject topics only. A class is grade+section with no subject of its
  // own, so an unfiltered syllabus mixes Maths and Science and the "previous
  // topic" can silently come from the wrong subject.
  const sameSubject = curSubject
    ? topicRows.filter(r => (r.subject ?? '').trim().toLowerCase() === curSubject)
    : topicRows
  // Fall back to the unfiltered list only when the subject column is unpopulated
  // (pre-migration-016 data), not when this subject genuinely has no topics.
  const subjectUnpopulated = !topicRows.some(r => r.subject)
  const scoped = sameSubject.length > 0 ? sameSubject : (subjectUnpopulated ? topicRows : [])

  let subTopicRows: SubTopicRow[] = []
  try {
    const { data } = await admin
      .from('syllabus_sub_topics')
      .select('topic_id, name, order_index, is_completed')
      .eq('class_id', classId)
      .order('order_index', { ascending: true })
    subTopicRows = (data ?? []) as SubTopicRow[]
  } catch { /* no sub-topics — the walk below degrades to topic granularity */ }

  const subsByTopicId = new Map<string, SubTopicRow[]>()
  for (const s of subTopicRows) {
    const list = subsByTopicId.get(s.topic_id) ?? []
    list.push(s)
    subsByTopicId.set(s.topic_id, list)
  }
  for (const list of subsByTopicId.values()) {
    list.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  }

  // ── Flatten to the ordered sequence of lessons ────────────────────────────
  const steps: CurriculumStep[] = []
  scoped.forEach((t, topicIndex) => {
    const subs = subsByTopicId.get(t.id) ?? []
    if (subs.length === 0) {
      steps.push({
        topicIndex, topicName: t.topic, topicDefId: t.definition_id,
        subtopicName: null, isCompleted: t.is_completed === true,
      })
      return
    }
    for (const s of subs) {
      steps.push({
        topicIndex, topicName: t.topic, topicDefId: t.definition_id,
        subtopicName: s.name, isCompleted: s.is_completed === true,
      })
    }
  })

  const nameForDefinitionId = (defId: string): string | null =>
    scoped.find(r => r.definition_id === defId)?.topic?.trim()
      ?? topicRows.find(r => r.definition_id === defId)?.topic?.trim()
      ?? null

  // ── Locate today's lesson in that sequence ────────────────────────────────
  const matchesTopic = (s: CurriculumStep): boolean =>
    topicDefinitionId
      ? s.topicDefId === topicDefinitionId
      : s.topicName.trim().toLowerCase() === curTopic

  let currentIndex = -1
  if (curSub) {
    currentIndex = steps.findIndex(s => matchesTopic(s) && (s.subtopicName ?? '').trim().toLowerCase() === curSub)
  }
  if (currentIndex === -1) {
    // No sub-topic given, or the name didn't match a syllabus row (renamed /
    // ad-hoc). Treat the lesson as sitting at the start of its topic — the
    // conservative choice, since assuming a later position would invent
    // same-unit history the class may not have covered yet.
    currentIndex = steps.findIndex(matchesTopic)
  }

  const current = currentIndex >= 0 ? steps[currentIndex] : null
  const currentDefId = topicDefinitionId
    ?? current?.topicDefId
    ?? scoped.find(r => r.topic.trim().toLowerCase() === curTopic)?.definition_id
    ?? null

  // 1. Mid-unit: the previous sub-topic of the same topic. This is literally the
  // previous lesson, so it needs no relevance test — "Weight: Conversion" really
  // does lead into "Weight: Addition and subtraction".
  //
  // Prefer the nearest COMPLETED sub-topic, because is_completed records what was
  // actually taught while order_index only records the plan. A teacher who skips
  // ahead shouldn't get "Last time: <something the class never did>". The search
  // stays inside the current unit, so it can't run away to a Week-1 topic the way
  // the old unbounded is_completed scan did.
  if (current && currentIndex > 0) {
    const unitStart = steps.findIndex(s => s.topicIndex === current.topicIndex)
    let fallback: CurriculumStep | null = null
    for (let i = currentIndex - 1; i >= unitStart; i--) {
      if (fallback == null) fallback = steps[i]      // immediately-preceding step
      if (steps[i].isCompleted) {
        const name = label(steps[i])
        if (name) return name
      }
    }
    // Nothing in this unit is marked done — the class may simply not be tracking
    // completion, so fall back to the planned previous lesson rather than nothing.
    if (fallback) {
      const name = label(fallback)
      if (name) return name
    }
  }

  // 2. At a topic boundary, "what should they already know?" is the real
  // question — so the declared prerequisite wins. It's the one signal that is
  // unambiguously about whether the old topic feeds this one.
  if (currentDefId) {
    try {
      const { data: prereqRows } = await admin
        .from('syllabus_topics')
        .select('prerequisite_definition_id')
        .eq('class_id', classId)
        .eq('definition_id', currentDefId)
        .not('prerequisite_definition_id', 'is', null)
        .limit(1)
      const prereqDefId = prereqRows?.[0]?.prerequisite_definition_id as string | undefined
      if (prereqDefId) {
        const name = nameForDefinitionId(prereqDefId)
        if (name) return name
      }
    } catch { /* column not migrated — try the dependency graph */ }
  }

  // 3. The extracted dependency graph (migration 019), when a textbook analysis
  // recorded what this topic builds on. 'required' before 'recommended'.
  if (currentDefId) {
    try {
      const { data: deps } = await admin
        .from('syllabus_dependencies')
        .select('to_definition_id, dependency_type, strength')
        .eq('from_definition_id', currentDefId)
        .in('dependency_type', ['depends_on', 'prerequisite', 'recommended'])
      const ranked = (deps ?? []).sort((a: { strength: string }, b: { strength: string }) =>
        (a.strength === 'required' ? 0 : 1) - (b.strength === 'required' ? 0 : 1))
      for (const d of ranked as { to_definition_id: string }[]) {
        const name = nameForDefinitionId(d.to_definition_id)
        if (name && name.toLowerCase() !== curTopic) return name
      }
    } catch { /* table not migrated — fall through */ }
  }

  // 4. Nothing declared, so fall back to the preceding step in the syllabus —
  // the LAST sub-topic of the previous topic, which is more specific than the
  // bare topic name.
  if (current && currentIndex > 0) {
    const name = label(steps[currentIndex - 1])
    if (name) return name
  }

  // 5. The lesson isn't in the syllabus at all (ad-hoc topic), so there's no
  // sequence to walk. Recent taught history is the only remaining signal —
  // bounded by age, and required to belong to this subject.
  if (current) return null
  try {
    const cutoff = new Date(Date.now() - REFRESHER_MAX_AGE_DAYS * 86_400_000)
      .toISOString().split('T')[0]
    const { data: taught } = await admin
      .from('taught_topics')
      .select('topic, subtopic, date, created_at')
      .eq('class_id', classId)
      .gte('date', cutoff)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20)

    // taught_topics has no subject column, so the only way to keep a Science row
    // out of a Maths lesson is to require the topic to exist in this subject's
    // syllabus. Skipped when the syllabus isn't subject-scoped.
    const inThisSubject = (t: string): boolean => {
      if (!curSubject || scoped.length === 0) return true
      return scoped.some(r => r.topic.trim().toLowerCase() === t)
    }

    const prev = (taught ?? []).find((r: { topic?: string; subtopic?: string | null }) => {
      const t = (r.topic ?? '').trim().toLowerCase()
      const s = (r.subtopic ?? '').trim().toLowerCase()
      if (t === curTopic && s === curSub) return false   // don't recap ourselves
      return inThisSubject(t)
    })
    if (prev) {
      // Prefer the sub-topic label — that's the specific thing the class did.
      const s = (prev.subtopic ?? '').trim()
      const t = (prev.topic ?? '').trim()
      if (s) return s
      if (t) return t
    }
  } catch { /* nothing left to try */ }

  return null
}
