import { NextRequest, NextResponse } from 'next/server'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { apiLog } from '@/lib/logger'
import { BriefingSchema, parseBody } from '@/lib/schemas'
import { callAI } from '@/lib/ai'
import { withCache, ck } from '@/lib/server-cache'

// callAI's primary+fallback retry chain can take up to ~90s on failure.
export const maxDuration = 60

interface ClassPoint {
  label: string
  lastTopic: string | null
  lastSubTopics: string[]
  absentCount: number | null
  nextTopic: string | null
  nextSubTopic: string | null
  atRiskCount: number
  hasSession: boolean
}

interface BriefingPriority {
  urgent: boolean
  message: string
}

function buildClassPoint(c: {
  grade: string
  section: string
  studentCount: number
  nextTopic?: string | null
  nextSubTopic?: string | null
  lastSubTopics?: string[]
  atRiskCount: number
  lastSession?: { topic: string; date: string; absentCount: number } | null
}): ClassPoint {
  return {
    label:         `Grade ${c.grade}${c.section ? ` · ${c.section}` : ''}`,
    lastTopic:     c.lastSession?.topic ?? null,
    lastSubTopics: c.lastSubTopics ?? [],
    absentCount:   c.lastSession ? c.lastSession.absentCount : null,
    nextTopic:     c.nextTopic ?? null,
    nextSubTopic:  c.nextSubTopic ?? null,
    atRiskCount:   c.atRiskCount,
    hasSession:    !!c.lastSession,
  }
}

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
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'briefing', ip, fromCache: false, durationMs: 0, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const t = Date.now()
  try {
    let rawBody: unknown
    try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const parsed_ = parseBody(BriefingSchema, rawBody)
    if (!parsed_.ok) return parsed_.response
    const { classData, teacherName } = parsed_.data

    const points = classData.map(buildClassPoint)
    const name = (teacherName || 'Teacher').split(' ')[0]
    const greeting = `Good morning, ${name}! Here's your day at a glance.`

    // Only generate AI priorities if there are named at-risk students
    const hasAtRisk = classData.some(c => (c.atRiskStudents?.length ?? 0) > 0)
    if (!hasAtRisk) {
      apiLog({ route: 'briefing', ip, fromCache: false, durationMs: Date.now() - t, status: 'ok' })
      return NextResponse.json({ greeting, points, priorities: [] })
    }

    const today = new Date().toISOString().slice(0, 10)
    const atRiskFp = classData.map(c => `${c.grade}${c.section}:${c.atRiskCount}`).join('|')
    const cacheKey = ck('briefing', teacherName, today, atRiskFp)

    const { value: priorities } = await withCache<BriefingPriority[]>(cacheKey, 86400, async () => {
      const classLines = classData.map(c => {
        const label     = `Grade ${c.grade}${c.section ? ` ${c.section}` : ''} (${c.studentCount} students)`
        const nextLine  = c.nextTopic ? `Next topic: ${c.nextTopic}` : 'No upcoming topic set'
        const pacingLine = (c.completedTopics != null && c.totalTopics != null && c.totalTopics > 0)
          ? `Syllabus: ${c.completedTopics}/${c.totalTopics} topics done`
          : ''
        const lastLine  = c.lastSession
          ? `Last class: ${c.lastSession.topic} (${c.lastSession.date}), ${c.lastSession.absentCount} absent`
          : 'No previous sessions'
        const studentLines = (c.atRiskStudents ?? [])
          .map(s => {
            const tag = s.absenteeType === 'chronic' ? '[CHRONIC ABSENTEE]' : '[rare absentee]'
            return `  - ${s.name} ${tag}: ${s.warning}${s.topic ? ` (topic: ${s.topic})` : ''}`
          })
          .join('\n')

        return [label, nextLine, pacingLine, lastLine, studentLines ? `At-risk students:\n${studentLines}` : '']
          .filter(Boolean).join('\n')
      }).join('\n\n')

      const prompt =
        `You are helping a teacher in an Indian government school plan their day.\n\n` +
        `Teacher: ${teacherName}\n\n` +
        `CLASS OVERVIEW:\n${classLines}\n\n` +
        `Write 3–5 specific, named action items for today. Rules:\n` +
        `- Name a specific student and exactly what to do — no vague advice\n` +
        `- One sentence per item, maximum\n` +
        `- Chronic absentees: suggest catchup plan or one-on-one check\n` +
        `- Rare absentees: suggest quick topic recap today\n` +
        `- If a topic was missed by multiple at-risk students, prioritise re-explaining it first\n` +
        `- Mark urgent=true only for chronic absentees or students failing the same topic\n\n` +
        `Return JSON only:\n` +
        `{ "priorities": [{ "urgent": true, "message": "Raju has missed 7 sessions overall — generate a catchup plan for Fractions before today's class." }] }`

      const raw = await callAI([{ role: 'user', content: prompt }], { temperature: 0.4 })
      if (!raw) return []

      try {
        const parsed = JSON.parse(extractJSON(raw)) as { priorities?: BriefingPriority[] }
        if (!Array.isArray(parsed.priorities)) return []
        return parsed.priorities.slice(0, 6).map(p => ({
          urgent:  !!p.urgent,
          message: String(p.message ?? ''),
        }))
      } catch {
        return []
      }
    })

    apiLog({ route: 'briefing', ip, fromCache: false, durationMs: Date.now() - t, status: 'ok' })
    return NextResponse.json({ greeting, points, priorities: priorities ?? [] })
  } catch (err) {
    apiLog({ route: 'briefing', ip, fromCache: false, durationMs: Date.now() - t, status: 'error', error: String(err) })
    return NextResponse.json({ greeting: '', points: [], priorities: [] }, { status: 500 })
  }
}
