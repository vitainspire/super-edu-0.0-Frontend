import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getClientIp } from '@/lib/logger'
import { checkVisionRateLimit } from '@/lib/rate-limit'
import { generateIllustration } from '@/lib/ai'
import { personalizationEmphasis } from '@/lib/logic/teaching-profile'
import type { TeachingProfile } from '@/lib/types'

// Raised from 60s: beyond the text call, we now generate one reference sketch
// per concept bullet (in parallel) for the teacher to copy onto the board.
export const maxDuration = 90

// ── Grounding: pull whatever this topic's real textbook extraction saved ────
// (see db/migrations/019_full_syllabus_ontology.sql + backend/app/lib/syllabus_persist.py).
// Optional — a manually-authored topic (no PDF import) simply has none of this,
// and the prompt falls back to inventing generic, locally-available materials.
interface Grounding {
  chapterTitle?: string
  pageStart?: number
  pageEnd?: number
  exercises: { text: string; type: string }[]
  sidebars: string[]
}

async function fetchGrounding(admin: ReturnType<typeof createAdminClient>, topicDefinitionId: string): Promise<Grounding | null> {
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
    return null   // tables not migrated yet, or query failed — fall back to AI-only
  }
}

// POST /api/smart-lesson
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkVisionRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })

  let body: {
    classId: string; topic: string; subject: string; grade: string
    teacherId?: string; subtopic?: string; topicDefinitionId?: string
    contextNote?: string   // optional, ephemeral: "today's context" (goal/resources), not persisted
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { classId, topic, subject, grade, subtopic, topicDefinitionId, teacherId, contextNote } = body
  if (!classId || !topic || !subject || !grade) {
    return NextResponse.json({ error: 'classId, topic, subject, grade are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Active students in this class → class size for personalization
  const { data: students } = await admin
    .from('students')
    .select('id')
    .eq('class_id', classId)
    .eq('is_active', true)
  const totalStudents = (students ?? []).length

  // 2. Teacher's saved Teaching Profile, if any (set up via /profile/teaching)
  const teachingProfile: TeachingProfile | null = teacherId
    ? (await admin.from('teachers').select('teaching_profile').eq('id', teacherId).maybeSingle()).data?.teaching_profile ?? null
    : null

  // 3. Silent gap-awareness: weak prior topics, used only to nudge which real-life
  // angle the Experience takes — never surfaced as its own section or "bridge note".
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
    .filter(([t, s]) => t.toLowerCase() !== topic.toLowerCase() && s.totalPct / s.count < 0.65)
    .map(([t]) => t)
    .slice(0, 2)

  // 4. Grounding — real textbook content this topic was extracted from, if any
  const grounding = topicDefinitionId ? await fetchGrounding(admin, topicDefinitionId) : null

  // 5. Build the prompt
  const groundingContext = grounding
    ? `This topic comes from an actual textbook chapter that has already been analysed. Ground the Concept bullets and flow in this REAL content instead of inventing generic material:
${grounding.chapterTitle ? `Chapter: "${grounding.chapterTitle}"${grounding.pageStart ? ` (pages ${grounding.pageStart}-${grounding.pageEnd ?? grounding.pageStart})` : ''}` : ''}
${grounding.exercises.length > 0 ? `\nActual exercises/activities in the textbook for this topic:\n${grounding.exercises.map(e => `- [${e.type}] ${e.text}`).join('\n')}` : ''}
${grounding.sidebars.length > 0 ? `\nActual sidebar notes/tips printed alongside this topic:\n${grounding.sidebars.map(s => `- ${s}`).join('\n')}` : ''}`
    : `No textbook extraction is available — use standard grade-appropriate concepts, nothing exotic. This says nothing about materials — the "materials" list is governed entirely by the teacher's profile below (or, only if no profile is on file, generic locally-available items like slate/chalk).`

  const preferencesContext = (() => {
    if (!teachingProfile) {
      return `No Teaching Profile on file yet — default to a simple, universally comfortable activity (storytelling + pair work).`
    }
    const { roles, goals, preferredActivities, comfortZones } = teachingProfile.teacherIdentity
    const { classSize, resources, language } = teachingProfile.classroom
    const { emphasize, minimize } = personalizationEmphasis(teachingProfile.personalization)

    const lines = [
      roles.length > 0 && `Sees themselves as: ${roles.join(', ')}.`,
      goals.length > 0 && `Wants students to: ${goals.join(', ')}.`,
      preferredActivities.length > 0 && `Enjoys using: ${preferredActivities.join(', ')}.`,
      comfortZones.length > 0 && `Comfortable with: ${comfortZones.join(', ')}.`,
      classSize && `Typical class size: ${classSize}.`,
      resources.length > 0 && `Classroom has: ${resources.join(', ')}.`,
      language.length > 0 && `Classroom language: ${language.join(', ')}.`,
      emphasize.length > 0 && `Lean into: ${emphasize.join(', ')}.`,
      minimize.length > 0 && `Minimize: ${minimize.join(', ')}.`,
    ].filter(Boolean).join(' ')

    const resourceRule = resources.length > 0
      ? `"materials" must be chosen ONLY from this exact list: ${resources.join(', ')} — never add chalk, slate, paper, or any other item not on this list, even if it seems like a harmless default.`
      : `No resources were listed for this classroom — use only the single most generic, universally-available item (e.g. chalkboard) and nothing else.`

    return `This teacher's profile — ${lines} The flow MUST reflect this profile — its shape, order, and stage count, not just a swapped noun; it is the single biggest personalization signal you have. ${resourceRule} Never suggest something outside the teacher's comfort zone.`
  })()

  const weakTopicsContext = weakTopics.length > 0
    ? `This class is weak on: ${weakTopics.join(', ')}. If it fits naturally, let the flow's real-world framing also reinforce one of these — but never mention them explicitly or call it review.`
    : ''

  const contextNoteLine = contextNote?.trim()
    ? `Teacher's note for today: ${contextNote.trim()}`
    : ''

  const systemPrompt = `You are an expert classroom teacher and instructional designer. You write extremely concise, classroom-ready prep sheets — never essays, never quiz questions, never generic filler. A teacher opens this five minutes before class and scans it; every field is short enough to read in seconds.

Core belief: the teacher isn't trying to "engage" students — they're creating one concrete experience through which understanding naturally happens. Every "detail" in the flow must BE that experience (a scene, an activity, a task), not a description of teaching technique, and it must contain zero questions like "What is X?".

Two different teachers with different profiles teaching the same topic should produce lessons that feel designed by two different people — not the same activity with one noun swapped. The teacher's roles, goals, and preferred activities should change the actual sequence and shape of the lesson (what happens first, how it's framed, how it builds), not just decorate a fixed structure with a matching word. A storyteller-teacher's lesson doesn't just "add a story" to the same three steps — it moves through the topic AS a story. A debate-lover's lesson moves through it as a disagreement to resolve. A puzzle-lover's lesson moves through it as a mystery to crack.

Materials are load-bearing, not decorative. "materials" must be a strict subset of what the teacher's classroom actually has (never invent equipment they don't have) — and the flow must visibly follow from what's on that list: a projector/internet available should get used for something a chalkboard can't do; an outdoor space available should get used for something a desk can't do; if the profile says to minimize hands-on activities, no flow stage may involve physical manipulation, building, moving materials, or walking around — use verbal, visual, or written stages instead. If you remove a resource from the list, the flow you'd write should visibly change.

Vary the shape of the lesson itself. Do not default to a fixed "Hook → Teach → Activity → Wrap-up" template every time — sometimes 3 stages fit better, sometimes 5; sometimes the right opening is a story, sometimes a demonstration, sometimes a challenge, sometimes a puzzle. Choose stage count, order, and names based on what this specific teacher profile would actually do, not a template.

Talking points are not a quiz round. Students should never feel checked, tested, or called on to produce a correct answer — that turns the lesson into an evaluation, which is exactly what this is not. Instead, each talking point is a moment where the teacher wonders something out loud WITH the class, mid-activity, the way a curious person thinks aloud ("Hmm, I wonder if...", "Notice that...", "What would happen if..."). If the class is quiet or unsure, the teacher's next move is to keep exploring together, not to mark the silence as a wrong answer or supply "the correct answer" like an answer key.`

  const userPrompt = `Write a Prep Sheet for:

Topic: ${topic}${subtopic ? `\nSubtopic (focus specifically on this): ${subtopic}` : ''}
Subject: ${subject}
Grade: ${grade}
Class size: ${totalStudents || 'unknown'}

${groundingContext}

${preferencesContext}
${weakTopicsContext}
${contextNoteLine}

Return ONLY valid JSON (no markdown, no extra text), matching this exact shape:
{
  "goal": "One sentence: what students should understand by the end of this lesson.",
  "materials": ["only items drawn from the teacher's actual classroom resources above (or generic locally-available items like slate/chalk/pebbles if no profile is on file) — nothing invented, nothing the flow doesn't actually use"],
  "concept": [
    { "text": "one syllabus-aligned idea, no fluff, one short sentence" },
    { "text": "..." },
    { "text": "..." }
  ],
  "flow": [
    { "label": "a stage name YOU choose to fit this teacher and this lesson (not always Hook/Teach/Activity/Wrap-up)", "minutes": 2, "detail": "direct instructions to the teacher for this stage — what THEY do and say, one to two short sentences" },
    { "label": "...", "minutes": 8, "detail": "..." },
    { "label": "...", "minutes": 10, "detail": "..." }
  ],
  "talkingPoints": [
    { "say": "something to wonder aloud WITH the class mid-activity — curious, informal, never a stop-and-answer quiz question", "keepGoing": "how to keep the moment alive if the class is quiet or unsure — never framed as marking their answer right or wrong" },
    { "say": "...", "keepGoing": "..." }
  ],
  "differentiation": {
    "ifStruggling": "a concrete simpler version of the SAME flow activity, using only the materials listed, for students who are lost",
    "ifAhead": "a concrete harder extension for students who finish early"
  },
  "watchFor": "the single biggest mistake or misconception to watch for while students do the flow activity"
}

Rules:
- "flow" has 3 to 5 stages — choose the count, order, and labels to fit this profile; do not always produce the same stage names or the same number of stages across different teachers/topics.
- Every flow stage's "detail" must only require items in "materials". No stage may need equipment not listed there.
- If the profile says to minimize hands-on activities, zero flow stages may involve physical manipulation, building, or moving around the room.
- Exactly 3 concept bullets. Each MUST include at least one (up to two) of these extra keys — every bullet is expandable in the UI, so never leave one with none: "deeperExplanation", "misconception", "realLifeExample", "visualDemo". Pick whichever genuinely fits that specific bullet best.
- "talkingPoints": exactly 2 or 3. Each "say" is woven into the flow's activity, phrased like the teacher wondering aloud with the class ("I wonder if...", "Notice how...", "What do you think happens if...") — never a direct interrogation like "What is X?" and never something that singles out one student to answer correctly. "keepGoing" is a way to sustain the moment, not a marking scheme.
- "watchFor" is specific to the flow's activity, not a restatement of a concept bullet's misconception.
- Never use the words "quiz", "test", "evaluate", "assess", "review", "recall", "prerequisite".
- Everything must be scannable in under 2 minutes total — short sentences, no paragraphs.`

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 })

  const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'EduTeach Prep Material',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.75,
      max_tokens: 1200,
    }),
  })

  if (!aiRes.ok) {
    const err = await aiRes.text()
    return NextResponse.json({ error: `AI error: ${err}` }, { status: 500 })
  }

  const aiData = await aiRes.json() as { choices: { message: { content: string } }[] }
  const raw = aiData.choices?.[0]?.message?.content ?? ''

  interface ConceptBullet {
    text: string
    deeperExplanation?: string
    misconception?: string
    realLifeExample?: string
    visualDemo?: string
    image?: { url: string } | null
  }
  interface LessonFlowStep {
    label: string
    minutes?: number
    detail: string
  }
  interface TalkingPoint {
    say: string
    keepGoing: string
  }
  interface SmartLesson {
    goal: string
    materials: string[]
    concept: ConceptBullet[]
    flow: LessonFlowStep[]
    talkingPoints: TalkingPoint[]
    differentiation: { ifStruggling: string; ifAhead: string }
    watchFor: string
  }

  let lesson: SmartLesson
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    lesson = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'AI returned malformed JSON', raw }, { status: 500 })
  }

  // One reference sketch per concept bullet, generated in parallel — deliberately a
  // simple black-and-white line diagram (not a colorful illustration) since the point
  // is for the teacher to copy it onto the blackboard, not to show students artwork.
  // generateIllustration never throws; a failed/timed-out sketch just resolves to
  // null so the bullet still renders fine with its text detail alone.
  const conceptWithImages = await Promise.all(
    (lesson.concept ?? []).map(async bullet => {
      const visualSubject = bullet.visualDemo?.trim() || bullet.text
      const lessonContext = `${topic}${subtopic ? ` — ${subtopic}` : ''} (Grade ${grade} ${subject})`
      const prompt = `A simple black-and-white line diagram, sketch-style, that a teacher could redraw by hand on a classroom blackboard with chalk. Depicts: ${visualSubject}. Context: ${lessonContext}. Bold clean outlines only, no shading, no color, no gradients, minimal or no text — this must be simple enough to copy by hand in under a minute.`
      const generated = await generateIllustration(prompt, { timeoutMs: 25_000 })
      return { ...bullet, image: generated ? { url: generated.url } : null }
    })
  )
  lesson = { ...lesson, concept: conceptWithImages }

  return NextResponse.json({
    topic,
    subtopic: subtopic || undefined,
    subject,
    grade,
    totalStudents,
    lesson,
  })
}
