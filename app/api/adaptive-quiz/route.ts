import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { PracticeQuizSchema, parseBody } from '@/lib/schemas'

// callAI's primary+fallback retry chain can take up to ~90s on failure.
export const maxDuration = 60

interface RawQuestion { text?: unknown; options?: unknown; answerIndex?: unknown; explanation?: unknown }

function isValidQuestion(q: unknown): q is { text: string; options: string[]; answerIndex: number; explanation?: string } {
  if (q == null || typeof q !== 'object') return false
  const r = q as RawQuestion
  return typeof r.text === 'string' && Array.isArray(r.options) && typeof r.answerIndex === 'number'
}

// A separate, additional generation endpoint for the Adaptive Quiz mode — kept
// independent of /api/practice-quiz (the existing, unrelated flat-quiz feature)
// so nothing about that shipped flow is touched or put at risk. Returns a
// tiered pool of questions instead of one fixed list; the client (AdaptiveQuizPanel)
// picks which tier to draw from next based on the student's live performance.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed_ = parseBody(PracticeQuizSchema, rawBody)
  if (!parsed_.ok) return parsed_.response
  const { topic, subject, grade, interests } = parsed_.data

  const interestHint = interests?.length
    ? `Use examples from: ${interests.slice(0, 2).join(', ')}.`
    : 'Use simple Indian everyday examples (cricket, market, cooking, farming).'

  const prompt =
`You are creating an adaptive practice-quiz question bank for a Grade ${grade} student in an Indian government school studying ${subject}.
Topic: ${topic}
${interestHint}

Write THREE difficulty tiers of multiple-choice questions on this exact topic:
- "easy": 3 questions — very simple, one clear step to the answer.
- "medium": 4 questions — the standard difficulty for this grade level.
- "hard": 3 questions — a genuinely harder variation (an extra step, a trickier case), still fair for this grade.

Rules for every question:
- Exactly 4 options (A, B, C, D). Only ONE is correct.
- No "All of the above" / "None of the above".
- "explanation": 1 sentence, explains WHY the answer is correct in simple terms.
- Simple language throughout — no jargon beyond what's needed for the topic.

Return ONLY valid JSON, no markdown, no extra text:
{
  "easy":   [ { "text": "string", "options": ["a","b","c","d"], "answerIndex": 0, "explanation": "string" } ],
  "medium": [ { "text": "string", "options": ["a","b","c","d"], "answerIndex": 0, "explanation": "string" } ],
  "hard":   [ { "text": "string", "options": ["a","b","c","d"], "answerIndex": 0, "explanation": "string" } ]
}
("easy" must contain exactly 3, "medium" exactly 4, "hard" exactly 3)`

  try {
    const topInterest = interests?.[0]?.slice(0, 20).toLowerCase().replace(/\s+/g, '_') ?? 'none'
    const { value } = await withCache(
      ck('adaptive-quiz-v1', topic.toLowerCase().trim(), subject.toLowerCase().trim(), grade, topInterest),
      86400,
      async () => {
        const text = await callAI([{ role: 'user', content: prompt }], { maxTokens: 1600 })
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        const match   = cleaned.match(/\{[\s\S]*\}/)
        return JSON.parse(match?.[0] ?? cleaned)
      },
    )

    const pool = {
      easy:   Array.isArray(value?.easy)   ? (value.easy as unknown[]).filter(isValidQuestion)   : [],
      medium: Array.isArray(value?.medium) ? (value.medium as unknown[]).filter(isValidQuestion) : [],
      hard:   Array.isArray(value?.hard)   ? (value.hard as unknown[]).filter(isValidQuestion)   : [],
    }
    if (pool.easy.length === 0 && pool.medium.length === 0 && pool.hard.length === 0) {
      throw new Error('No valid questions returned by AI')
    }
    return NextResponse.json({ pool })
  } catch (err) {
    console.error('[adaptive-quiz] generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate adaptive quiz' }, { status: 500 })
  }
}
