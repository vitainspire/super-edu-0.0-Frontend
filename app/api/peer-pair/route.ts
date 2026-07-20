import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter } from '@/lib/openrouter'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { apiLog } from '@/lib/logger'
import { PeerPairSchema, parseBody } from '@/lib/schemas'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'peer-pair', ip, fromCache: false, durationMs: 0, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const t = Date.now()
  try {
    let rawBody: unknown
    try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const parsed_ = parseBody(PeerPairSchema, rawBody)
    if (!parsed_.ok) return parsed_.response
    const { students, topic, subject } = parsed_.data

    if (students.length < 2) {
      return NextResponse.json({ pairs: [], activity: '' })
    }

    const studentList = students.map((s, i) =>
      `${i + 1}. ${s.name} (mastery: ${Math.round(s.avgMastery * 100)}%, interests: ${s.interests.slice(0, 3).join(', ') || 'none'}, goal: ${s.goal || 'none'})`
    ).join('\n')

    const prompt = `You are an AI assistant helping a teacher in an Indian government school create peer learning pairs.

Topic: ${topic}
Subject: ${subject}

Students (with mastery level and interests):
${studentList}

Create peer pairs where a stronger student (higher mastery) is paired with a weaker student (lower mastery) who shares at least one interest or similar goal. This helps the stronger student reinforce knowledge while the weaker student gets relatable peer support.

Rules:
- Pair students with DIFFERENT mastery levels (ideally one >60% with one <50%)
- Prefer pairs who share an interest or similar goal
- Every student should be in exactly one pair (if odd number, one group of 3 is fine)
- For each pair, suggest a SHORT, specific peer activity (1 sentence, 15 words max) the teacher can assign

Return ONLY valid JSON:
{
  "pairs": [
    {
      "mentor": "student name",
      "mentee": "student name",
      "sharedInterest": "what they share (or 'different interests')",
      "activity": "one sentence activity suggestion"
    }
  ]
}`

    const studentKey = students.map(s => s.id).sort().join('~')
    const { value: parsed, fromCache } = await withCache(
      ck('peer-pair', topic.toLowerCase().trim(), subject.toLowerCase().trim(), studentKey),
      86400,
      async () => {
        const raw = await callOpenRouter([{ role: 'user', content: prompt }])
        return JSON.parse(raw)
      },
    )
    apiLog({ route: 'peer-pair', ip, fromCache, durationMs: Date.now() - t, status: 'ok' })
    return NextResponse.json({ pairs: parsed.pairs ?? [] })
  } catch (err) {
    apiLog({ route: 'peer-pair', ip, fromCache: false, durationMs: Date.now() - t, status: 'error', error: String(err) })
    return NextResponse.json({ pairs: [] })
  }
}
