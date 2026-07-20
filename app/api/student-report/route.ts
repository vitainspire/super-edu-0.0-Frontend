import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter } from '@/lib/openrouter'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { apiLog } from '@/lib/logger'
import { StudentReportSchema, parseBody } from '@/lib/schemas'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'student-report', ip, fromCache: false, durationMs: 0, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const t = Date.now()
  try {
    let rawBody: unknown
    try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const parsed_ = parseBody(StudentReportSchema, rawBody)
    if (!parsed_.ok) return parsed_.response
    const { student, marks, mastery, attendanceRate, warnings, subject, grade } = parsed_.data

    const marksSummary = marks.length
      ? marks.map(m => `  - ${m.topic}: ${m.score}/${m.totalMarks} (${Math.round((m.score / m.totalMarks) * 100)}%)`).join('\n')
      : '  No assessments yet.'

    const masterySummary = mastery.length
      ? mastery.map(m => `  - ${m.topic}: mastery ${Math.round(m.mastery * 100)}% (${m.attempts} attempt${m.attempts !== 1 ? 's' : ''})`).join('\n')
      : '  No mastery data.'

    const warningText = warnings.length
      ? warnings.map(w => `  [${w.level}] ${w.reason}`).join('\n')
      : '  None.'

    const prompt = `You are a compassionate AI assistant helping an Indian government school teacher write a student progress report.

Student: ${student.name} (Roll #${student.rollNumber})
Grade: ${grade}, Subject: ${subject}
Interests: ${student.interests.join(', ') || 'not recorded'}
Goal/Ambition: ${student.goal || 'not recorded'}
Overall Attendance: ${Math.round(attendanceRate * 100)}%

Assessment Results:
${marksSummary}

Topic Mastery:
${masterySummary}

Flags/Warnings:
${warningText}

Write a warm, encouraging student progress report with these FOUR sections:
1. Overall Summary (2 sentences — performance snapshot)
2. Strengths (1-2 specific topics or skills where the student is doing well)
3. Areas for Growth (1-2 topics that need more practice — be encouraging, not harsh)
4. Recommendation (one actionable suggestion for teacher or student, linking to the student's interests/goal if possible)

Keep it simple, clear, and suitable for an Indian school context. No jargon.

Return ONLY valid JSON:
{
  "summary": "...",
  "strengths": "...",
  "growth": "...",
  "recommendation": "..."
}`

    const attendanceBucket = attendanceRate < 0.6 ? 'low' : attendanceRate < 0.85 ? 'mid' : 'high'
    const { value: parsed, fromCache } = await withCache(
      ck('student-report', student.rollNumber, grade, subject, marks.length, mastery.length, attendanceBucket, warnings.length),
      604800,
      async () => {
        const raw = await callOpenRouter([{ role: 'user', content: prompt }])
        return JSON.parse(raw)
      },
    )
    apiLog({ route: 'student-report', ip, fromCache, durationMs: Date.now() - t, status: 'ok' })
    return NextResponse.json(parsed)
  } catch (err) {
    apiLog({ route: 'student-report', ip, fromCache: false, durationMs: Date.now() - t, status: 'error', error: String(err) })
    return NextResponse.json({
      summary: 'Could not generate report at this time.',
      strengths: '',
      growth: '',
      recommendation: '',
    })
  }
}
