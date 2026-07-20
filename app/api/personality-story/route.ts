import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { verifyStudentCookie } from '@/lib/student-auth'
import { callAI } from '@/lib/ai'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { todayDateStr, traitForDate } from '@/lib/personality-traits'
import type { PersonalityStory } from '@/lib/types'

// callAI's primary+fallback retry chain can take up to ~90s on failure.
export const maxDuration = 60

function isValidOption(o: unknown): boolean {
  if (o == null || typeof o !== 'object') return false
  const opt = o as Record<string, unknown>
  return (
    typeof opt.text === 'string' &&
    (opt.leadsToward === 'wise' || opt.leadsToward === 'regret')
  )
}

function isValidStep(v: unknown): boolean {
  if (v == null || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return (
    typeof s.scene === 'string' &&
    typeof s.question === 'string' &&
    Array.isArray(s.options) &&
    s.options.length === 3 &&
    (s.options as unknown[]).every(isValidOption)
  )
}

// { wise: string, mixed: string, regret: string } — used for endings,
// personalityAnalysis, and learningSummary, which all share this shape.
function isValidTriple(v: unknown): boolean {
  if (v == null || typeof v !== 'object') return false
  const t = v as Record<string, unknown>
  return typeof t.wise === 'string' && typeof t.mixed === 'string' && typeof t.regret === 'string'
}

function isValidStory(v: unknown): v is PersonalityStory {
  if (v == null || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return (
    typeof s.title === 'string' &&
    typeof s.introduction === 'string' &&
    Array.isArray(s.steps) &&
    s.steps.length === 3 &&
    (s.steps as unknown[]).every(isValidStep) &&
    isValidTriple(s.endings) &&
    isValidTriple(s.personalityAnalysis) &&
    isValidTriple(s.learningSummary)
  )
}

// GET /api/personality-story — today's personality-development story for the
// authenticated student. One story per student per calendar day, persisted in
// `personality_stories` so it's stable across devices and serverless cold starts.
export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  const studentId = verifyStudentCookie(req.cookies.get('edu-student-id')?.value)
  if (!studentId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = createAdminClient()
  const date = todayDateStr()

  const { data: existing } = await supabase
    .from('personality_stories')
    .select('trait, story')
    .eq('student_id', studentId)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ trait: existing.trait, story: existing.story as PersonalityStory })
  }

  const { data: student } = await supabase
    .from('students').select('name, interests').eq('id', studentId).single()
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const trait = traitForDate(date)
  const interests: string[] = student.interests ?? []
  const interestHint = interests.length
    ? `Weave in one of these interests as the setting or characters: ${interests.slice(0, 3).join(', ')}.`
    : 'Use a simple everyday Indian setting — school, playground, home, or market.'

  const prompt =
