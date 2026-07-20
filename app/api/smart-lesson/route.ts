import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getClientIp } from '@/lib/logger'
import { checkVisionRateLimit } from '@/lib/rate-limit'
import { personalizationEmphasis } from '@/lib/logic/teaching-profile'
import type { TeachingProfile } from '@/lib/types'

export const maxDuration = 60

// ── Low-resource activity bank + "story" template ───────────────────────────
// Curated by hand for government/NGO schools with minimal supplies. Kept as
// plain reference text (NOT a structured/queryable library) — the model picks
// and adapts an activity using its own judgment, this route never filters it.
// Ported 1:1 from backend/scripts/test_prep_material.py (validated there first
// across real Teaching Profile combinations before landing here).

const LOW_RESOURCE_PRINCIPLES = `This school has minimal resources. Every activity must work with:
- No printers, no projectors, no smart boards, no photocopies.
- Only chalk, blackboard, notebooks/paper, or everyday found objects: stones, sticks, bottle caps, old newspapers — or the students' own bodies as the "material".
- 5 to 15 minutes to run.
- A class of 30 to 60 students.
- Something a single teacher can set up and facilitate alone, with no prep the night before.`

const ACTIVITY_BANK = `Pick ONE activity for "interactiveExploration" and a DIFFERENT one for "challenge" from this bank — adapt the specifics (numbers, wording) to the actual topic, don't invent a new activity from scratch unless truly nothing here fits.

MOVEMENT (best for: place value, number line, comparing numbers, fractions, geometry)
- Human Number Machine: each student holds a digit card, the group arranges itself into a called number; swap two students and ask what changed.
- Living Number Line: a line taped/drawn on the floor; students stand where their number card belongs.
- Skip Counting Jump Path: numbers marked on the floor; students hop by 2s/5s/10s, or avoid a rule ("don't land on multiples of 4").
- Human Bar Graph: students physically stand in columns by their answer to a question; the class becomes the graph.
- Human Calculator: some students are numbers, one is an operator (+/-); they physically act out the calculation.
- Freeze Frame: students form a math symbol or relationship with their bodies (e.g. two numbers and a student as ">" between them).
- Human Building Blocks: students organize themselves to "build" a number the teacher calls out.
- Four Corners: label room corners Agree/Disagree/Not Sure; students move to the corner matching their view on a statement.
- Pattern Dance: teacher claps/steps a pattern, students continue it, then invent their own.
- Floor Is Lava (Math version): number cards on the floor; students may only step on ones matching a rule.

MYSTERY (best for: place value, number properties, estimation)
- Secret Number Interview: one student secretly picks a number; others ask only yes/no questions to guess it.
- Mystery Bag: students feel objects without looking and classify them (longer/shorter, more/less, shape).
- Missing Digit Mystery: a partly-hidden number with clues ("greater than 500, even, not divisible by 3") to deduce the missing digit.
- Error Detective: the teacher deliberately makes a mistake out loud; students catch and correct it.
- Guess My Rule: teacher gives a sequence (2, 4, 8, 16...); students guess the rule behind it.
- Classroom CSI: students search for planted "evidence" of an error somewhere in the room.

ROLE PLAY (best for: fractions, money, reading numbers, decimals)
- Fraction Pizza Shop: paper "pizzas"; the teacher orders a fraction amount, students cut and serve it correctly.
- Fraction Chef: students follow a recipe with fraction amounts; teacher gives an intentionally wrong measurement for them to catch.
- Math Restaurant: a menu with prices; students rotate through customer/waiter/cashier roles totalling bills and change.
- Decimal Money Market: a pretend market with decimal prices; students calculate change with play money.
- Become the Teacher: a student teaches the class for two minutes.
- Character Roleplay: a student becomes a themed character (e.g. "Captain Decimal") to narrate a concept.

BUILD & CREATE (best for: shapes, geometry, revision)
- Geometry Architects: using sticks/straws, groups build the strongest triangle or tallest structure, then discuss why it holds.
- Build the Tallest Tower: each correct answer earns a "block" (stone/bottle cap); groups race to build the tallest tower.
- Math Art Gallery: students create art from only basic shapes, then label every shape used.
- Build From Waste: build shapes or models from bottle caps, sticks, or scrap paper.

GAMES (best for: revision and quick assessment)
- Number Auction: students "bid" with play points on mystery number clue cards, then decide if it was worth it.
- Lucky Ticket: a few random students get a bonus challenge question.
- Spin a hand-drawn wheel: it decides HOW to answer (explain out loud / draw it / act it out / solve it).
- Giant Dice Adventure: roll a die, move that many steps on a chalk-drawn floor board; each square is a mini-challenge.

THINKING (best for: reflection and conceptual understanding — use sparingly if this teacher's profile says to minimize reflection)
- Teach the Teddy: a student explains the idea to a puppet/toy; if it "doesn't understand," they explain differently.
- Hot Seat: one student faces away from the board; the class gives clues about a written number/word for them to guess.
- Whisper Relay: a math statement is whispered student-to-student down a line; compare what arrives at the end.
- Comic Strip: students sketch the day's idea as a 3-4 panel comic on paper.`

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

