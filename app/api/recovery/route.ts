import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter } from '@/lib/openrouter'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { apiLog } from '@/lib/logger'
import { RecoverySchema, parseBody } from '@/lib/schemas'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'recovery', ip, fromCache: false, durationMs: 0, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const t = Date.now()
  try {
    let rawBody: unknown
    try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const parsed_ = parseBody(RecoverySchema, rawBody)
    if (!parsed_.ok) return parsed_.response
    const { grade, topic, attempts, previousApproaches, studentName } = parsed_.data

    const helped    = previousApproaches?.filter(a => a.helped === true)  ?? []
    const notHelped = previousApproaches?.filter(a => a.helped === false) ?? []
    const partial   = previousApproaches?.filter(a => a.helped === null)  ?? []

    let prevList: string
    if (!previousApproaches?.length) {
      prevList = '\nNo previous approaches tried yet.'
    } else {
      const lines = previousApproaches.map((a, i) => {
        const outcome = a.helped === true ? '✓ helped' : a.helped === false ? '✗ did not help' : '~ partially helped'
        return `${i + 1}. [${outcome}] ${a.approachUsed}`
      }).join('\n')
      const guidance: string[] = ['\nPrevious approaches and outcomes:\n' + lines]
      if (notHelped.length)  guidance.push(`⚠ These ${notHelped.length} approach(es) did NOT help — avoid similar styles.`)
      if (partial.length)    guidance.push(`These ${partial.length} approach(es) partially helped — try a different angle that builds on what worked.`)
      if (helped.length)     guidance.push(`${helped.length} approach(es) previously helped — the student CAN learn this; try an equally strong but genuinely different angle.`)
      prevList = guidance.join('\n')
    }

    const prompt = `A Grade ${grade} student named ${studentName} in a rural Indian school has tried to understand "${topic}" ${attempts} time(s) without full success.
${prevList}

Generate ONE completely new explanation approach that:
1. Uses a real-life Indian example — from cricket, food, farming, festivals, or daily village life
2. Can be explained verbally in class — no materials or equipment needed
3. Is genuinely different from all previous approaches listed above
4. If any previous approach partially or fully helped, note what worked and take it further from a fresh angle
5. Ends with one short question the teacher can ask to immediately check if the student understood

Return valid JSON only:
{
  "explanation": "The new explanation approach (2-4 sentences)",
  "example": "The specific real-life Indian example to use (1-2 sentences)",
  "checkQuestion": "One short question to ask the student to check understanding"
}`

    const prevKey = (previousApproaches ?? [])
      .map(a => `${a.approachUsed}:${a.helped ?? 'null'}`)
      .sort().join('~~')
    const { value: parsed, fromCache } = await withCache(
      ck('recovery', topic.toLowerCase().trim(), grade, attempts, prevKey),
      604800,
      async () => {
        const result = await callOpenRouter([{ role: 'user', content: prompt }])
        return JSON.parse(result)
      },
    )
    apiLog({ route: 'recovery', ip, fromCache, durationMs: Date.now() - t, status: 'ok' })
    return NextResponse.json(parsed)
  } catch (err) {
    apiLog({ route: 'recovery', ip, fromCache: false, durationMs: Date.now() - t, status: 'error', error: String(err) })
    return NextResponse.json(
      {
        explanation: 'Try explaining the concept using a story from everyday life.',
        example: 'Use something the student sees every day — like dividing a roti equally.',
        checkQuestion: 'Can you show me on your fingers how you would divide this?',
      },
      { status: 200 }
    )
  }
}