`You are writing a short, interactive personality-development story for a young Indian schoolchild named ${student.name.split(' ')[0]}, in Class 1 to Class 5 (age 6-10).

Personality trait to teach: ${trait}
${interestHint}

READING LEVEL — this is the most important rule. Write for a 6-10 year old reading alone:
- Short sentences only — about 8-12 words each, never long or twisty.
- Simple, everyday words a young child already knows. No big or abstract words (don't say things like "consequence," "reflect," "prioritize" — say what actually happened instead).
- Concrete and visual — say exactly what the character sees/does/says, not how they "feel" in the abstract.
- Never explain the trait itself or lecture the reader — the child should feel the story, not be told a lesson mid-story.

SETTING — keep it to a child's real world. Good scenarios: school, classroom, playground, friends, siblings, parents, grandparents, festivals (Diwali, Holi, Eid, etc.), sharing food or toys, homework, a cricket/sports match, pocket money, finding something that isn't theirs, a promise to a friend, screen time / TV / games. Do NOT use grown-up settings like jobs, careers, exams-as-high-stakes, dating, or money problems beyond simple pocket money.

Write the story as exactly 3 connected scenes ("steps"), each ending at a decision point. Each scene must continue directly from the one before it — the SAME ongoing situation moving forward in time, not a new unrelated one each time. Give it something real a child would recognize (a friendship, a game, a promise, a family moment) — not a generic "be nice" filler scenario.

IMPORTANT — the child is NEVER interrupted with feedback while the story is happening. They pick an option and the story silently moves straight on to the next scene, with no reveal, no judgment, no hint of right-or-wrong at any point in the middle. Because of this, write each step's "scene" so it reads naturally as the next moment in the story NO MATTER which of the 3 options was picked before it — do not write it as a direct reaction to one specific choice. Keep the situation moving forward in a way that stays sensible regardless of which option led there.

First, write an "introduction" — 1-2 short sentences that introduce the character and where they are, before anything happens yet.

For each of the 3 steps, write:
- "scene": 2-3 short sentences of story. For step 1, this sets up the situation right after the introduction. For steps 2 and 3, this moves the same situation forward to its next moment. End right at the moment of a decision.
- "question": one short sentence asking what the character should do next.
- "options": exactly 3 short choices (a few words each, simple words), each with:
  - "leadsToward": "wise" if this choice reflects ${trait} well, or "regret" if it doesn't. Choices should feel understandable either way (never villainous or scary), just leaning one way or the other.

Only AFTER all 3 choices are made does the child see anything else — the story then plays out to ONE ending that reflects the whole pattern of choices, followed by an explanation. Nothing before this point may reveal how any single choice turned out.

Write three possible closing scenes in "endings" — this is the single moment the child finally sees the real result of their choices, specific to what actually happened across all 3 steps, not a generic wrap-up:
- "wise": the character mostly chose well through the story. Show the concrete good result those specific choices led to, AND have someone (a friend, parent, or teacher) or the character themself plainly say something warm, in their own words.
- "regret": the character mostly chose poorly. This should be a genuinely disappointing outcome, not softened — spell out the actual, specific thing that went wrong because of those choices, concrete and simple (not vague feelings), so the child clearly feels "that didn't go well." Keep it age-appropriate and never scary or harsh toward the character as a person — the choices were wrong, not the child.
- "mixed": an in-between result — name one specific thing that went right and one that went less well, and the result is noticeably weaker than the "wise" ending.

Then write "personalityAnalysis" — for EACH of wise/mixed/regret, 2-3 simple sentences spoken directly to the child ("You...") plainly explaining WHY that outcome happened — connect it clearly to the specific choices made across the story. Plain words only, not abstract ("because you chose to X, then Y happened").

Then write "learningSummary" — for EACH of wise/mixed/regret, one short, concrete sentence telling the child exactly what the better choice would have been at these decision points (for "wise", instead affirm that this is exactly what to keep doing). This must be real, usable advice for a similar situation in real life — not a vague mood note. Say plainly what to do differently, in simple child-friendly words.

Also write a short "title" (3-6 simple words) for the story.

No violence, no scary content, no narrator voice stating a moral mid-story — everything in the steps and endings must come through as the character's own experience. The personalityAnalysis and learningSummary are the only places allowed to speak directly to the reader, and only after the ending.

Return ONLY valid JSON, no markdown, no extra text:
{
  "title": "string",
  "introduction": "string",
  "steps": [
    {
      "scene": "string",
      "question": "string",
      "options": [
        { "text": "string", "leadsToward": "wise" },
        { "text": "string", "leadsToward": "wise" },
        { "text": "string", "leadsToward": "regret" }
      ]
    }
  ],
  "endings": { "wise": "string", "mixed": "string", "regret": "string" },
  "personalityAnalysis": { "wise": "string", "mixed": "string", "regret": "string" },
  "learningSummary": { "wise": "string", "mixed": "string", "regret": "string" }
}
(steps must contain exactly 3 entries, each with exactly 3 options)`

  try {
    const text = await callAI([{ role: 'user', content: prompt }], { maxTokens: 2000 })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match?.[0] ?? cleaned)
    if (!isValidStory(parsed)) throw new Error('AI returned an incomplete story')

    const story: PersonalityStory = { ...parsed, trait }

    // Insert with unique(student_id, date) as the guard against a race between
    // two concurrent requests (e.g. two devices) both missing the cache above.
    const { error: insertErr } = await supabase
      .from('personality_stories')
      .insert({ id: crypto.randomUUID(), student_id: studentId, date, trait, story })

    if (insertErr) {
      // Someone else won the race — fetch what they inserted instead of erroring.
      const { data: winner } = await supabase
        .from('personality_stories')
        .select('trait, story')
        .eq('student_id', studentId)
        .eq('date', date)
        .maybeSingle()
      if (winner) return NextResponse.json({ trait: winner.trait, story: winner.story as PersonalityStory })
    }

    return NextResponse.json({ trait, story })
  } catch (err) {
    console.error('[personality-story] generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate story' }, { status: 500 })
  }
}