// ── Tier 2: deterministic post-generation validation + targeted repair ──────
// Catches the rules a fast model tends to quietly drop under instruction
// competition. Pure code, zero added latency on the happy path — the repair
// call only fires when a real violation is found.

interface ParsedSmartLesson {
  planningNote?: string
  concept: string[]
  realLifeConnection: string
  interactiveExploration: { activity: string; steps: string[]; guidingQuestions: string[] }
  challenge: { activity: string; steps: string[] }
  materialsUsed: string[]
  levelSet: { returnToScenario: string; questions: string[]; extendPrompt?: string }
}

const BANNED_WORDS = ['quiz', 'test', 'evaluate', 'assess', 'review', 'recall', 'prerequisite']

// Silent fix — drops any materialsUsed entry that isn't actually in the
// profile's resource list, rather than failing or leaving an invented item in place.
function sanitizeLesson(lesson: ParsedSmartLesson, resources: string[]): ParsedSmartLesson {
  if (resources.length === 0 || !Array.isArray(lesson.materialsUsed)) return lesson
  const allowed = new Set(resources.map(r => r.trim().toLowerCase()))
  return { ...lesson, materialsUsed: lesson.materialsUsed.filter(m => allowed.has(m.trim().toLowerCase())) }
}

function validateLesson(lesson: ParsedSmartLesson, resources: string[]): string[] {
  const issues: string[] = []

  if (!Array.isArray(lesson.concept) || lesson.concept.length < 2 || lesson.concept.length > 3) {
    issues.push(`concept must have 2-3 bullets, got ${Array.isArray(lesson.concept) ? lesson.concept.length : 'missing'}`)
  }

  const exp = lesson.interactiveExploration ?? { activity: '', steps: [], guidingQuestions: [] }
  if (!Array.isArray(exp.steps) || exp.steps.length < 2 || exp.steps.length > 4) {
    issues.push(`interactiveExploration.steps must have 2-4 items, got ${Array.isArray(exp.steps) ? exp.steps.length : 'missing'}`)
  }
  if (!Array.isArray(exp.guidingQuestions) || exp.guidingQuestions.length < 1 || exp.guidingQuestions.length > 3) {
    issues.push(`interactiveExploration.guidingQuestions must have 1-3 items, got ${Array.isArray(exp.guidingQuestions) ? exp.guidingQuestions.length : 'missing'}`)
  }

  const chal = lesson.challenge ?? { activity: '', steps: [] }
  if (!Array.isArray(chal.steps) || chal.steps.length < 2 || chal.steps.length > 3) {
    issues.push(`challenge.steps must have 2-3 items, got ${Array.isArray(chal.steps) ? chal.steps.length : 'missing'}`)
  }

  if (exp.activity && chal.activity && exp.activity.trim().toLowerCase() === chal.activity.trim().toLowerCase()) {
    issues.push('interactiveExploration.activity and challenge.activity must be different activities')
  }

  const level = lesson.levelSet ?? { returnToScenario: '', questions: [] }
  if (!Array.isArray(level.questions) || level.questions.length < 2 || level.questions.length > 3) {
    issues.push(`levelSet.questions must have 2-3 items, got ${Array.isArray(level.questions) ? level.questions.length : 'missing'}`)
  }

  const textBlob = [
    ...(Array.isArray(lesson.concept) ? lesson.concept : []),
    lesson.realLifeConnection ?? '',
    exp.activity ?? '', ...(exp.steps ?? []), ...(exp.guidingQuestions ?? []),
    chal.activity ?? '', ...(chal.steps ?? []),
    level.returnToScenario ?? '', ...(level.questions ?? []), level.extendPrompt ?? '',
  ].join(' ').toLowerCase()
  for (const w of BANNED_WORDS) {
    if (new RegExp(`\\b${w}\\b`).test(textBlob)) issues.push(`contains banned word "${w}"`)
  }

  if (resources.length > 0 && Array.isArray(lesson.materialsUsed)) {
    const allowed = new Set(resources.map(r => r.trim().toLowerCase()))
    const invented = lesson.materialsUsed.filter(m => !allowed.has(m.trim().toLowerCase()))
    if (invented.length > 0) issues.push(`materialsUsed includes items not in the resource list: ${invented.join(', ')}`)
  }

  return issues
}

