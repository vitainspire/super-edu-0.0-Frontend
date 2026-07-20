import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter } from '@/lib/openrouter'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { apiLog } from '@/lib/logger'
import { ClassPulseSchema, parseBody } from '@/lib/schemas'

function extractJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) return fenced[1]
  const first = raw.indexOf('{'), last = raw.lastIndexOf('}')
  if (first !== -1 && last !== -1) return raw.slice(first, last + 1)
  return raw
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'class-pulse', ip, fromCache: false, durationMs: 0, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const t = Date.now()
  try {
    let rawBody: unknown
    try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const parsed_ = parseBody(ClassPulseSchema, rawBody)
    if (!parsed_.ok) return parsed_.response
    const { className, subject, grade, students, tests, attendanceRate, topicCoverage } = parsed_.data

    const studentLines = students.map(s =>
      `  - ${s.name}: mastery ${Math.round(s.avgMastery * 100)}%, attendance ${Math.round(s.attendanceRate * 100)}%`
    ).join('\n')

    const testLines = tests.length
      ? tests.map(t => `  - ${t.topic}: class avg ${Math.round((t.avgScore / t.totalMarks) * 100)}%`).join('\n')
      : '  No tests yet.'

    const coverageLines = topicCoverage.length
      ? topicCoverage.map(t => `  - ${t.topic}: ${t.status}`).join('\n')
      : '  No topics taught yet.'

    const prompt = `You are an AI assistant helping an Indian government school teacher understand their class performance.

Class: ${className}
Subject: ${subject}, Grade: ${grade}
Overall attendance rate: ${Math.round(attendanceRate * 100)}%
Number of students: ${students.length}

Student performance overview:
${studentLines}

Test results:
${testLines}

Topic coverage:
${coverageLines}

Write a concise CLASS PULSE REPORT with these FOUR sections:
1. Class Health (1-2 sentences — overall picture, strengths of the class)
2. Concern Areas (which topics or which students need the most attention and why)
3. Wins to Celebrate (something positive — even small — to acknowledge)
4. This Week's Focus (one specific, actionable priority for the teacher this week)

Be warm, specific, and encouraging. No jargon. Suitable for an Indian school context.

Return ONLY valid JSON:
{
  "health": "...",
  "concerns": "...",
  "wins": "...",
  "focus": "..."
}`

    const attendanceBucket = attendanceRate < 0.6 ? 'low' : attendanceRate < 0.85 ? 'mid' : 'high'
    const testKey = tests.map(t => t.topic).sort().join('~')
    const { value: parsed, fromCache } = await withCache(
      ck('class-pulse', className, subject, grade, attendanceBucket, testKey, students.length),
      86400,
      async () => {
        const raw = await callOpenRouter([{ role: 'user', content: prompt }])
        return JSON.parse(extractJSON(raw))
      },
    )
    apiLog({ route: 'class-pulse', ip, fromCache, durationMs: Date.now() - t, status: 'ok' })
    return NextResponse.json(parsed)
  } catch (err) {
    apiLog({ route: 'class-pulse', ip, fromCache: false, durationMs: Date.now() - t, status: 'error', error: String(err) })
    return NextResponse.json({
      health: 'Could not generate pulse at this time.',
      concerns: '',
      wins: '',
      focus: '',
    })
  }
}
