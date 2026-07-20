import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

interface WsQuestion { text: string; options?: string[]; answer?: string }
interface WsSection  { type: string; label: string; marksEach: number; questions: WsQuestion[] }

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { topic, subject, grade, sections } = body as {
    topic: string; subject: string; grade: string; sections: WsSection[]
  }

  if (!topic?.trim() || !Array.isArray(sections) || sections.length === 0) {
    return NextResponse.json({ error: 'topic and sections are required' }, { status: 400 })
  }

  // Build question list for the prompt — skip MCQ (already have answers)
  const items: { key: string; type: string; label: string; text: string }[] = []
  sections.forEach((sec, si) => {
    sec.questions.forEach((q, qi) => {
      if (sec.type !== 'mcq') {
        items.push({ key: `${si}-${qi}`, type: sec.type, label: sec.label, text: q.text })
      }
    })
  })

  if (items.length === 0) {
    // Only MCQ — return empty (caller has them already)
    return NextResponse.json({ answerKey: {} })
  }

  const prompt =
`You are generating answer keys for a Grade ${grade} ${subject} worksheet on "${topic}".

For each question below, write a concise, grade-appropriate answer.
- fill-in-blank: one or two words that fill the blank
- short-answer: 1-2 sentence answer with key facts
- long-answer: 4-5 bullet points or a short paragraph with the main marking points

Questions:
${items.map((it, i) => `${i + 1}. [${it.type}] ${it.text}`).join('\n')}

Return ONLY valid JSON, no markdown:
{
  "answers": [
    { "key": "${items[0]?.key ?? '0-0'}", "answer": "..." },
    ...
  ]
}`

  try {
    const text = await callAI([{ role: 'user', content: prompt }], { maxTokens: 1500 })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const match   = cleaned.match(/\{[\s\S]*\}/)
    const parsed  = JSON.parse(match?.[0] ?? cleaned)
    const answerKey: Record<string, string> = {}
    for (const a of (parsed.answers ?? [])) {
      if (a.key && a.answer) answerKey[a.key] = a.answer
    }
    // Merge MCQ answers from sections
    sections.forEach((sec, si) => {
      if (sec.type === 'mcq') {
        sec.questions.forEach((q, qi) => {
          if (q.answer) answerKey[`${si}-${qi}`] = q.answer
        })
      }
    })
    return NextResponse.json({ answerKey })
  } catch {
    return NextResponse.json({ error: 'Failed to generate answer key' }, { status: 500 })
  }
}
