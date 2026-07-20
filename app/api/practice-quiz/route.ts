import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { PracticeQuizSchema, parseBody } from '@/lib/schemas'

// callAI's primary+fallback retry chain can take up to ~90s on failure.
export const maxDuration = 60

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
`You are creating a 4-question multiple-choice practice quiz for a Grade ${grade} student in an Indian government school studying ${subject}.
Topic: ${topic}
${interestHint}

Rules:
- Questions must match Grade ${grade} level — simple language, no jargon.
- Each question has exactly 4 options (A, B, C, D). Only ONE is correct.
- Vary difficulty: Q1 easy, Q2 easy-medium, Q3 medium, Q4 slightly harder.
- The explanation must be 1 sentence — explain WHY the answer is correct in simple terms.
- Do NOT use "All of the above" or "None of the above" options.

Return ONLY valid JSON, no markdown, no extra text:
{
  "questions": [
    {
      "text": "question text here",
      "options": ["option A text", "option B text", "option C text", "option D text"],
      "answerIndex": 0,
      "explanation": "one sentence explanation"
    }
  ]
}`

  try {
    const topInterest = interests?.[0]?.slice(0, 20).toLowerCase().replace(/\s+/g, '_') ?? 'none'
    const { value } = await withCache(
      ck('practice-quiz-v1', topic.toLowerCase().trim(), subject.toLowerCase().trim(), grade, topInterest),
      86400,
      async () => {
        const text = await callAI([{ role: 'user', content: prompt }], { maxTokens: 800 })
        // Strip markdown fences before parsing
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        const match   = cleaned.match(/\{[\s\S]*\}/)
        return JSON.parse(match?.[0] ?? cleaned)
      },
    )
    // Validate each question has required fields
    const questions = Array.isArray(value?.questions)
      ? (value.questions as unknown[]).filter((q): q is Record<string, unknown> =>
          q != null && typeof q === 'object' &&
          typeof (q as Record<string, unknown>).text === 'string' &&
          Array.isArray((q as Record<string, unknown>).options) &&
          typeof (q as Record<string, unknown>).answerIndex === 'number'
        )
      : []
    if (questions.length === 0) throw new Error('No valid questions returned by AI')
    return NextResponse.json({ questions })
  } catch (err) {
    console.error('[practice-quiz] generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 })
  }
}
