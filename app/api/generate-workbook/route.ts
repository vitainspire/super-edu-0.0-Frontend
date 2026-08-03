import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase-admin'
import { gatherClassContext, gatherTopicContext } from '@/lib/prep/gather-context'
import { personalizationTierLine } from '@/lib/logic/teaching-profile'
import type { SmartLesson } from '@/lib/types'

// POST /api/generate-workbook
// The exam-practice sibling of /api/smart-lesson: same class inputs, grounded in
// the prep lessons that were actually taught. Covers ONE OR MORE topics, each a
// section with a configurable number of problems (rotating the 5 problem kinds).
export const maxDuration = 90

function difficultyForGrade(grade: string): number {
  const g = parseInt(String(grade).replace(/\D/g, ''), 10)
  if (!Number.isFinite(g)) return 2
  if (g <= 3) return 1
  if (g <= 5) return 2
  if (g <= 8) return 3
  return 4
}

// Condense a prep lesson so problems align with what was actually taught.
function summarisePrep(lesson: SmartLesson | null): string {
  if (!lesson) return ''
  const parts: string[] = []
  const concept = (lesson.concept ?? []).map(b => b.text).filter(Boolean)
  if (concept.length) parts.push(`Concepts taught: ${concept.join('; ')}.`)
  const exploreEg = (lesson.explore?.points ?? []).map(b => b.detail || b.text).filter(Boolean)[0]
  if (exploreEg) parts.push(`Example used: ${exploreEg}`)
  const challengeEg = (lesson.challenge?.points ?? []).map(b => b.detail || b.text).filter(Boolean)[0]
  if (challengeEg) parts.push(`Practised via: ${challengeEg}`)
  return parts.join(' ')
}

