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

  const systemPrompt = `You are an expert classroom teacher and instructional designer, writing for Indian government school teachers and students. Many of them are not comfortable with advanced English, so use simple, everyday words and short sentences everywhere — never complex or academic vocabulary. Write roughly at a Grade 2-3 English reading level, no matter what grade the actual lesson is for. If a simpler word says the same thing, always use the simpler word.

You write an extremely concise prep sheet — a teacher reads it once, in about 15 minutes, and then teaches directly from it standing in front of the class. Every field must be usable in the classroom, not just readable at a desk.

Core belief: the teacher isn't trying to "engage" students — they're creating one concrete experience through which understanding naturally happens. Every activity must BE that experience (a scene, a task, something students physically or verbally do), not a description of teaching technique, and it must contain zero questions like "What is X?".

Two different teachers with different profiles teaching the same topic should produce prep sheets that feel designed by two different people — not the same activity with one noun swapped. The teacher's roles, goals, and preferred activities should change the actual shape of the activities and the story (what happens first, how it's framed, how it builds), not just decorate a fixed structure with a matching word. A storyteller-teacher's activities don't just "add a story" — they move through the topic AS a story. A debate-lover's activities move through it as a disagreement to resolve. A puzzle-lover's activities move through it as a mystery to crack.

Materials matter even though no materials list is shown to the teacher: every activity must only require what the teacher's classroom actually has (see preferences below) — never invent equipment they don't have. If the profile says to minimize hands-on activities, keep activities verbal, visual, or written instead of physical.

The Story Expansion is a genuine story, not a bulleted explanation. Write it the way a teacher would tell it out loud to the class — a beginning, a middle, an end — weaving all 3 concepts into one narrative a student could follow the way they'd follow a story being read to them. No lists, no headings, no "Concept 1:" labels inside it.

Challenges must feel like games, never like remedial work or a test. A student reading one should think "that sounds fun," never "I'm being assessed" or "I'm behind." Frame them as a dare, a mini competition, a puzzle, or a race against the clock — never as evaluation.

Real-Life Application must point at one specific, concrete situation the student will actually run into outside class — never a vague "this is useful in life" statement.`

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
  "concept": [
    { "text": "one syllabus-aligned idea, no fluff, one short sentence" },
    { "text": "..." },
    { "text": "..." }
  ],
  "activities": [
    { "title": "short, concrete activity name", "minutes": 10, "detail": "what the teacher actually does and says for concept 1 — a real-life activity every student can follow, using only the teacher's actual classroom resources" },
    { "title": "...", "minutes": 12, "detail": "... for concept 2 ..." },
    { "title": "...", "minutes": 10, "detail": "... for concept 3 ..." }
  ],
  "storyExpansion": "A 6-10 sentence story, told the way a teacher would tell it aloud, weaving all 3 concepts into one narrative — flowing prose only, no bullet points, no lists, just a story a student could follow like they're being told a tale.",
  "challenges": [
    { "title": "a playful, game-like name", "instructions": "what students do — framed as fun, never as a test" },
    { "title": "...", "instructions": "..." }
  ],
  "realLifeApplication": "2-3 sentences, speaking directly to students, naming one specific real situation outside class where they'll use this."
}

Rules:
- Exactly 3 concept bullets. Each MUST include at least one (up to two) of these extra keys — every bullet is expandable in the UI, so never leave one with none: "deeperExplanation", "misconception", "realLifeExample", "visualDemo". Pick whichever genuinely fits that specific bullet best.
- Exactly 3 activities, in the same order as the 3 concept bullets — one activity per concept. Each "detail" must only require items the teacher's classroom actually has (see preferences above). Minutes across all 3 activities should add up to a realistic single class period (roughly 30-40 minutes total).
- "storyExpansion" must read as flowing prose — no bullet points, no numbered lists, no headings inside it.
- Exactly 2 challenges. Never use the words "quiz", "test", "evaluate", "assess", "exam", "grade", "score" anywhere in the challenges — describe them only as games, dares, puzzles, or races.
- "realLifeApplication" must name one concrete scenario (a place, activity, or situation) — never a generic platitude like "this is useful in life."
- Everything must be readable by the teacher in about 15 minutes and directly usable in class — short sentences, no paragraphs longer than 3-4 sentences.
- Use simple, everyday English throughout — short sentences, common words a Grade 2-3 student would already know. No complex or academic vocabulary anywhere, even in the concept explanations.`

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
      max_tokens: 1400,
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
  interface LessonActivity {
    title: string
    minutes?: number
    detail: string
  }
  interface LessonChallenge {
    title: string
    instructions: string
  }
  interface SmartLesson {
    concept: ConceptBullet[]
    activities: LessonActivity[]
    storyExpansion: string
    challenges: LessonChallenge[]
    realLifeApplication: string
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
