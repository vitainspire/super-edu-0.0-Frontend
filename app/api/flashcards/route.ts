import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { FlashcardsSchema, parseBody } from '@/lib/schemas'

// callAI's primary+fallback retry chain can take up to ~90s on failure.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed_ = parseBody(FlashcardsSchema, rawBody)
  if (!parsed_.ok) return parsed_.response
  const { topic, subject, grade, interests } = parsed_.data

  const interestHint = interests?.length
    ? `Where natural, relate examples to: ${interests.slice(0, 2).join(', ')}.`
    : 'Use simple Indian everyday examples (cricket, market, cooking, farming) where helpful.'

  const prompt =
`You are creating a set of 8 revision flashcards for a Grade ${grade} student in an Indian government school studying ${subject}.
Topic: ${topic}
${interestHint}

Rules:
- Each flashcard has a FRONT (a short prompt: a term, question, or "What is…?") and a BACK (a clear, correct answer in 1–2 simple sentences).
- Match Grade ${grade} level — simple language, no jargon.
- Cover the key ideas of the topic: definitions, one worked example, and one "why it matters".
- Keep the front under 12 words. Keep the back under 40 words.

Return ONLY valid JSON, no markdown, no extra text:
{
  "cards": [
    { "front": "front text here", "back": "back text here" }
  ]
}`

  try {
    const topInterest = interests?.[0]?.slice(0, 20).toLowerCase().replace(/\s+/g, '_') ?? 'none'
    const { value } = await withCache(
      ck('flashcards-v1', topic.toLowerCase().trim(), subject.toLowerCase().trim(), grade, topInterest),
      86400,
      async () => {
        const text = await callAI([{ role: 'user', content: prompt }], { maxTokens: 900 })
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        const match   = cleaned.match(/\{[\s\S]*\}/)
        return JSON.parse(match?.[0] ?? cleaned)
      },
    )
    const cards = Array.isArray(value?.cards)
      ? (value.cards as unknown[]).filter((c): c is { front: string; back: string } =>
          c != null && typeof c === 'object' &&
          typeof (c as Record<string, unknown>).front === 'string' &&
          typeof (c as Record<string, unknown>).back === 'string'
        )
      : []
    if (cards.length === 0) throw new Error('No valid flashcards returned by AI')
    return NextResponse.json({ cards })
  } catch (err) {
    console.error('[flashcards] generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate flashcards' }, { status: 500 })
  }
}
