import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { apiLog } from '@/lib/logger'
import { CatchupPlanSchema, parseBody } from '@/lib/schemas'

// callAI's primary+fallback retry chain can take up to ~90s on failure.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'catchup-plan', ip, fromCache: false, durationMs: 0, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed_ = parseBody(CatchupPlanSchema, rawBody)
  if (!parsed_.ok) return parsed_.response
  const {
    studentName, topic, subject, grade, score, lessonSnapshot,
    studentInterests, studentGoal, learningStyle,
    overallAttendanceRate, topicSessionsTotal, topicSessionsMissed, absenteeType,
  } = parsed_.data

  const interests = studentInterests?.filter(Boolean) ?? []
  const topInterestLine = interests.length > 0
    ? `You MUST use "${interests[0]}" as the central analogy or example. Do not use a generic example instead.`
    : 'Use a relatable Indian everyday example: cricket scoring, market shopping, cooking measurements, or farming.'

  const styleRule = learningStyle === 'story-based'
    ? 'This student learns through stories and narratives — frame everything as a mini-story or journey.'
    : learningStyle === 'analytical'
    ? 'This student is analytical — use clear steps, patterns, and logical sequences rather than stories.'
    : 'Use simple, conversational language.'

  const goalLine = studentGoal
    ? `Student's personal goal: "${studentGoal}" — connect the topic to this goal in one sentence if natural.`
    : ''

  const scoreLine = score != null
    ? score < 40
      ? `Test score: ${score}% — VERY LOW. The student missed the lesson and is failing the test. Start from absolute basics.`
      : score < 70
      ? `Test score: ${score}% — below passing. They missed the lesson and are struggling. Fill the gap carefully.`
      : `Test score: ${score}% — decent. They missed the lesson but are managing. One focused session should be enough.`
    : 'No test score yet — treat cautiously and check understanding as you go.'

  const attendancePct = overallAttendanceRate != null ? Math.round(overallAttendanceRate * 100) : null
  const absenteeRule = absenteeType === 'chronic'
    ? `CHRONIC ABSENTEE (${attendancePct ?? '?'}% attendance${topicSessionsMissed != null ? `, missed ${topicSessionsMissed} of ${topicSessionsTotal} sessions on this topic` : ''}).
→ Do NOT assume classroom continuity. This student likely missed prerequisite sessions too.
→ Start the explanation with a simple check question to see what they already know.
→ Build from foundational concepts up to the topic — this is a re-entry plan, not a quick recap.`
    : `RARE ABSENTEE (${attendancePct ?? '?'}% attendance${topicSessionsMissed != null ? `, missed ${topicSessionsMissed} of ${topicSessionsTotal} sessions on this topic` : ''}).
→ Assume the student knows class basics and what came before this topic.
→ Focus only on what was covered in the missed session. No need to re-teach prerequisites.
→ One focused 10-minute session is enough to bring them up to speed.`

  const hookRule = lessonSnapshot?.hook
    ? `The class started with this hook: "${lessonSnapshot.hook}"
Real-life examples the class saw: ${lessonSnapshot.realLifeExamples.join('; ')}
→ OPEN your explanation with the exact same hook. Weave in the same examples so this student feels connected to what their classmates experienced.`
    : ''

  const prompt =
`You are writing a personalised catch-up plan for a student in an Indian government school. A teacher will use this in a 10-minute one-on-one session — reading it aloud or giving it as a handwritten note. The student has no phone or internet.

━━ STUDENT ━━
Name: ${studentName} | Grade: ${grade} | Subject: ${subject}
Topic missed: ${topic}
${scoreLine}
${absenteeRule}
${hookRule}
${goalLine}

━━ HOW TO EXPLAIN ━━
${topInterestLine}
${styleRule}
Write the explanation as if you are SPEAKING DIRECTLY to ${studentName} — warm, simple, conversational. A Grade ${grade} student must be able to follow every sentence.

━━ OUTPUT ━━
Return ONLY valid JSON with exactly these 4 fields:

{
  "explanation": "${absenteeType === 'chronic'
    ? `5-6 sentences. Open with a friendly check: 'Do you remember what [prerequisite] means? Let me remind you...' Then build step by step to ${topic}. End by confirming the student understands with one rhetorical question.`
    : `4-5 sentences. ${lessonSnapshot?.hook ? `Open with: "${lessonSnapshot.hook.slice(0, 60)}..." — the same hook the class heard.` : `Open with the ${interests[0] ?? 'everyday Indian'} analogy.`} Explain ${topic} clearly and end with one sentence connecting it to what they already know.`}",

  "practiceQuestions": [
    "Warm-up: [A very simple question — even a nervous student should get this right. Tests that they understood the basic concept.]",
    "Basic: [A straightforward question directly on ${topic}. One step to answer.]",
    "Medium: [Requires applying ${topic} in a small problem. Two steps.]",
    "Challenge: [A slightly harder question that makes them think. Connects ${topic} to a real situation${interests.length > 0 ? ` involving ${interests[0]}` : ''}.]"
  ],

  "activity": "Step 1: [What teacher says/does first — 2 min]. Step 2: [Student does something with chalk or notebook — 3 min]. Step 3: [Teacher checks and corrects — 3 min]. Step 4: [Quick confidence check — 2 min]. (Uses only chalk, fingers, or notebook. No materials needed.)",

  "focusNote": "Start by asking ${studentName}: [one specific question that reveals if they understood]. If they struggle, [exactly what to do or say]. The key idea to lock in today: [one sentence on the core concept]."
}`

  const t = Date.now()
  try {
    const scoreBucket = score == null ? 'none' : score < 50 ? 'low' : score < 75 ? 'medium' : 'high'
    const snapshotKey = lessonSnapshot?.hook ? lessonSnapshot.hook.slice(0, 30).replace(/\s+/g, '_') : 'none'
    const topInterest = interests[0]?.slice(0, 15).replace(/\s+/g, '_') ?? 'none'
    const { value: parsed, fromCache } = await withCache(
      ck('catchup-v2', topic.toLowerCase().trim(), subject.toLowerCase().trim(), grade, scoreBucket, snapshotKey, absenteeType ?? 'rare', topInterest),
      604800,
      async () => {
        const text = await callAI([{ role: 'user', content: prompt }], { maxTokens: 1400 })
        // Strip markdown fences before parsing
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        const match   = cleaned.match(/\{[\s\S]*\}/)
        return JSON.parse(match?.[0] ?? cleaned)
      },
    )
    apiLog({ route: 'catchup-plan', ip, fromCache, durationMs: Date.now() - t, status: 'ok' })
    return NextResponse.json({
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
      practiceQuestions: Array.isArray(parsed.practiceQuestions) ? parsed.practiceQuestions : [],
      activity: typeof parsed.activity === 'string' ? parsed.activity : '',
      focusNote: typeof parsed.focusNote === 'string' ? parsed.focusNote : '',
    })
  } catch (err) {
    console.error('[catchup-plan] generation failed:', err)
    apiLog({ route: 'catchup-plan', ip, fromCache: false, durationMs: Date.now() - t, status: 'error' })
    return NextResponse.json({ error: 'Failed to generate plan' }, { status: 500 })
  }
}
