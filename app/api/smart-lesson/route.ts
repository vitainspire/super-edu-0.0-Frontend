import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchTextbookGrounding, textbookPromptBlock } from '@/lib/prep/textbook-grounding'
import { getClientIp } from '@/lib/logger'
import { checkVisionRateLimit } from '@/lib/rate-limit'
import { generateIllustration, storeIllustration, illustrationKey } from '@/lib/ai'
import { personalizationTierLine } from '@/lib/logic/teaching-profile'
import { resolveSubjectModule } from '@/lib/prep/subject-prompts'
import { engagementLevelGuidance } from '@/lib/prompt-fragments'
import { fetchPreviousTopic } from '@/lib/refresher-topic'
import type { TeachingProfile } from '@/lib/types'

// Raised back up from 60s: after the main text call the route generates up to 3
// board sketches (Concept always, plus Explore and one more where useful) — run
// in PARALLEL so they cost ~one image of wall-time — and (rarely) a Tier 2 repair
// call on top of that.
export const maxDuration = 90

// ── Low-resource activity bank + "v2" template ──────────────────────────────
// Curated by hand for government/NGO schools with minimal supplies. Kept as
// plain reference text (NOT a structured/queryable library) — the model picks
// and adapts an activity using its own judgment, this route never filters it.
// The activity bank + pedagogy are now SUBJECT-ROUTED (see lib/prep/subject-
// prompts.ts): the single generic bank was really a math bank, so non-math
// subjects were forced to improvise around math activities. Only "challenge"
// draws from the bank — "explore" is deliberately free-form.

const LOW_RESOURCE_PRINCIPLES = `This school has minimal resources. Every activity must work with:
- No printers, no projectors, no smart boards, no photocopies, no internet, no electricity dependence.
- Only chalk, blackboard, notebooks/paper, or everyday found objects: stones, sticks, bottle caps, old newspapers — or the students' own bodies as the "material".
- 5 to 15 minutes to run, start to finish, including giving instructions.
- A class of 30 to 60 students on fixed benches. Students CAN stand, move to the board, or step into an aisle briefly, but do NOT assume desks/benches can be permanently rearranged into group pods or stations.
- Something a single teacher can set up and facilitate alone, with no prep the night before.

If an activity from the bank below normally uses something not on this list (printed cards, cut-outs, props), adapt it to run on chalk/paper/found objects instead of dropping it.`

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

// ── Rotation: the last few Challenge activities generated for this class, so
// the prompt can be told to pick something different instead of defaulting to
// the same one or two activities every time.
async function fetchRecentChallengeActivities(admin: ReturnType<typeof createAdminClient>, classId: string): Promise<string[]> {
  try {
    const { data: rows } = await admin
      .from('prep_materials')
      .select('lesson, created_at')
      .eq('class_id', classId)
      .order('created_at', { ascending: false })
      .limit(5)
    const activities = (rows ?? [])
      .map((r: { lesson: { challenge?: { activity?: unknown } } }) => r.lesson?.challenge?.activity)
      // Older/repaired rows can have a non-string activity; keep only real strings
      // so downstream .trim() comparisons never blow up.
      .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    return [...new Set(activities)]
  } catch {
    return []
  }
}

// ── JSON salvage ────────────────────────────────────────────────────────────
// gemini-2.5-flash, even in JSON mode, frequently drops the comma between two
// adjacent array/object elements (the parse error is always "Expected ',' or
// ']' after array element"). This walks the raw text tracking string state
// (respecting \" escapes) and inserts the missing comma ONLY at genuine
// structural boundaries — after a value-closing }, ], or " that is immediately
// followed (past whitespace) by the start of a new value { [ or ". Because it
// never edits inside a string literal, a detail like "use } and { on the board"
// is left untouched. Tried before re-calling the model, so most malformed
// responses parse on the first attempt instead of costing a retry.
function insertMissingCommas(s: string): string {
  let out = ''
  let inStr = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    out += c
    if (c === '"' && s[i - 1] !== '\\') { inStr = !inStr; }
    if (inStr) continue
    if (c === '}' || c === ']' || c === '"') {
      let j = i + 1
      while (j < s.length && /\s/.test(s[j])) j++
      const next = s[j]
      // A value-closing quote followed by another quote means "value" "nextKey"
      // (missing comma). A quote followed by ':' is a key — leave it. { [ after
      // a closing token likewise starts a new sibling element.
      if (next === '{' || next === '[' || next === '"') out += ','
    }
  }
  return out
}

// Strip a trailing comma before a closing } or ] — another malformation the
// model occasionally emits (`[a, b, ]`). Runs only on already-failed JSON.
function stripTrailingCommas(s: string): string {
  return s.replace(/,(\s*[}\]])/g, '$1')
}

// A parse only counts if the result is actually lesson-SHAPED — the core
// containers must be present and the right kind. Without this, a repair that
// returns valid-but-empty JSON ({} or a wrong structure) would slip through as
// "success", and Tier 2 would then try to fabricate a whole lesson from the
// empty shell (producing a degraded sheet) instead of a clean retry.
// Content-level problems (bullet counts, a missing activity) are left to
// validateLesson/repairLesson — this only rejects the not-a-lesson case.
function looksLikeLesson(o: unknown): o is ParsedSmartLesson {
  if (!o || typeof o !== 'object') return false
  const l = o as Record<string, unknown>
  return Array.isArray(l.concept) &&
    typeof l.explore === 'object' && l.explore !== null &&
    typeof l.challenge === 'object' && l.challenge !== null &&
    typeof l.levelSet === 'object' && l.levelSet !== null
}

function tryParseLesson(raw: string): ParsedSmartLesson | null {
  let cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  // If the model wrapped the JSON in prose ("Here is the lesson: { … }"), keep
  // only the outermost object.
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) cleaned = objMatch[0]
  // Try progressively more aggressive deterministic repairs, cheapest first.
  const candidates = [
    cleaned,
    insertMissingCommas(cleaned),
    stripTrailingCommas(cleaned),
    stripTrailingCommas(insertMissingCommas(cleaned)),
  ]
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c)
      if (looksLikeLesson(parsed)) return parsed
    } catch { /* try next candidate */ }
  }
  return null
}

