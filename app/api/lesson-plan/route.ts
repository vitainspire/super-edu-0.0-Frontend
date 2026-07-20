import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter } from '@/lib/openrouter'
import { createServerComponentClient } from '@/lib/supabase-server'
import { parseBody, LessonPlanSchema } from '@/lib/schemas'
import { apiLog, getClientIp } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    apiLog({ route: 'lesson-plan', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = parseBody(LessonPlanSchema, await req.json().catch(() => null))
  if (!parsed.ok) {
    apiLog({ route: 'lesson-plan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
    return parsed.response
  }
  const { topics, className, subject, studentInterests } = parsed.data

  try {
    const pending = topics.filter(t => !t.isCompleted)
    const done    = topics.filter(t => t.isCompleted).length

    const topicList = pending
      .slice(0, 10)
      .map((t, i) => `${i + 1}. ${t.topic}${t.description ? ` (${t.description})` : ''}${t.weekNumber ? ` [Week ${t.weekNumber}]` : ''}`)
      .join('\n')

    const interestLine = studentInterests.length > 0
      ? `Class interests: ${studentInterests.slice(0, 5).join(', ')}`
      : 'Student interests not recorded yet'

    const prompt = `You are helping a teacher at an Indian government school plan their lessons.

Class: ${className}
Subject: ${subject}
${interestLine}
Topics completed so far: ${done}

Remaining syllabus topics (up to 10):
${topicList || 'No pending topics'}

Create a practical week-by-week lesson plan for the NEXT 4 weeks covering the pending topics above.
For each week:
- Assign 1-2 topics
- Write one short teaching tip (max 20 words) connecting the topic to the students' interests
- Suggest one quick activity or example (max 15 words)

Be warm, practical, and specific. No jargon.

Return ONLY valid JSON:
{
  "weeks": [
    {
      "week": 1,
      "topics": ["topic name"],
      "tip": "short teaching tip using student interests",
      "activity": "quick activity or example"
    }
  ]
}`

    const raw = await callOpenRouter([{ role: 'user', content: prompt }])

    let result: { weeks?: unknown[] }
    try {
      result = JSON.parse(raw)
    } catch {
      apiLog({ route: 'lesson-plan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: 'JSON parse failed' })
      return NextResponse.json({ weeks: [] })
    }

    apiLog({ route: 'lesson-plan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json(result)
  } catch (err) {
    apiLog({ route: 'lesson-plan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ weeks: [] }, { status: 200 })
  }
}
