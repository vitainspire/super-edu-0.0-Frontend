import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter } from '@/lib/openrouter'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { apiLog } from '@/lib/logger'
import { PotentialSchema, parseBody } from '@/lib/schemas'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'potential', ip, fromCache: false, durationMs: 0, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const t = Date.now()
  try {
    let rawBody: unknown
    try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const parsed_ = parseBody(PotentialSchema, rawBody)
    if (!parsed_.ok) return parsed_.response
    const { signal, studentName } = parsed_.data

    const prompt = `Write ONE short sentence for a teacher about this student's hidden potential.
Be specific, positive, and encouraging. Maximum 20 words. No jargon.

Student name: ${studentName}
Signal type: ${signal.type}
Data: ${JSON.stringify(signal.data)}

Return valid JSON only: { "sentence": "Your sentence here." }`

    const { value: parsed, fromCache } = await withCache(
      ck('potential', signal.type, JSON.stringify(signal.data)),
      604800,
      async () => {
        const result = await callOpenRouter([{ role: 'user', content: prompt }])
        return JSON.parse(result)
      },
    )
    apiLog({ route: 'potential', ip, fromCache, durationMs: Date.now() - t, status: 'ok' })
    return NextResponse.json(parsed)
  } catch (err) {
    apiLog({ route: 'potential', ip, fromCache: false, durationMs: Date.now() - t, status: 'error', error: String(err) })
    return NextResponse.json({ sentence: '' }, { status: 200 })
  }
}