// Last-resort salvage: hand the raw, unparseable text to the model and ask ONLY
// for valid JSON back. Fires only after every deterministic attempt AND the
// whole-call retries have failed — so it's rare and cheap, but it catches
// malformations the regex repairs don't (unescaped quotes/newlines inside a
// string, etc.) instead of surfacing "malformed JSON" to the teacher.
async function repairRawJson(raw: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'EduTeach Prep Material (json-fix)' },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are given text that is meant to be a single JSON object but has syntax errors. Return the SAME content as valid, parseable JSON — fix only the syntax (quotes, commas, escaping, braces). Do not change, translate, add, or remove any of the actual content. Return ONLY the JSON, no markdown.' },
          { role: 'user', content: raw },
        ],
        temperature: 0,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) return ''
    const data = await res.json() as { choices: { message: { content: string } }[] }
    return data.choices?.[0]?.message?.content ?? ''
  } catch {
    return ''
  }
}

// ── Tier 2: deterministic post-generation validation + targeted repair ──────
// Catches the rules a fast model tends to quietly drop under instruction
// competition. Pure code, zero added latency on the happy path — the repair
// call only fires when a real violation is found.

interface ExpandableBullet {
  text: string
  detail?: string
  image?: { url: string } | null
}

interface ParsedSmartLesson {
  planningNote?: string
  objective?: string
  successCriteria?: string[]
  previousTopicRefresher?: { previousTopic: string; recap: ExpandableBullet[] } | null
  concept: ExpandableBullet[]
  explore: { points: ExpandableBullet[]; imageFocus?: string }
  challenge: { activity: string; points: ExpandableBullet[] }
  watchFor?: ExpandableBullet[]
  sectionWatch?: {
    refresher?: ExpandableBullet | null
    concept?: ExpandableBullet | null
    explore?: ExpandableBullet | null
    challenge?: ExpandableBullet | null
    levelSet?: ExpandableBullet | null
  }
  materialsUsed: string[]
  levelSet: { points: ExpandableBullet[] }
  textbookImages?: { section: string; imageId: string }[]
  diagrams?: { section: string; focus: string }[]
  timings?: { refresher?: number; concept?: number; explore?: number; challenge?: number; levelSet?: number }
}

const BANNED_WORDS = ['quiz', 'test', 'evaluate', 'assess', 'review', 'recall', 'prerequisite']

// Silent fix — drops any materialsUsed entry that isn't actually in the
// profile's resource list, rather than failing or leaving an invented item in place.
function sanitizeLesson(lesson: ParsedSmartLesson, resources: string[]): ParsedSmartLesson {
  if (resources.length === 0 || !Array.isArray(lesson.materialsUsed)) return lesson
  const allowed = new Set(resources.map(r => r.trim().toLowerCase()))
  return { ...lesson, materialsUsed: lesson.materialsUsed.filter(m => allowed.has(m.trim().toLowerCase())) }
}

function bulletsOk(bullets: unknown): bullets is ExpandableBullet[] {
  return Array.isArray(bullets) && bullets.length >= 1 && bullets.length <= 3 &&
    bullets.every(b => b && typeof b === 'object' && typeof (b as ExpandableBullet).text === 'string' && (b as ExpandableBullet).text.length > 0)
}