// Escalation — only reached when validateLesson() still finds real violations
// after sanitizeLesson()'s silent fixes. One small, targeted call: hands the
// same lesson back with the specific violations, asking for minimal edits —
// not a full regeneration. Falls back to the original lesson if the repair
// call itself fails or returns malformed JSON, rather than erroring the request.
async function repairLesson(lesson: ParsedSmartLesson, issues: string[], apiKey: string): Promise<ParsedSmartLesson> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'EduTeach Prep Material (repair)' },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are given a lesson JSON and a list of specific rule violations found in it. Return the SAME JSON with ONLY the minimal edits needed to fix each listed violation — do not rewrite fields that weren\'t flagged, do not change the chosen activities\' names, do not add commentary.' },
          { role: 'user', content: `Lesson JSON:\n${JSON.stringify(lesson)}\n\nViolations to fix:\n${issues.map(i => `- ${i}`).join('\n')}\n\nReturn ONLY the corrected JSON, same shape, no markdown.` },
        ],
        temperature: 0.3,
        max_tokens: 1200,
      }),
    })
    if (!res.ok) return lesson
    const data = await res.json() as { choices: { message: { content: string } }[] }
    const raw = data.choices?.[0]?.message?.content ?? ''
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return lesson
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
    ? `This topic comes from an actual textbook chapter that has already been analysed. Ground the concept bullets and the chosen activities' details in this REAL content instead of inventing generic material:
${grounding.chapterTitle ? `Chapter: "${grounding.chapterTitle}"${grounding.pageStart ? ` (pages ${grounding.pageStart}-${grounding.pageEnd ?? grounding.pageStart})` : ''}` : ''}
${grounding.exercises.length > 0 ? `\nActual exercises/activities in the textbook for this topic:\n${grounding.exercises.map(e => `- [${e.type}] ${e.text}`).join('\n')}` : ''}
${grounding.sidebars.length > 0 ? `\nActual sidebar notes/tips printed alongside this topic:\n${grounding.sidebars.map(s => `- ${s}`).join('\n')}` : ''}`
    : `No textbook extraction is available — use standard grade-appropriate concepts, nothing exotic.`

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
    ? `This class is weak on: ${weakTopics.join(', ')}. If it fits naturally, let the real-life connection or challenge also reinforce one of these — but never mention them explicitly or call it review.`
    : ''

  const contextNoteLine = contextNote?.trim()
    ? `Teacher's note for today: ${contextNote.trim()}`
    : ''

  const materialsRule = teachingProfile?.classroom?.resources?.length
    ? `the teacher's listed classroom resources above`
    : `chalk, blackboard, notebooks, or everyday found objects — nothing else`

  const systemPrompt = `You are an expert teacher-trainer designing a classroom-ready lesson for a resource-constrained school (government or NGO-run, India). A teacher opens this five minutes before class and follows it directly — every field must be concrete and short enough to scan in seconds, never an essay.

${LOW_RESOURCE_PRINCIPLES}

${ACTIVITY_BANK}

Pedagogy: never explain the concept and then test it. Instead, let understanding emerge through the activity and a few open questions — the teacher guides, the students discover. Questions inside an activity are wondered aloud WITH the class ("What changed?", "Is it still worth the same?"), never a stop-and-answer quiz. The lesson must open with a real-life scenario the class recognizes (not "today we will learn X"), move through ONE chosen activity to explore the idea, apply it again with a second, different chosen activity as a playful challenge, then return to the SAME opening scenario so students can now solve it — math must feel connected back to life, not abandoned once the activity ends.`

  const materialsExample = `Example of the materials boundary (illustration only, not this teacher's actual list):
  BAD: a step says "project the diagram" or "look it up online" — invents equipment not on the list.
  GOOD: a step says "draw the diagram on the chalkboard" or "students sketch it in their notebooks."`

  const reminderBlock = `REMINDER before you write the JSON — the rules most likely to get dropped:
- materialsUsed must contain nothing beyond ${materialsRule}. Do not invent a projector, printer, internet, or any item not on that list, even implicitly inside a step's wording.
- Never use the words "quiz", "test", "evaluate", "assess", "review", "recall", "prerequisite" anywhere in the output.
- concept is EXACTLY 2 or 3 bullets — not 1, not 4.`

  const userPrompt = `Write a Prep Sheet for:

Topic: ${topic}${subtopic ? `\nSubtopic (focus specifically on this): ${subtopic}` : ''}
Subject: ${subject}
Grade: ${grade}
Class size: ${totalStudents || 'unknown'}

${groundingContext}

${preferencesContext}
${weakTopicsContext}
${contextNoteLine}

${materialsExample}

${reminderBlock}

Return ONLY valid JSON (no markdown, no extra text), matching this exact shape:
{
  "planningNote": "1-2 sentences of YOUR OWN reasoning, written first, before anything else: given this profile, what angle/shape should this lesson take, and which two activities fit best and why? Internal use only — never shown to the teacher.",
  "concept": ["2 to 3 short bullets introducing the idea in the simplest possible way — no paragraphs"],
  "realLifeConnection": "A short (2-3 sentence) scenario from the child's world that makes them curious about this topic BEFORE any teaching happens — a specific, concrete situation, not an abstract prompt like 'today we will learn...'.",
  "interactiveExploration": {
    "activity": "the exact name of ONE activity chosen from the bank above",
    "steps": ["2 to 4 short steps describing exactly how this activity plays out for THIS topic — adapt the numbers/wording, don't just restate the generic activity"],
    "guidingQuestions": ["1 to 3 questions the teacher asks mid-activity so the concept emerges from discussion, e.g. 'What changed?', 'Is it still worth the same?'"]
  },
  "challenge": {
    "activity": "the exact name of a DIFFERENT activity chosen from the bank above, used to apply/stretch the idea",
    "steps": ["2 to 3 short steps for how this plays out for THIS topic"]
  },
  "materialsUsed": ["every item actually referenced across interactiveExploration/challenge steps — nothing invented, nothing unused"],
  "levelSet": {
    "returnToScenario": "One line bringing back the exact opening real-life scenario",
    "questions": ["2 to 3 short questions that let students show they can now read/write/compare/explain the idea, tied to that scenario"],
    "extendPrompt": "One open-ended line inviting students to think of another place this idea shows up in their own life"
  }
}

Rules:
- planningNote is written FIRST, before concept — think it through, then commit.
- concept: exactly 2 or 3 bullets, one short sentence each.
- realLifeConnection must be something a child in this context would actually recognize (a market, a bus, a cricket match, a school event) — not a generic word problem.
- interactiveExploration and challenge MUST use two DIFFERENT named activities from the bank, each adapted with topic-specific details (real numbers/words for this topic, not placeholders).
- Every step in interactiveExploration/challenge must only need ${materialsRule}. materialsUsed must list exactly what was actually used — nothing more.
- levelSet must reference the SAME scenario from realLifeConnection, not a new one.
- Never use the words "quiz", "test", "evaluate", "assess", "review", "recall", "prerequisite".
- Everything must be scannable in under 2 minutes total.`

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

  let lesson: ParsedSmartLesson
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    lesson = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'AI returned malformed JSON', raw }, { status: 500 })
  }

  const resources = teachingProfile?.classroom?.resources ?? []
  lesson = sanitizeLesson(lesson, resources)
  const issues = validateLesson(lesson, resources)
  if (issues.length > 0) {
    console.error('[smart-lesson] Tier 2 violations, repairing:', issues)
    lesson = sanitizeLesson(await repairLesson(lesson, issues, apiKey), resources)
  }

  return NextResponse.json({
    topic,
    subtopic: subtopic || undefined,
    subject,
    grade,
    totalStudents,
    lesson,
  })
}
