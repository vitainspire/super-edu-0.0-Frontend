import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

const TYPE_LABELS: Record<string, string> = {
  'mcq':           'Multiple Choice Questions',
  'fill-in-blank': 'Fill in the Blanks',
  'short-answer':  'Short Answer Questions',
  'long-answer':   'Long Answer Questions',
}

const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E']

interface DistRow { type: string; count: number; marksEach: number }

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { topic, subject, grade, distribution } = body as {
    topic: string; subject: string; grade: string; distribution: DistRow[]
  }

  if (!topic?.trim() || !Array.isArray(distribution) || distribution.length === 0) {
    return NextResponse.json({ error: 'topic and distribution are required' }, { status: 400 })
  }

  const totalMarks = distribution.reduce((s, d) => s + d.count * d.marksEach, 0)

  const distLines = distribution.map((d, i) =>
    `Section ${SECTION_LETTERS[i]} — ${TYPE_LABELS[d.type] ?? d.type}: exactly ${d.count} question${d.count > 1 ? 's' : ''} × ${d.marksEach} mark${d.marksEach > 1 ? 's' : ''} each`
  ).join('\n')

  const sectionSchemas = distribution.map((d, i) => {
    const letter = SECTION_LETTERS[i]
    const label = `Section ${letter} — ${TYPE_LABELS[d.type] ?? d.type}`
    if (d.type === 'mcq') {
      return `{ "type": "mcq", "label": "${label}", "marksEach": ${d.marksEach}, "questions": [{ "text": "Question?", "options": ["A. First", "B. Second", "C. Third", "D. Fourth"], "answer": "A" }, ... (exactly ${d.count} items) ] }`
    }
    return `{ "type": "${d.type}", "label": "${label}", "marksEach": ${d.marksEach}, "questions": [{ "text": "Question?" }, ... (exactly ${d.count} items) ] }`
  }).join(',\n    ')

  const prompt =
`You are generating a school exam worksheet.
Subject: ${subject} | Grade: ${grade} | Topic: ${topic} | Total: ${totalMarks} marks

${distLines}

Rules:
- Strictly Grade ${grade} difficulty — simple, clear language.
- MCQ: exactly 4 options each (A, B, C, D). Set "answer" to the correct option letter only (e.g. "B").
- Fill in blank: embed "___" in the question text where the answer goes.
- Short answer: question only, no answer needed.
- Long answer: question only, add "(Write 3–4 sentences)" guidance in the text.
- Generate EXACTLY the count specified for each section — no more, no fewer.

Return ONLY valid JSON, no markdown, no extra text:
{
  "sections": [
    ${sectionSchemas}
  ]
}`

  try {
    const text = await callAI([{ role: 'user', content: prompt }], { maxTokens: 2500 })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match?.[0] ?? cleaned)
    return NextResponse.json({ sections: parsed.sections ?? [], topic: topic.trim(), totalMarks })
  } catch {
    return NextResponse.json({ error: 'Failed to generate worksheet' }, { status: 500 })
  }
}
