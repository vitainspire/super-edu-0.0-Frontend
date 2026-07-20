import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { createServerComponentClient } from '@/lib/supabase-server'
import { checkVisionRateLimit, getClientIp } from '@/lib/rate-limit'
import { parseBody, GradeImageSchema } from '@/lib/schemas'
import { apiLog } from '@/lib/logger'

// The AI call below uses a 90s timeoutMs — without a matching maxDuration the
// platform could kill the function before that timeout ever fires.
export const maxDuration = 90

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    apiLog({ route: 'grade-image', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { allowed } = await checkVisionRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'grade-image', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'rate_limited' })
    return NextResponse.json({ error: 'Rate limit exceeded. Try again in an hour.' }, { status: 429 })
  }

  const parsed = parseBody(GradeImageSchema, await req.json().catch(() => null))
  if (!parsed.ok) {
    apiLog({ route: 'grade-image', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
    return parsed.response
  }
  const { imageBase64, students, totalMarks, topic } = parsed.data

  try {
    const studentList = students.map((s, i) => `${i + 1}. ${s.name} (id: ${s.id})`).join('\n')

    const prompt = `You are helping a teacher grade student test papers.

Topic: ${topic}
Total marks: ${totalMarks}

The image shows a mark sheet or student answer paper. Extract the score for each student listed below.
Also add a short observation/feedback if anything is visible (e.g. "left Q3 blank", "calculation errors", "good work", "skipped last question"). Keep feedback under 10 words. If nothing notable, leave feedback as an empty string.

Students:
${studentList}

Return ONLY valid JSON:
{
  "entries": [
    { "studentId": "...", "score": 0, "feedback": "" }
  ]
}

Rules:
- score must be a number between 0 and ${totalMarks}
- Only include students whose score you can clearly read
- studentId must exactly match one of the ids above
- feedback is optional — empty string if nothing notable visible`

    const raw = await callAI([{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageBase64 } },
        { type: 'text',      text: prompt },
      ],
    }], { temperature: 0.2, timeoutMs: 90_000 })

    let parsed2: { entries?: unknown[] }
    try {
      parsed2 = JSON.parse(raw)
    } catch {
      apiLog({ route: 'grade-image', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: 'JSON parse failed' })
      return NextResponse.json({ entries: [] })
    }

    const entries = (parsed2.entries ?? [])
      .filter(
        (e: unknown) => {
          const r = e as { studentId: string; score: number }
          return typeof r.score === 'number' && r.score >= 0 && r.score <= totalMarks && students.some(s => s.id === r.studentId)
        }
      )
      .map((e: unknown) => {
        const r = e as { studentId: string; score: number; feedback?: string }
        return { studentId: r.studentId, score: r.score, feedback: typeof r.feedback === 'string' ? r.feedback.trim() : '' }
      })

    apiLog({ route: 'grade-image', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ entries })
  } catch (err) {
    const msg = String(err)
    apiLog({ route: 'grade-image', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: msg })
    if (msg.startsWith('[ai]')) {
      return NextResponse.json({ error: 'AI service temporarily unavailable. Please retry shortly.' }, { status: 503 })
    }
    return NextResponse.json({ entries: [] })
  }
}
