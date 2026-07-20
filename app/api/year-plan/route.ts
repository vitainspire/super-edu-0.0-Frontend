import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter } from '@/lib/openrouter'
import { createServerComponentClient } from '@/lib/supabase-server'
import { parseBody, YearPlanSchema } from '@/lib/schemas'
import { apiLog, getClientIp } from '@/lib/logger'

function extractJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) return fenced[1]
  const first = raw.indexOf('['), last = raw.lastIndexOf(']')
  if (first !== -1 && last !== -1) return raw.slice(first, last + 1)
  return raw
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    apiLog({ route: 'year-plan', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = parseBody(YearPlanSchema, await req.json().catch(() => null))
  if (!parsed.ok) {
    apiLog({ route: 'year-plan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
    return parsed.response
  }
  const { topics, totalWeeks, sessionsPerWeek, subject, grade } = parsed.data

  try {
    const totalSessions = totalWeeks * sessionsPerWeek
    const topicList = topics
      .map((t, i) => `${i + 1}. ${t.topic}${t.description ? ` — ${t.description}` : ''}`)
      .join('\n')

    const prompt = `You are helping an Indian school teacher plan their academic year for ${subject}, Grade ${grade}.

Total teaching sessions available: ${totalSessions} (${totalWeeks} weeks × ${sessionsPerWeek} sessions per week)
Number of topics to cover: ${topics.length}

Topics:
${topicList}

Assign a realistic number of sessions to each topic based on its complexity and importance.
- Simple/short topics: 8–12 sessions
- Medium topics: 12–18 sessions
- Complex/foundational topics: 18–25 sessions
- The total MUST add up to exactly ${totalSessions}
- Every topic must get at least 5 sessions

Return ONLY a valid JSON array in this exact order (same order as the topics above):
[
  { "id": "${topics[0]?.id ?? 'id'}", "estimatedSessions": 15, "rationale": "one short sentence why" },
  ...
]`

    const raw = await callOpenRouter([{ role: 'user', content: prompt }])

    let aiPlan: Array<{ id: string; estimatedSessions: number; rationale: string }>
    try {
      aiPlan = JSON.parse(extractJSON(raw))
      if (!Array.isArray(aiPlan)) throw new Error('not an array')
    } catch {
      apiLog({ route: 'year-plan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: 'JSON parse failed' })
      return NextResponse.json({ error: 'Failed to parse year plan' }, { status: 500 })
    }

    const fallback = Math.round(totalSessions / topics.length)
    const plan = topics.map((t, i) => ({
      id: t.id,
      estimatedSessions: (aiPlan[i]?.estimatedSessions > 0) ? aiPlan[i].estimatedSessions : fallback,
      rationale: aiPlan[i]?.rationale ?? '',
    }))

    apiLog({ route: 'year-plan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ plan })
  } catch (err) {
    apiLog({ route: 'year-plan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Failed to generate year plan' }, { status: 500 })
  }
}
