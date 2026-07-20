import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { apiLog } from '@/lib/logger'
import { LessonPrepSchema, parseBody } from '@/lib/schemas'

// callAI's primary+fallback retry chain can take up to ~90s on failure.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'lesson-prep', ip, fromCache: false, durationMs: 0, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed_ = parseBody(LessonPrepSchema, rawBody)
  if (!parsed_.ok) return parsed_.response
  const { topic, subject, grade = '', language = 'english', subtopic } = parsed_.data

  const langNote = language !== 'english'
    ? `The teacher prefers ${language}. Use simple English but include key terms in ${language} where natural.`
    : ''

  const focus = subtopic?.trim()
    ? `The specific subtopic for today is "${subtopic.trim()}" within "${topic}". Focus all examples, mistakes, and activity on this subtopic.`
    : ''

  const displayTopic = subtopic?.trim() ? `${topic} → ${subtopic.trim()}` : topic

  const prompt = `You are a mentor helping an Indian ${subject} teacher prepare to teach "${displayTopic}" to Grade ${grade || 'school'} students.
${langNote}
${focus}

Give a quick lesson prep guide. Use familiar Indian contexts (cricket, chai, markets, festivals, auto-rickshaw, mobile data, Bollywood) for examples.

Respond ONLY as valid JSON:
{
  "explanation": "A clear 2-sentence explanation of ${displayTopic} in simple language a student can understand",
  "examples": ["Indian real-life example 1", "Indian real-life example 2", "Indian real-life example 3"],
  "commonMistakes": ["Common mistake students make 1", "Common mistake students make 2"],
  "quickActivity": "One specific 2-minute activity the teacher can do right now to check if students understood"
}`

  const t = Date.now()
  try {
    const { value: parsed, fromCache } = await withCache(
      ck('lesson-prep', topic.toLowerCase().trim(), subject.toLowerCase().trim(), grade, language, subtopic?.toLowerCase().trim() ?? ''),
      2592000,
      async () => {
        const content = await callAI([{ role: 'user', content: prompt }], { maxTokens: 700 })
        return JSON.parse(content)
      },
    )
    apiLog({ route: 'lesson-prep', ip, fromCache, durationMs: Date.now() - t, status: 'ok' })
    return NextResponse.json(parsed)
  } catch {
    apiLog({ route: 'lesson-prep', ip, fromCache: false, durationMs: Date.now() - t, status: 'error' })
    return NextResponse.json({ error: 'Failed to generate prep' }, { status: 500 })
  }
}
