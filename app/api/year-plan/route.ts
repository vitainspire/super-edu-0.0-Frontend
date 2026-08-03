import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter } from '@/lib/openrouter'
import { createServerComponentClient } from '@/lib/supabase-server'
import { parseBody, YearPlanSchema } from '@/lib/schemas'
import { apiLog, getClientIp } from '@/lib/logger'
import { apportion, affordableMinSessions } from '@/lib/logic/apportion'

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
    // Prefer the caller's exact figure; weeks × per-week is a lossy reconstruction.
    const totalSessions = parsed.data.totalSessions ?? totalWeeks * sessionsPerWeek

    // A floor of 5/topic is unaffordable once there are more than totalSessions/5
    // topics — 97 topics against 165 sessions needs a floor of 1, not 5. Asking
    // for an impossible floor is what made the model abandon the budget wholesale.
    const requestedMin = parsed.data.minSessionsPerTopic ?? 1
    const minSessions = Math.min(requestedMin, affordableMinSessions(topics.length, totalSessions))
    const feasible = minSessions >= 1

    const avg = totalSessions / topics.length
    const cap = Math.max(minSessions + 1, Math.round(avg * 3))

    // Only warn about tightness when it is actually tight — a 3-topic syllabus
    // with 100 sessions must not be told to keep its allocations small.
    const squeeze = avg < 6
      ? `\nThat is an average of ${avg.toFixed(1)} sessions per topic. This is the real
constraint — this syllabus is large relative to the time available, so most topics
get very few sessions. Do NOT pad allocations toward a "normal-looking" lesson length.`
      : `\nThat is an average of ${avg.toFixed(1)} sessions per topic.`

    const topicList = topics
      .map((t, i) => `${i + 1}. ${t.topic}${t.description ? ` — ${t.description}` : ''}`)
      .join('\n')

    const prompt = `You are helping an Indian school teacher plan their academic year for ${subject}, Grade ${grade}.

Total teaching sessions available: ${totalSessions} (${totalWeeks} weeks × ${sessionsPerWeek} sessions per week)
Number of topics to cover: ${topics.length}
${squeeze}

Topics:
${topicList}

Give each topic a session count reflecting its relative complexity and importance:
- Minor / recap / observation-prompt topics: ${minSessions}
- Typical topics: around ${Math.max(minSessions, Math.round(avg))}
- The few genuinely complex, foundational topics: up to ${cap}
- Never below ${minSessions}
- Aim for a total near ${totalSessions}; relative sizing matters more than the exact sum,
  which is normalised after you reply.

Return ONLY a valid JSON array, one entry per topic, in the same order as the list above:
[
  { "id": "${topics[0]?.id ?? 'id'}", "estimatedSessions": ${Math.max(minSessions, Math.round(avg))}, "rationale": "one short sentence why" },
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

    // Match on id, falling back to position only when the model omits or invents
    // one. Pure index matching silently pins each estimate to the wrong topic the
    // moment the model drops, reorders, or adds an entry.
    const byId = new Map<string, { estimatedSessions: number; rationale: string }>()
    for (const e of aiPlan) {
      if (e && typeof e.id === 'string' && !byId.has(e.id)) byId.set(e.id, e)
    }
    const matched = topics.map((t, i) => byId.get(t.id) ?? aiPlan[i])

    // The model supplies relative sizing; the arithmetic is ours.
    const weights = matched.map(e => {
      const n = Number(e?.estimatedSessions)
      return Number.isFinite(n) && n > 0 ? n : avg
    })
    const allocated = apportion(weights, totalSessions, minSessions)

    const plan = topics.map((t, i) => ({
      id: t.id,
      estimatedSessions: allocated[i],
      rationale: matched[i]?.rationale ?? '',
    }))

    const rawTotal = weights.reduce((a, b) => a + b, 0)
    apiLog({ route: 'year-plan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({
      plan,
      totalSessions,
      minSessionsPerTopic: minSessions,
      // Surfaced so the UI can say "this syllabus does not fit the year" rather
      // than quietly handing back topics with zero sessions.
      feasible,
      // How far the model's own arithmetic was off, for observability.
      modelTotal: Math.round(rawTotal),
    })
  } catch (err) {
    apiLog({ route: 'year-plan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Failed to generate year plan' }, { status: 500 })
  }
}
