import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { createServerComponentClient } from '@/lib/supabase-server'
import { parseBody, ExtractSyllabusSchema } from '@/lib/schemas'
import { apiLog, getClientIp } from '@/lib/logger'
import { checkVisionRateLimit } from '@/lib/rate-limit'

// Accepts an optional image (vision call), so it's gated by the tighter vision
// rate limit even though it also requires an authenticated teacher.
export const maxDuration = 60

const SYSTEM = `You are a school syllabus parser for Indian curriculum (CBSE/State boards).
Parse the input and return structured topics with their sub-topics.

Return ONLY valid JSON (no markdown, no code fences):
{
  "topics": [
    {
      "topic": "unit or chapter name",
      "description": "brief one-line description of the unit",
      "subTopics": ["individual lesson or concept 1", "individual lesson or concept 2"],
      "weekNumber": 1
    }
  ]
}

Rules:
- Each unit/chapter = one topic entry
- subTopics = array of individual lessons, concepts, or sub-units listed under that unit
- description = one short sentence describing the overall unit (not a list)
- Assign weekNumber sequentially starting from 1
- If no clear units, treat each row/line as one topic with empty subTopics
- Keep topic names short and clean
- Each subTopic should be a meaningful standalone lesson (not just a single word)`

function extractJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) return fenced[1]
  const firstBrace = raw.indexOf('{')
  const lastBrace  = raw.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1) return raw.slice(firstBrace, lastBrace + 1)
  return raw
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const { allowed } = await checkVisionRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'extract-syllabus', ip, durationMs: Date.now() - t, fromCache: false, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    apiLog({ route: 'extract-syllabus', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = parseBody(ExtractSyllabusSchema, await req.json().catch(() => null))
  if (!parsed.ok) {
    apiLog({ route: 'extract-syllabus', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
    return parsed.response
  }
  const { text, image } = parsed.data

  try {
    const messages = image
      ? [{ role: 'user' as const, content: [
          { type: 'image_url' as const, image_url: { url: image } },
          { type: 'text'      as const, text: SYSTEM },
        ]}]
      : [{ role: 'user' as const, content: `${SYSTEM}\n\nSyllabus to parse:\n${text}` }]

    const raw = await callAI(messages, { jsonMode: false, temperature: 0.1 })

    if (!raw) {
      apiLog({ route: 'extract-syllabus', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: 'empty AI response' })
      return NextResponse.json({ error: 'AI returned an empty response. Please try again.' }, { status: 500 })
    }

    let result: { topics?: unknown[] }
    try {
      result = JSON.parse(extractJSON(raw))
    } catch {
      apiLog({ route: 'extract-syllabus', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: 'JSON parse failed' })
      return NextResponse.json({ error: 'Could not parse AI response. Try rephrasing your syllabus text.' }, { status: 500 })
    }

    const topics = (result.topics ?? [])
      .map((t: unknown, i: number) => {
        const row = t as Record<string, unknown>
        const rawSubs = Array.isArray(row.subTopics) ? row.subTopics : []
        return {
          topic:       String(row.topic      ?? `Unit ${i + 1}`).trim(),
          description: String(row.description ?? '').trim(),
          weekNumber:  Number.isInteger(row.weekNumber) ? (row.weekNumber as number) : i + 1,
          subTopics:   rawSubs.map((s: unknown) => String(s).trim()).filter(Boolean),
        }
      })
      .filter((t: { topic: string }) => t.topic.length > 0)

    apiLog({ route: 'extract-syllabus', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ topics })
  } catch (err) {
    apiLog({ route: 'extract-syllabus', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Unexpected server error. Please try again.' }, { status: 500 })
  }
}