interface TopicInput { topic: string; subtopic?: string; topicDefinitionId?: string }

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  let body: {
    classId: string; subject: string; grade: string; teacherId?: string
    topics?: TopicInput[]; problemsPerTopic?: number; contextNote?: string
    blocks?: { kind: string; count: number; difficulty: string }[]
    // legacy single-topic support
    topic?: string; subtopic?: string; topicDefinitionId?: string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { classId, subject, grade, teacherId, contextNote } = body
  // Accept either a `topics` array or a single legacy topic.
  const topics: TopicInput[] = (body.topics?.length ? body.topics : (body.topic ? [{ topic: body.topic, subtopic: body.subtopic, topicDefinitionId: body.topicDefinitionId }] : []))
    .filter(t => t.topic?.trim())
  if (!classId || !subject || !grade || topics.length === 0) {
    return NextResponse.json({ error: 'classId, subject, grade and at least one topic are required' }, { status: 400 })
  }

  // Optional drag-and-drop composition: a per-section mix of problem kinds. When
  // absent, fall back to a plain per-topic count with the kinds auto-rotated.
  const KINDS = ['hook', 'story', 'peer', 'hidden', 'textbook']
  const blocks = (Array.isArray(body.blocks) ? body.blocks : [])
    .filter(b => b && KINDS.includes(b.kind) && Number(b.count) > 0)
    .map(b => ({ kind: b.kind, count: Math.max(1, Math.min(20, Math.round(Number(b.count)))), difficulty: ['easy', 'medium', 'hard', 'mixed'].includes(b.difficulty) ? b.difficulty : 'mixed' }))
  const perTopic = blocks.length
    ? Math.min(24, blocks.reduce((s, b) => s + b.count, 0))
    : Math.max(3, Math.min(12, Math.round(body.problemsPerTopic ?? 5)))

  // Context gathering is best-effort — if a DB query fails we still generate a
  // solid (if less personalised) workbook rather than erroring out.
  let cls = { totalStudents: 0, classInterests: [] as string[], weakTopics: [] as string[], teachingProfile: null as Awaited<ReturnType<typeof gatherClassContext>>['teachingProfile'] }
  let topicCtxs: Awaited<ReturnType<typeof gatherTopicContext>>[] = topics.map(t => ({ topic: t.topic, subtopic: t.subtopic, grounding: null, prepLesson: null }))
  try {
    const admin = createAdminClient()
    cls = await gatherClassContext(admin, { classId, teacherId })
    topicCtxs = await Promise.all(topics.map(t =>
      gatherTopicContext(admin, { classId, topic: t.topic.trim(), subtopic: t.subtopic?.trim() || undefined, topicDefinitionId: t.topicDefinitionId }),
    ))
  } catch (e) {
    console.error('[generate-workbook] context gathering failed, using minimal context:', e)
  }
  const difficulty = difficultyForGrade(grade)

  const interestsLine = cls.classInterests.length
    ? `This class is into: ${cls.classInterests.join(', ')}. Use at least TWO of these by name across the hook problems and/or the choices — concrete and local (a cricket score, a festival sweet, a market price), not generic.`
    : `No specific class interests on file — use everyday local Indian contexts (market, home, school ground).`

  const selectedNames = topics.map(t => t.topic.trim().toLowerCase())
  const embeddableWeak = cls.weakTopics.filter(w => !selectedNames.includes(w.toLowerCase()))
  const weakLine = embeddableWeak.length
    ? `The class is weak on: ${embeddableWeak.join(', ')}. In EACH section, embed one of these silently inside the "hidden" problem as a natural step of a current-topic task — NEVER label it revision, NEVER name it on the student page. Record which and how in teacherGuide.`
    : `No separate weak prior topics to embed — the "hidden" problem should still be a slightly harder stretch in a different format.`

  const profile = cls.teachingProfile
  const resources = profile?.classroom?.resources ?? []
  const language = profile?.classroom?.language ?? []
  const resourceLine = resources.length
    ? `Name real resources the classroom has — ${resources.join(', ')} — in the choice box. Never require anything not on this list.`
    : `Use only universally-available items (stones, chalk, dust, fingers, notebook) in the choice box.`
  const languageLine = language.length
    ? `Include ONE short instruction phrase in the classroom's home language (${language.join('/')}) with its English in brackets, as bilingualPhrase.`
    : `If a common Indian classroom language fits, add one short home-language phrase as bilingualPhrase; otherwise set it to null.`
  const styleLine = profile ? personalizationTierLine(profile.personalization) : ''
  const comfort = profile?.teacherIdentity?.comfortZones ?? []
  // comfortZones lists what the teacher IS comfortable with; if it has entries but
  // none mention groups, they're not comfortable running group work.
  const avoidsGroups = comfort.length > 0 && !comfort.some(c => /group/i.test(c))
  const pairLine = avoidsGroups
    ? `The teacher is not comfortable running group work — keep "peer" problems to quiet PAIR checking only (solve, compare, tick if you agree), no groups and no performing in front of the class.`
    : `"peer" problems are a quiet pair-check (solve, compare, tick if you agree) — never a forced presentation.`

  const classSize = profile?.classroom?.classSize
  const classSizeLine = classSize === '>40'
    ? `Large class (40+): keep problems runnable by one teacher with a big group — pair/whole-class checks, nothing needing 40 individual book-checks.`
    : classSize === '<20'
      ? `Small class (under 20): a little more individual work is fine alongside the pair checks.`
      : ''

  const LEVELS = [
    'Level 1 (simplest): concrete objects only, tiny numbers, one step, lots of drawing.',
    'Level 2: concrete + simple numbers, one or two steps, pictures encouraged.',
    'Level 3: mostly abstract with a concrete anchor, two-step problems.',
    'Level 4: abstract, multi-step reasoning, minimal scaffolding.',
  ]

  // Per-topic grounding + prep summaries for the prompt.
  const topicBlocks = topicCtxs.map((tc, i) => {
    const g = tc.grounding
    const prep = summarisePrep(tc.prepLesson)
    const lines = [
      `TOPIC ${i + 1}: "${tc.topic}"${tc.subtopic ? ` — ${tc.subtopic}` : ''}`,
      prep ? `  Taught in prep (ground problems in this): ${prep}` : `  No prep lesson found — use standard grade-appropriate practice.`,
      g?.chapterTitle ? `  Textbook: "${g.chapterTitle}"${g.pageStart ? ` (pages ${g.pageStart}-${g.pageEnd ?? g.pageStart})` : ''}.` : '',
      g?.exercises.length ? `  Copy the STYLE of these real exercises for the "textbook" problem:\n${g.exercises.slice(0, 4).map(e => `    - [${e.type}] ${e.text}`).join('\n')}` : '',
    ].filter(Boolean)
    return lines.join('\n')
  }).join('\n\n')

  const sectionSchema = topics.map((t, i) =>
    `    { "topic": "${t.topic.replace(/"/g, '\\"')}", "textbookRef": "p.__ · Exercise __ or empty", "problems": [ /* EXACTLY ${perTopic} items, see problem schema */ ] }${i < topics.length - 1 ? ',' : ''}`,
  ).join('\n')

  const KIND_DESC: Record<string, string> = {
    hook: "warm-up rooted in the class's interests/local life; concrete or drawing first",
    story: 'a word problem (price / score / objects) set in local life',
    peer: '"Solve with your partner. Compare. Tick if you agree." — a quiet pair check',
    hidden: 'a current-topic problem that quietly reuses a weak prior skill (NEVER labelled as review)',
    textbook: 'mimics the real textbook exercise format for exam readiness',
  }

  // Either the teacher's drag-and-drop composition, or an auto-rotation.
  const structureLine = blocks.length
    ? `For EACH section, produce EXACTLY this MIX of problems (total ${perTopic} per section):
${blocks.map(b => `- ${b.count} × "${b.kind}" (${KIND_DESC[b.kind]}) at ${b.difficulty === 'mixed' ? 'mixed easy/medium/hard' : `${b.difficulty}`} difficulty`).join('\n')}
INTERLEAVE them within the section so kinds and difficulties are not clustered; if any "hook" is present, make the FIRST problem a hook. Set each problem's "kind" and "difficulty" to match the block it came from (for a "mixed" block, spread easy/medium/hard across its problems).`
    : `For EACH section's ${perTopic} problems, use these problem KINDS and vary them (do not repeat one format back-to-back):
${KINDS.map(k => `- "${k}" — ${KIND_DESC[k]}`).join('\n')}
Make the FIRST problem of every section a "hook". When ${perTopic} ≥ 5, include at least one of EACH kind; distribute the rest across story/textbook/peer for variety.`

  const difficultyLine = blocks.length
    ? `DIFFICULTY — honour the difficulty each block specified above. Where a block is "mixed", spread easy/medium/hard across its problems, and overall INTERLEAVE difficulties within the section (never all easy first, hard last).`
    : `DIFFICULTY — tag every problem "easy", "medium", or "hard", and MIX them HOMOGENEOUSLY within each section: interleave the levels evenly (e.g. easy, medium, easy, hard, medium…), never all the easy ones first and hard ones last. Roughly one-third each across the section so a struggling student and a strong student both stay engaged the whole way down.`

  const prompt =
`You are generating a PRINTABLE, black-and-white, low-resource EXAM-PRACTICE WORKBOOK for Indian government/NGO elementary students. NOT identical drills — a varied, mastery-focused practice book.

Subject: ${subject} | Grade: ${grade} | Difficulty: ${LEVELS[difficulty - 1]}
${contextNote ? `Teacher's note: ${contextNote}` : ''}

This workbook covers ${topics.length} topic${topics.length > 1 ? 's' : ''}, each its own SECTION with EXACTLY ${perTopic} problems:

${topicBlocks}

${structureLine}

EVERY problem must be FUN and THOUGHT-PROVOKING — a little puzzle, a real scenario, a "what would happen if…", a spot-the-trick, a challenge to a partner — never a dry "solve: 5 + 3". A child should WANT to try it. Use the class's interests and local life to make each one feel real.

${difficultyLine}

${interestsLine}
${weakLine}
${resourceLine}
${languageLine}
${pairLine}
${classSizeLine}
${styleLine ? `Teacher style: ${styleLine}` : ''}

Rules:
- Every problem is short, clear, Grade ${grade}-appropriate, solvable with ${resources.length ? resources.join('/') : 'stones, chalk, dust, fingers, or a notebook'}.
- Numbers must be correct and consistent (₹ for money, never mix currencies). Fill each problem's "answer" (teacher-only) with the worked answer.
- Never use the words "quiz", "test", "revision", "review", "weak", "prerequisite" in student-facing text.
- ONE shared choiceBox, reflect, and homeChoice for the whole workbook (not per section).
- choiceBox: a real either/or (e.g. "Choose 3 easy (★) OR 2 hard (★★)", or a resource choice).
- reflect: a 30-second partner reflection on what was EASIEST or most interesting — never on mistakes.
- homeChoice: A) notice/find something real at home, B) invent a problem for a partner tomorrow.
- teacherGuide.weakTopicsTargeted + hiddenNote: name the hidden weak topic(s) and which problems carry them — teacher-only, never shown to students.