function validateLesson(lesson: ParsedSmartLesson, resources: string[], avoidActivities: string[]): string[] {
  const issues: string[] = []

  if (lesson.previousTopicRefresher != null && !bulletsOk(lesson.previousTopicRefresher.recap)) {
    issues.push('previousTopicRefresher.recap must be 1-3 {text, detail?} bullets (or the whole field null)')
  }

  if (!bulletsOk(lesson.concept)) {
    issues.push(`concept must be 1-3 {text, detail?} bullets, got ${JSON.stringify(lesson.concept)}`)
  }

  const explore = lesson.explore ?? { points: [] }
  if (!bulletsOk(explore.points)) issues.push('explore.points must be 1-3 {text, detail?} bullets')

  const challenge = lesson.challenge ?? { activity: '', points: [] }
  const activity = typeof challenge.activity === 'string' ? challenge.activity : ''
  if (!activity) issues.push('challenge.activity is missing')
  if (!bulletsOk(challenge.points)) issues.push('challenge.points must be 1-3 {text, detail?} bullets')
  if (activity && avoidActivities.some(a => typeof a === 'string' && a.trim().toLowerCase() === activity.trim().toLowerCase())) {
    issues.push(`challenge.activity "${activity}" was used recently for this class and must be different`)
  }

  const level = lesson.levelSet ?? { points: [] }
  if (!bulletsOk(level.points)) issues.push('levelSet.points must be 1-3 {text, detail?} bullets')

  const textBlob = JSON.stringify(lesson).toLowerCase()
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
          { role: 'system', content: 'You are given a lesson JSON and a list of specific rule violations found in it. Return the SAME JSON with ONLY the minimal edits needed to fix each listed violation — do not rewrite fields that weren\'t flagged, do not change the chosen activity name unless it was flagged as invalid, do not add commentary.' },
          { role: 'user', content: `Lesson JSON:\n${JSON.stringify(lesson)}\n\nViolations to fix:\n${issues.map(i => `- ${i}`).join('\n')}\n\nReturn ONLY the corrected JSON, same shape, no markdown.` },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    })
    if (!res.ok) return lesson
    const data = await res.json() as { choices: { message: { content: string } }[] }
    const raw = data.choices?.[0]?.message?.content ?? ''
    return tryParseLesson(raw) ?? lesson
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

  // 1. Active students in this class → class size + the interests the class
  // actually shares, so Explore/Refresher examples can be built around what
  // these specific kids care about (cricket, a local festival, a cartoon…),
  // not generic filler. We rank interests by how many students list them so the
  // lesson leans on what the WHOLE class recognizes, not one child's niche.
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

  // 2. Teacher's saved Teaching Profile, if any (set up via /profile/teaching)
  const teachingProfile: TeachingProfile | null = teacherId
    ? (await admin.from('teachers').select('teaching_profile').eq('id', teacherId).maybeSingle()).data?.teaching_profile ?? null
    : null

  // 3. Silent gap-awareness: weak prior topics, used only to nudge which real-life
  // angle Explore takes — never surfaced as its own section or "bridge note".
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

  // 4. Grounding — two sources, and they answer different questions.
  //    fetchGrounding gives the ontology's summary (exercises, sidebars, pages).
  //    fetchTextbookGrounding gives the book's own words and its illustrations,
  //    which is what stops the lesson teaching the right topic with invented
  //    content. Null when nothing matched confidently; see textbook-grounding.
  const grounding = topicDefinitionId ? await fetchGrounding(admin, topicDefinitionId) : null
  // The class is the only thing the request names that knows its school, and
  // textbook content is scoped per school.
  const { data: classRow } = await admin
    .from('classes').select('school_id').eq('id', classId).maybeSingle()
  const textbook = await fetchTextbookGrounding(admin, {
    schoolId: classRow?.school_id ?? undefined,
    grade: String(grade), subject, topic, subtopic,
  })

  // 5. Previous topic (for the refresher) + recent Challenge activities (for rotation)
  const previousTopic = await fetchPreviousTopic(admin, classId, topic, topicDefinitionId, subtopic, subject)
  const avoidActivities = await fetchRecentChallengeActivities(admin, classId)

  // 6. Build the prompt
  const groundingContext = grounding
    ? `This topic comes from an actual textbook chapter that has already been analysed. Ground the concept bullets and Explore/Challenge in this REAL content instead of inventing generic material:
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
    // Graded style cue — preserves the always > often > never intensity the
    // teacher set, instead of flattening it to a single "lean into" list.
    const styleLine = personalizationTierLine(teachingProfile.personalization)

    const lines = [
      roles.length > 0 && `Sees themselves as: ${roles.join(', ')}.`,
      goals.length > 0 && `Wants students to: ${goals.join(', ')}.`,
      preferredActivities.length > 0 && `Enjoys using: ${preferredActivities.join(', ')}.`,
      comfortZones.length > 0 && `Comfortable with: ${comfortZones.join(', ')}.`,
      classSize && `Typical class size: ${classSize}.`,
      resources.length > 0 && `Classroom has: ${resources.join(', ')}.`,
      language.length > 0 && `Classroom language: ${language.join(', ')}.`,
      styleLine,
    ].filter(Boolean).join(' ')

    const resourceRule = resources.length > 0
      ? `"materials" must be chosen ONLY from this exact list: ${resources.join(', ')} — never add chalk, slate, paper, or any other item not on this list, even if it seems like a harmless default.`
      : `No resources were listed for this classroom — use only the single most generic, universally-available item (e.g. chalkboard) and nothing else.`

    // classSize → a concrete facilitation rule (not just a stated number).
    const classSizeRule =
      classSize === '>40'
        ? `LARGE CLASS (40+): favour whole-class and small-group formats, choral/hands-up responses, and pair work over many individual turns. Every step must be runnable by ONE teacher with a big group — no step that needs checking 40 notebooks one by one.`
      : classSize === '<20'
        ? `SMALL CLASS (under 20): alongside the pair work you can use more individual turns and closer one-to-one moments.`
      : classSize === '20-40'
        ? `MEDIUM CLASS (20–40): mix pair work with a few individual turns; keep grouping simple to manage.`
      : ''

    // Resolve the SDT "always pair/group" rule against a teacher who isn't
    // comfortable running group discussions — keep collaboration to quiet pairs.
    const comfortHasGroups = comfortZones.some(c => /group/i.test(c))
    const comfortPairRule = comfortZones.length > 0 && !comfortHasGroups
      ? `This teacher is NOT comfortable running group discussions. Keep ALL collaboration to QUIET PAIR work (turn-and-tell with one partner). Do NOT require whole-class group discussions or students presenting in front of the class — the mandatory pairing must stay low-key and easy to manage.`
      : ''

    // Bias the Challenge activity toward the teacher's preferred formats.
    const preferredBias = preferredActivities.length > 0
      ? `When picking the Challenge activity from the bank, prefer the one that best resembles the teacher's preferred activities (${preferredActivities.join(', ')}) wherever a sensible match exists — without breaking the rotation/avoid-list rule.`
      : ''

    return `This teacher's profile — ${lines} Explore and Challenge MUST reflect this profile, not just decorate a fixed structure. ${resourceRule} ${classSizeRule} ${comfortPairRule} ${preferredBias} Never suggest something outside the teacher's comfort zone.`
  })()

  const weakTopicsContext = weakTopics.length > 0
    ? `This class is weak on: ${weakTopics.join(', ')}. If it fits naturally, let Explore or Challenge also reinforce one of these — but never mention them explicitly or call it review.`
    : ''

  const contextNoteLine = contextNote?.trim()
    ? `Teacher's note for today: ${contextNote.trim()}`
    : ''

  const materialsRule = teachingProfile?.classroom?.resources?.length
    ? `the teacher's listed classroom resources above`
    : `chalk, blackboard, notebooks, or everyday found objects — nothing else`

  // What this specific class is into — the single biggest lever for engagement.
  // Woven through Explore, Challenge, AND the refresher so examples land as
  // "our cricket match / our Sankranti kites", not generic textbook scenarios.
  const interestsLine = classInterests.length > 0
    ? `THIS CLASS IS INTO: ${classInterests.join(', ')}. This is your strongest engagement lever — build the Explore scenario, the refresher's examples, and (where natural) the Challenge around what these kids actually love. Make the examples situation-specific and concrete ("counting runs in our cricket match", "sharing sweets at Diwali", "kites at Sankranti"), not generic. Rotate which interest you lean on rather than forcing all of them in.`
    : ''

  const previousTopicLine = previousTopic
    ? `The topic this class covered just before this one was: "${previousTopic}". Include previousTopicRefresher ONLY IF a skill from "${previousTopic}" is genuinely used in today's topic ("${topic}") — i.e. a student who forgot it would actually struggle today. If the two topics are unrelated (different strands that merely sit near each other in the syllabus), set "previousTopicRefresher" to null and omit the "refresher" timing. Do NOT manufacture a bridge between unrelated topics — a lesson with no refresher is much better than a recap that pretends one topic leads into another.
When you DO include it: open it as a PAIR-START STUDENT ACTION — partners DO something together (hold, split, draw, guess with objects) that quietly re-uses the old skill BEFORE anyone explains, ending with a one-line bridge into today. Never a teacher quiz-question. Make each recap bullet a SITUATION-SPECIFIC example, not an abstract restatement — set it in something this class cares about (see their interests above) so it reads like "partners split the scoreboard runs in half" rather than "remember place value".`
    : `No topic that leads into this one is on record for this class. Set "previousTopicRefresher" to null and omit the "refresher" timing.`

  const avoidLine = avoidActivities.length > 0
    ? `Do NOT pick any of these activities for the Challenge — they were used recently for this class and must not repeat: ${avoidActivities.join(', ')}. Pick a genuinely DIFFERENT one from the bank below.`
    : ''

  const bulletShape = `{"text": "a compact, informative headline — about 6 to 12 words that actually convey the point at a glance. Not a bare fragment ('Rounding'), not a full multi-clause sentence — a scannable line a teacher instantly understands (e.g. 'Round each number to the nearest ten first', 'The class turns into a village market')", "detail": "the deeper explanation of THIS bullet — one or two full sentences: the how/why, an example, what to watch for. The headline gives the point; detail adds the substance behind it. Include detail on almost every bullet, and never just reword the headline — \"detail\" must add information the headline didn't already give."}`

  // Route to the subject-appropriate activity bank + pedagogy (Math / Language /
  // EVS / generic). This is the fix for "great lessons for one subject, weak for
  // another": the bank the model reasons over now matches the subject.
  const subjectModule = resolveSubjectModule(subject)
  // Calibrate how the whole lesson is pitched to the grade's engagement level.
  const engagementGuidance = engagementLevelGuidance(grade)

  // The engagement backbone — Self-Determination Theory (autonomy, competence,
  // relatedness) turned into structural rules, so students take part because
  // they WANT to, not because they're told to.
  const sdtEngagement = `ENGAGEMENT — design for SELF-DRIVEN participation (Self-Determination Theory). Students engage when three needs are met by the STRUCTURE of the activity itself, not by rewards or pressure:
- AUTONOMY: give real, small choices ("solve with stones OR draw it in the dust"; pick your role). Never use controlling language ("you must", "copy this down").
- COMPETENCE: pitch each task just hard enough to need thought but easy enough to succeed WITH A PARTNER; make progress visible and never label anyone as behind.
- RELATEDNESS: ground everything in THIS class's real world (their interests, the local market / festival / cricket match, home and community) and let them do it WITH a partner, not alone under the teacher's eye.
Shape the whole lesson as one motivating cycle: a CURIOSITY HOOK (a local puzzle they actually want to solve) → a PAIR-FIRST attempt → the concept emerges from what they tried → PLAY the challenge → a quick REFLECT ("what worked?") → ACT (apply it to a real textbook-style problem). Coercion, public shaming, and rote copying destroy motivation — design so that joining in is the EASIEST and most rewarding thing a student can do.`

  const systemPrompt = `You are an expert teacher-trainer designing a classroom-ready lesson for a resource-constrained school (government or NGO-run, India). A teacher opens this five minutes before class and follows it directly.

${LOW_RESOURCE_PRINCIPLES}

${engagementGuidance}

${sdtEngagement}

${subjectModule.bank}

IMPORTANT — the bank above is used differently in this template than its own header text says:
- "explore" is NOT limited to the bank. Invent a vivid, highly creative real-life scenario and activity that fits this specific topic and teacher profile — it should feel like a mini-story the class steps into, not a generic exercise. Still respect the low-resource rules and the profile's comfort zones.
- "challenge" MUST pick exactly one activity, by its exact name, from the bank above — this is the one structured, rotated part of the lesson. Never reuse Explore's activity for the Challenge.

If instructions below conflict, resolve in this order: (1) the low-resource constraints and any teacher materials list always win, (2) the teacher's profile and comfort zones, (3) everything else.

FORMAT — this is strict and applies to EVERY section:
- The ENTIRE lesson is bullet points. There are no paragraphs anywhere. Every field of content is an array of ${bulletShape}.
- Each bullet's "text" is a compact, informative headline — about 6 to 12 words that convey the actual point at a glance. Not a cryptic 2-3 word fragment, and not a full multi-clause sentence — a line a teacher reads and immediately gets.
- The real explanation ALWAYS goes in that bullet's "detail" (one or two sentences), never in "text". The teacher reads the headline to scan, then taps "+" to get the detail.
- If a "text" line reads like a full sentence, it is too long — cut it down to the headline and move the sentence into "detail".

${subjectModule.pedagogy}`

  const userPrompt = `Write a Prep Sheet for:

Topic: ${topic}${subtopic ? `\nSubtopic (focus specifically on this): ${subtopic}` : ''}
Subject: ${subject}
Grade: ${grade}
Class size: ${totalStudents || 'unknown'}

${interestsLine}

${previousTopicLine}

${textbook ? textbookPromptBlock(textbook) : ''}

${groundingContext}

${preferencesContext}
${weakTopicsContext}
${contextNoteLine}
${avoidLine}

This is a TEACHER'S prep sheet, not a student handout. The visible headline says WHAT happens; every "detail" must tell the teacher HOW to run it — what to actually SAY (a short script line in quotes), how long to wait, whether students answer aloud/in pairs/by hands, the answer the teacher should quietly listen for (as a check, never announced to students as a verdict), and what to do if they struggle. A first-time teacher should be able to follow it without improvising.

Return ONLY valid JSON (no markdown, no extra text), matching this exact shape:
{
  "planningNote": "1-2 sentences of YOUR OWN reasoning, written first: given this class's interests, the teacher's profile, and the previous topic — which of their interests will Explore (and the refresher) be built around, what real-life scene does it become, and which Challenge activity fits (and isn't in the avoid-list)?",
  "objective": "a SINGLE short headline of the goal — 4 to 8 words, starting with a verb, NOT a full 'Students will be able to…' sentence and NOT a list. Good: 'Add two 2-digit numbers mentally'. Bad: 'Students will be able to mentally add two-digit numbers using strategies.'",
  "previousTopicRefresher": {
    "previousTopic": "the exact previous topic name given above, or null if none",
    "recap": [${bulletShape}, "... up to 3 total — a PAIR-START student action, NOT a teacher question. First bullet: partners DO something together (hold, split, draw, guess) that quietly re-uses yesterday's skill; 'detail' gives the exact partner instruction and how they show their answer (fingers / stones / dust). Later bullets bridge into today. Never call it review — students should just feel they're playing, not being tested (e.g. text: 'Partners split one drawn ladoo into halves or quarters', detail: 'Say: \"One of you draws the ladoo, the other decides halves or quarters — show me with a line.\" They write 1/2 and 1/4; you only name it aloud after they try.')"]
  },
  "concept": [${bulletShape}, "... up to 3 total — DISCOVERED, not lectured. Students find the idea in pairs BEFORE you formalize it: each 'detail' gives a peer task (Partner A does X, Partner B does Y, then switch) using real numbers, and only the LAST detail has the teacher name/confirm the idea on the board. Never open a concept bullet with 'Explain that…' — open with what the students do."],
  "explore": {
    "points": [${bulletShape}, "... EXACTLY 3 bullets in this order. (1) CURIOSITY HOOK — a vivid local scene built from the class's TOP interests that ends in ONE open-ended question students can't resist; 'text' is the scene, 'detail' is the teacher's opening SCRIPT in quotes ending with that question, plus one short instruction phrase in the classroom's home language (with its English in brackets). (2) PAIR-FIRST — students turn to a partner and try a guess BEFORE any explanation; 'detail' gives the exact prompt to say, the wait time, and that they answer in pairs (never cold-called alone). (3) The activity itself carrying ONE real micro-choice; 'detail' states the choice in the teacher's words (e.g. 'solve it with the stones OR draw it in the dust — your table decides') and how the concept emerges from what they tried."],
    "imageFocus": "one short phrase describing the single most useful thing to sketch on the board for this Explore activity"
  },
  "challenge": {
    "activity": "the exact name of ONE activity from the bank above, not Explore's activity, not in the avoid-list",
    "points": [${bulletShape}, "... EXACTLY 3 bullets as PLAY → REFLECT → ACT. (1) PLAY — how the activity runs, carrying the SECOND real micro-choice (a role, a material, or the order they go in); state it as the STUDENTS' decision, not an assignment — e.g. 'your group decides who is the number, who is the operator, who is the result', not 'Partner A is the number'. Rotate the social format vs Explore (if Explore was pairs, make this small groups or a whole-class relay). (2) REFLECT — a 30-second 'what worked for you?' turn-and-tell; 'detail' gives the exact question, which is about the easiest or most interesting bit, NEVER about mistakes. (3) ACT — apply the idea to ONE real textbook-style problem; 'detail' states the problem and its fully worked answer so the teacher never computes live."]
  },
  "sectionWatch": {
    "refresher": ${bulletShape} + " OR null if there is no refresher — the single most likely slip DURING the refresher; 'text' is the mistake as a short headline, 'detail' is the one-line fix the teacher says/does",
    "concept": ${bulletShape} + " — the single most likely misconception WHILE the concept is being discovered",
    "explore": ${bulletShape} + " — the single most likely thing that goes wrong DURING the Explore activity (a rule misunderstood, a step skipped), with the one-line fix in detail",
    "challenge": ${bulletShape} + " — the single most likely slip DURING the Challenge play, with the one-line fix in detail",
    "levelSet": ${bulletShape} + " — the single most likely wrong self-judgement at the close (e.g. thinking they've mastered it when they haven't), with the gentle one-line fix"
  },
  "materialsUsed": ["every item actually referenced across explore/challenge — nothing invented, nothing unused"],
  "levelSet": {
    "points": [${bulletShape}, "... EXACTLY 3 bullets, a WARM close students run themselves — NOT a test. (1) A topic-specific SELF-CHECK framed as 'Can you do this?' that partners tick together without the teacher (e.g. text: 'Tick with your partner: can you find the tenths place?', detail names the 2-3 concrete things they check — e.g. 'I found the ones place, I found the tenths place, I explained one price to my partner'). (2) A quick reflection on what was EASIEST or MOST INTERESTING today (never on errors). (3) A FINAL EITHER/OR autonomy choice that carries the idea home (e.g. 'A: draw one price you see at home tonight — OR — B: write a trick price for another pair'), framed as an invitation, not homework."]
  },
  "textbookImages": [
    { "section": "concept", "imageId": "the id of a REAL illustration listed under the textbook pages, e.g. img_c5ch3_04" },
    "... 0 to 3 items. Use these whenever a listed illustration genuinely fits a section — it is the picture the children already have in front of them, which no drawing can beat. Only ask for a drawing in \"diagrams\" for a section no listed picture suits. \"section\" must be one of \"concept\", \"explore\", \"challenge\", \"refresher\", \"levelSet\"; each id must be copied exactly from the list."
  ],
  "diagrams": [
    { "section": "concept", "focus": "describe ONE clean, concrete picture that makes this section's worked example intuitive using REAL relatable objects a child knows — name the exact objects, their quantities/values and arrangement (e.g. 'a roti cut into 4 equal parts with 3 parts shaded to show 3/4', or 'seven ₹1 coins grouped together and three loose ₹1 coins to show 7 + 3'). Prefer real things over abstract number lines or place-value grids. Keep it to a single idea, numbers exactly matching the example, at most a couple of short labels — never a busy multi-diagram scene." },
    "... 1 to 3 items total. ALWAYS include one for \"concept\" (the worked example should be seen, not only read). Add one for another section (\"explore\", \"challenge\", \"refresher\", \"levelSet\") ONLY where picturing its example genuinely makes it clearer — do not force it. \"section\" must be one of those exact keys; each \"focus\" must describe ONE clean concrete picture of THAT section's example with correct quantities — real objects over abstract diagrams, no number-line/text-banner collages. The server generates each image and attaches it to that section — do NOT describe or reference the image inside any bullet text."
  ],
  "timings": { "refresher": 3, "concept": 5, "explore": 10, "challenge": 12, "levelSet": 5 }
}

Rules:
- EVERYTHING is bullets. Every bullet list (recap, concept, explore.points, challenge.points, levelSet.points) has AT MOST 3 items.
- Each bullet's "text" is a compact 6-to-12-word headline that conveys the point. Bad (too terse): "Rounding". Bad (too long): "We often round numbers to the nearest ten before adding them together." Good: "Round each number to the nearest ten first" (with the why/example in "detail").
- "detail" carries the substance and should be present on almost every bullet (one or two sentences) — that's what appears when the teacher taps "+".
- BRIEF BUT DETAILED, ALWAYS: even the "detail" stays tight — at most 2 sentences, never a paragraph. Brief does not mean vague: pack the concrete how/number/script in, then stop. If an idea needs more than 2 sentences to land, it needs a DIAGRAM, not more text — request one in "diagrams" instead of writing longer.
- SHOW, DON'T JUST TELL: the Concept must always come with a diagram (see "diagrams"), and any section whose idea is easier to grasp as a picture should get one too. The sketch does the explaining the words don't have to.
- TEACH THE HOW, not just the what: for every explore and challenge bullet, the "detail" must give the facilitation — a short line the teacher SAYS (in quotes), how students respond (aloud / hands / pairs), a wait time where it matters, and the answer the teacher quietly listens for (per the "answers are for the teacher" rule — never announced as a verdict). A first-time teacher should not have to invent any of this.
- "objective" is ONE short verb-first headline (not a sentence, not a list). "sectionWatch" carries EXACTLY ONE watch-for per section (headline in text, one-line fix in detail) — each specific to THAT section's activity, never a generic repeat across sections. Set sectionWatch.refresher to null when there is no refresher.
- WORKED NUMBERS: whenever a bullet names a strategy or gives an example, its "detail" must SHOW the actual worked numbers, not just the label. Bad: "Break numbers apart to add." Good detail: "45 + 30 → 40 + 30 + 5 = 75." Any Challenge or example that has a computable answer MUST state that answer in its "detail" (e.g. "75 + 25 − 15 = 85"), so the teacher never has to compute it live while managing the class.
- CONSISTENCY: use ONE currency for the whole lesson — Indian rupees (₹) — never mix ₹ and $. Every concrete number the board sketch (imageFocus) shows must match the numbers used in explore's points, so a teacher copying the sketch and reading the cards sees the same values.
- GRADE-APPROPRIATE NUMBERS: the numbers in examples/Challenge must match this grade and topic — don't drop to trivially small numbers a much younger child would use. If the previous-topic refresher was about larger numbers, either bridge explicitly ("today we use the same idea on smaller numbers we can hold in our heads") or include at least one grade-level example, so the refresher and the activities don't feel mismatched.
- explore and levelSet must connect to the SAME real-life idea — levelSet returns to it, doesn't introduce a new one.
- STUDENT ACTION FIRST, EVERY SECTION: every section (refresher, concept, explore, challenge, levelSet) OPENS with something the students DO — pair up, try, decide, guess, build with objects — never with the teacher explaining. The teacher's naming/confirming of the idea comes only AFTER students have had a go. If a bullet's "text" starts with "Explain…", "Tell them…", or "Say that…", rewrite it to start with the student action.
- TWO NAMED INTERESTS: at least TWO of this class's ranked interests must appear by name in the sheet — in the hook and/or the choice options (e.g. a cricket price AND a festival sweet), not one generic "sweets". Weave them into the scene, don't just tack them on.
- HOOK, NEVER A DEFINITION: the lesson never opens by defining or stating the concept. explore's first bullet is always a curiosity hook (a puzzle/scene from the class's top interests ending in an open question); the concept emerges only after students have guessed in pairs.
- EXACTLY TWO real choices in the whole lesson — one in explore, one in challenge — each a genuine either/or the students decide (material, role, or order), phrased in the teacher's own words. Not more (it overwhelms), not zero (it removes ownership).
- ALWAYS PAIR OR GROUP, NEVER ALONE UNDER PRESSURE: students first try with a partner before answering the class; no cold-calling an individual to perform. A partner lowers the fear of being wrong.
- BILINGUAL SCAFFOLD: include exactly one short, key instruction phrase in the classroom's home/first language (with English in brackets) in explore — so the least-confident students still know what to do.
- WEAK-TOPIC SUPPORT IS INVISIBLE: if there are weak-area basics to shore up, fold them in as a natural warm-up step INSIDE the play — never as a separate 'revision' step and never named as something they're behind on. No student should be able to tell it's there for them.
- REFLECT ON THE GOOD, NEVER THE BAD: every reflection asks what was easiest, what worked, or what was most interesting — never what they got wrong. Competence grows from noticing success.
- ANSWERS ARE FOR THE TEACHER, NOT A VERDICT: the "detail" must still tell the teacher the worked answer so they're confident — but the SCRIPT spoken to students stays invitational. Never write "the answer is X", "they should show X", or "they respond, saying it's X". Instead frame it as what to LISTEN/WATCH for and what partners DISCUSS. Bad: "They respond aloud, saying it's 100/100." Good: "Listen for partners landing on about 100/100 — if one says 99 and one says 101, ask how they counted. There's no single 'right way' to show it with fingers."
- KEEP EXAMPLES AT THE CLEAREST SCALE: choose the smallest, cleanest numbers that make the idea obvious — don't inflate them in a way that buries the concept under arithmetic. For decimals/place value, show hundredths as ₹0.50 = 50 hundredths (50 of 100 equal parts of 1 rupee), NOT ₹50 = 5000 hundredths. The number should illuminate the concept, not test stamina.
- DON'T REFERENCE THE IMAGE IN TEXT: never write "see the image / picture above / reference chart" in any "text" or "detail" — each bullet must stand on its own in words. The picture is generated and shown separately (request it in "diagrams"); the words carry what to say and do, the image does the visual work — the two never point at each other.
- NAME THE RESOURCE, not the category: say "use the stones / bottle caps / chalk lines", not "use the materials" — the teacher and students should know the exact object to pick up.
- Every step in explore/challenge must only need ${materialsRule}. materialsUsed must list exactly what was actually used.
- "timings": rough whole-minute estimate per section (omit "refresher" if previousTopicRefresher is null). They should sum to roughly one class period (about 35 minutes).
- Never use the words "quiz", "test", "evaluate", "assess", "review", "recall", "prerequisite".
- The visible bullet lines together must be scannable in under 2 minutes; the details are there for when the teacher wants more.

Before returning: confirm "challenge.activity" is copied character-for-character from the bank (not from Explore, not from the avoid-list); confirm every bullet array has at most 3 items; confirm every material named in explore/challenge appears in "materialsUsed"; confirm one currency is used throughout and any computable answer is stated in its bullet's "detail".`

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 })

  // gemini-2.5-flash still emits malformed JSON on a meaningful fraction of
  // calls even with JSON mode on (an array closed with "}" instead of "]", a
  // dropped comma). Rather than surfacing that as a hard "Failed to generate",
  // ask for JSON mode AND retry the whole call a couple of times — a fresh
  // sample almost always parses. Cheap: only re-fires on an actual parse miss.
  //
  // max_tokens is deliberately generous: every bullet now carries a "detail",
  // and non-English classroom languages (Telugu/Hindi script) cost ~3-4x the
  // tokens of Latin text, so a tight ceiling silently TRUNCATES the JSON
  // mid-string — which no retry or comma-repair can recover. 4000 comfortably
  // fits the full 5-section lesson even in Telugu.
  // Gemini (even in JSON mode) intermittently returns a near-empty body with
  // finish_reason "stop", or drops mid-stream with finish_reason "error" — a
  // 200 response either way, so OpenRouter's own `models` failover does NOT kick
  // in (it only fails over on request-level 5xx/provider-down). So we do the
  // failover ourselves: try the primary once, then switch to a DIFFERENT
  // provider (OpenAI gpt-4o-mini — strong at multilingual structured JSON) for
  // the remaining attempts. Deliberately not the generic weak OPENROUTER_FALLBACK_MODEL.
  const primaryModel = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'
  const fallbackModel = process.env.OPENROUTER_LESSON_FALLBACK_MODEL || 'openai/gpt-4o-mini'
  // One shot on the primary, then the fallback provider for the rest.
  const attemptModels = [primaryModel, fallbackModel, fallbackModel]

  let lesson: ParsedSmartLesson | null = null
  let lastRaw = ''
  let lastError = ''
  let truncated = false
  for (let attempt = 0; attempt < attemptModels.length && !lesson; attempt++) {
    const model = attemptModels[attempt]
    // Small backoff before a retry, to ride out a transient provider blip.
    if (attempt > 0) await new Promise(r => setTimeout(r, 400 * attempt))
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'EduTeach Prep Material',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.75,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
    })

    if (!aiRes.ok) {
      lastError = await aiRes.text()
      continue
    }

    const aiData = await aiRes.json() as { choices: { message: { content: string }; finish_reason?: string }[] }
    lastRaw = aiData.choices?.[0]?.message?.content ?? ''
    const finish = aiData.choices?.[0]?.finish_reason
    truncated = finish === 'length'
    lesson = tryParseLesson(lastRaw)
    if (!lesson) console.warn(`[smart-lesson] unparseable JSON on attempt ${attempt + 1} (model=${model}, finish_reason=${finish}), retrying`)
  }

  // Last resort before failing the request: if we got text back but couldn't
  // parse it (and it wasn't just truncated), ask the model to fix its own JSON
  // syntax. Only runs on the rare full-failure path, so it costs nothing normally.
  if (!lesson && lastRaw && !truncated) {
    console.warn('[smart-lesson] all attempts unparseable, trying model JSON repair')
    lesson = tryParseLesson(await repairRawJson(lastRaw, apiKey))
  }

  if (!lesson) {
    // Log a bounded window of the raw so the actual malformation is diagnosable
    // (the full string can be huge; head+tail is enough to see the shape).
    console.error('[smart-lesson] gave up — raw head:', JSON.stringify(lastRaw.slice(0, 500)))
    console.error('[smart-lesson] gave up — raw tail:', JSON.stringify(lastRaw.slice(-300)))
    const reason = lastError
      ? `AI error: ${lastError}`
      : truncated
        ? 'The lesson was cut off before it finished generating. Please try again.'
        : 'AI returned malformed JSON'
    return NextResponse.json({ error: reason, raw: lastRaw }, { status: 500 })
  }

  const resources = teachingProfile?.classroom?.resources ?? []
  lesson = sanitizeLesson(lesson, resources)
  const issues = validateLesson(lesson, resources, avoidActivities)
  if (issues.length > 0) {
    console.error('[smart-lesson] Tier 2 violations, repairing:', issues)
    lesson = sanitizeLesson(await repairLesson(lesson, issues, apiKey), resources)
  }

  // Reference illustrations — clean workbook-style figures that depict the
  // section's SPECIFIC worked example accurately (real objects in the exact
  // quantities, with correct printed numbers/labels), which the teacher SHOWS
  // students to explain that example. The section's own example text is fed into
  // the image prompt so the picture matches the content's numbers, not a vague
  // scene. Each
  // hangs off the FIRST bullet of its section (shown in that bullet's "+"
  // expansion / deck slide and in the banner card). Concept always gets one so
  // the idea is visual; the model may request more where a picture makes the
  // content click. Generated in PARALLEL so several images cost about the same
  // wall-time as one, and capped at 4 to keep within maxDuration. Never throws —
  // a failed/timed-out image just leaves that bullet image-less and the section
  // still renders fine.
  const sectionFirstBullet: Record<string, ExpandableBullet | undefined> = {
    refresher: lesson.previousTopicRefresher?.recap?.[0],
    concept:   lesson.concept?.[0],
    explore:   lesson.explore?.points?.[0],
    challenge: lesson.challenge?.points?.[0],
    levelSet:  lesson.levelSet?.points?.[0],
  }
  // Start from the model's requested diagrams, then guarantee Explore (back-compat
  // with the old imageFocus field) and Concept always have one.
  const diagramReqs: { section: string; focus: string }[] = []
  const addReq = (section: string, focus?: string) => {
    if (!focus || !focus.trim()) return
    if (!sectionFirstBullet[section]) return                 // no bullet to hang it on
    if (usedTextbookSections.has(section)) return             // the book already supplied one
    if (diagramReqs.some(r => r.section === section)) return  // one image per section
    diagramReqs.push({ section, focus: focus.trim() })
  }
  // Real textbook illustrations come first and win their section outright: the
  // book's own picture is the one on the desk in front of the children, and a
  // generated sketch of the same idea is strictly worse. Only sections no real
  // picture fits fall through to being drawn.
  const usedTextbookSections = new Set<string>()
  if (textbook?.images.length) {
    const byAnchor = new Map(textbook.images.map(i => [i.imageId, i]))
    const picks = Array.isArray(lesson.textbookImages) ? lesson.textbookImages : []
    for (const pick of picks) {
      if (!pick || typeof pick.section !== 'string' || typeof pick.imageId !== 'string') continue
      const image = byAnchor.get(pick.imageId.trim())
      const bullet = sectionFirstBullet[pick.section]
      // A hallucinated id resolves to nothing and is simply dropped — the
      // section then gets a drawing like any other.
      if (!image || !bullet || usedTextbookSections.has(pick.section)) continue
      bullet.image = { url: `/api/textbook-image/${image.id}` }
      usedTextbookSections.add(pick.section)
    }
  }

  const modelDiagrams = Array.isArray(lesson.diagrams)
    ? lesson.diagrams.filter((d): d is { section: string; focus: string } => !!d && typeof d.section === 'string' && typeof d.focus === 'string')
    : []
  const focusFor = (section: string) => modelDiagrams.find(d => d.section === section)?.focus
  // Concept, Explore AND the Challenge activity ALWAYS get a picture, queued FIRST
  // so they survive the image cap even when the model requested diagrams for other
  // sections. Fall back to the section's first bullet text when no focus was
  // supplied (the model often drops imageFocus under the fuller prompt).
  addReq('concept', focusFor('concept') || sectionFirstBullet.concept?.text)
  addReq('explore', focusFor('explore') || lesson.explore?.imageFocus || sectionFirstBullet.explore?.text)
  addReq('challenge', focusFor('challenge') || sectionFirstBullet.challenge?.text || lesson.challenge?.activity)
  for (const d of modelDiagrams) addReq(d.section, d.focus)   // fill remaining slot(s) with other requested sections
  const finalReqs = diagramReqs.slice(0, 4)

  await Promise.all(finalReqs.map(async r => {
    const bullet = sectionFirstBullet[r.section]
    // Feed the section's ACTUAL example (headline + worked detail) to the image
    // model so the picture matches the numbers in the content, not a vague guess.
    const exampleText = [bullet?.text, bullet?.detail].filter(Boolean).join(' — ')
    const imgPrompt = `A clean, friendly primary-school WORKBOOK illustration that explains ONE worked example using concrete, real, relatable objects a child recognises — so the idea is obvious at a glance while a teacher points at it.

Illustrate this: ${r.focus}
It must accurately match this example from the lesson: "${exampleText}"

Requirements:
- Use CONCRETE real-life objects to make the idea intuitive (coins, notes, fruits, rotis, sweets, blocks, groups of children, a pizza/roti cut into parts, etc.). AVOID abstract number lines, place-value grids, and bar charts — a picture of real things explains better than a diagram. Only use a number line if the concept is literally about position/order on a line.
- Show ONE single clear representation. Do NOT crowd several diagrams into one image — no "number-line + text banner + coin piles" collages. One clean idea with plenty of white space.
- Quantities must be EXACTLY right and countable: if the example says 7, show exactly 7; the picture must be arithmetically correct and the coin/object values must match the example (₹0.50 is half a rupee, NOT ₹50).
- At most a few short, correctly-spelled labels or the single key number, placed neatly — NO long sentences, paragraphs, or explanation banners inside the image.
- Plain white background, bright flat colours, bold simple shapes; nothing decorative or unrelated, no watermarks or logos.
Clean, accurate, and genuinely explanatory — a child should understand the idea just by looking.`
    const generated = await generateIllustration(imgPrompt, { timeoutMs: 25_000 })
    if (!generated || !bullet) return
    // Into storage, not into the row. See storeIllustration — inlining the
    // base64 is what made a lesson 3MB.
    const stored = await storeIllustration(
      admin,
      generated.url,
      illustrationKey([classId, topic, subtopic, r.section]),
    )
    bullet.image = { url: stored ?? generated.url }
  }))

  return NextResponse.json({
    topic,
    subtopic: subtopic || undefined,
    subject,
    grade,
    totalStudents,
    lesson,
  })
}