Return ONLY valid JSON (no markdown, no extra text) in EXACTLY this shape:
{
  "title": "short workbook title covering the topics",
  "difficulty": ${difficulty},
  "bilingualPhrase": { "phrase": "home-language phrase", "english": "its English" } or null,
  "sections": [
${sectionSchema}
  ],
  "choiceBox": "…",
  "reflect": "…",
  "homeChoice": { "a": "…", "b": "…" },
  "teacherGuide": { "weakTopicsTargeted": ["…"], "hiddenNote": "…" }
}
Each problem object is: { "kind": "hook|story|peer|hidden|textbook", "difficulty": "easy|medium|hard", "label": "short label", "prompt": "…", "workLines": 3, "answer": "teacher-only worked answer" }.
Ensure every section's "problems" array has EXACTLY ${perTopic} items with difficulties interleaved (not sorted), and there is one section per topic, in the given order.`

  try {
    // Scale the token budget + timeout to the workbook size (topics × problems),
    // capped to the route's 90 s budget, so bigger books don't truncate or time out.
    const totalProblems = topics.length * perTopic
    const maxTokens = Math.min(14000, 2000 + totalProblems * 240)
    const text = await callAI([{ role: 'user', content: prompt }], { maxTokens, timeoutMs: 80_000 })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    const workbook = JSON.parse(match?.[0] ?? cleaned)
    if (!workbook || !Array.isArray(workbook.sections) || workbook.sections.length === 0) {
      throw new Error('Model returned no sections')
    }
    return NextResponse.json({
      subject,
      grade,
      topics: topics.map(t => t.topic),
      groundedInPrep: topicCtxs.some(tc => Boolean(tc.prepLesson)),
      workbook,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[generate-workbook] generation failed:', message)
    return NextResponse.json({ error: `Failed to generate workbook: ${message}` }, { status: 500 })
  }
}
