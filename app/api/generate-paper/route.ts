import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { parseBody, GeneratePaperSchema } from '@/lib/schemas'

// The teacher drag-and-drop paper builder posts a PaperTemplate (question-type
// blocks + selected topics/subtopics). We turn it into a full paper and return
// it as the same `{ sections: WsSection[] }` shape the worksheet page consumes,
// so print / answer-key / save / marks all work unchanged.
export const maxDuration = 60

const TYPE_LABELS: Record<string, string> = {
  'mcq':           'Multiple Choice Questions',
  'fill-in-blank': 'Fill in the Blanks',
  'short-answer':  'Short Answer Questions',
  'long-answer':   'Long Answer Questions',
  'true-false':    'True or False',
  'match':         'Match the Following',
}

const SECTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

function sectionSchema(type: string, label: string, marksEach: number, count: number): string {
  const head = `{ "type": "${type}", "label": "${label}", "marksEach": ${marksEach}, "questions": [`
  const tail = `, ... (exactly ${count} item${count > 1 ? 's' : ''}) ] }`
  switch (type) {
    case 'mcq':
      return head + `{ "text": "Question?", "options": ["A. First", "B. Second", "C. Third", "D. Fourth"], "answer": "A" }` + tail
    case 'true-false':
      return head + `{ "text": "Statement to judge.", "answer": "True" }` + tail
    case 'match':
      return head + `{ "text": "Match each item in Column A with the correct item in Column B.", "left": ["item 1", "item 2", "item 3"], "right": ["match 1", "match 2", "match 3"], "answer": "1-B, 2-C, 3-A" }` + tail
    default: // fill-in-blank | short-answer | long-answer
      return head + `{ "text": "Question?" }` + tail
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed = parseBody(GeneratePaperSchema, raw)
  if (!parsed.ok) return parsed.response
  const { subject, grade, title, topics, blocks } = parsed.data

  const totalMarks = blocks.reduce((s, b) => s + b.count * b.marksEach, 0)
  const topicNames = topics.map(t => t.topic)

  const topicLines = topics.map(t =>
    t.subtopics.length
      ? `- ${t.topic} (focus on: ${t.subtopics.join('; ')})`
      : `- ${t.topic}`
  ).join('\n')

  const sectionLines = blocks.map((b, i) => {
    const extra = [
      b.difficulty !== 'mixed' ? `${b.difficulty} difficulty` : 'mixed difficulty',
      b.instructions?.trim() ? `note: ${b.instructions.trim()}` : '',
    ].filter(Boolean).join(', ')
    return `Section ${SECTION_LETTERS[i]} — ${TYPE_LABELS[b.type] ?? b.type}: exactly ${b.count} question${b.count > 1 ? 's' : ''} × ${b.marksEach} mark${b.marksEach > 1 ? 's' : ''} each (${extra})`
  }).join('\n')

  const schemas = blocks.map((b, i) =>
    sectionSchema(b.type, `Section ${SECTION_LETTERS[i]} — ${TYPE_LABELS[b.type] ?? b.type}`, b.marksEach, b.count)
  ).join(',\n    ')

  const prompt =
`You are generating a custom school exam paper from a teacher's template.
Subject: ${subject || 'General'} | Grade: ${grade || '5'} | Total: ${totalMarks} marks${title ? ` | Title: ${title}` : ''}

Draw ALL questions from these chapters/topics (and the listed sub-topics where given). Spread questions across the topics; do not cover only the first one:
${topicLines}

Build these sections IN THIS ORDER, matching the template exactly:
${sectionLines}

The teacher's template as JSON (authoritative — respect every count, marksEach, difficulty, and note):
${JSON.stringify({ subject, grade, title, topics, blocks }, null, 2)}

Rules:
- Strictly Grade ${grade || '5'} appropriate — simple, clear, age-appropriate language.
- Honor each section's difficulty and any note.
- MCQ: exactly 4 options ("A. …" … "D. …"); set "answer" to the correct option LETTER only (e.g. "B"). The 3 wrong options must be plausible mistakes a student at this grade could actually make (a common misconception, a close numeric miscalculation, a confusable term) — never random, absurd, or obviously-wrong filler.
- True or False: "text" is a statement; set "answer" to exactly "True" or "False".
- Match the Following: provide "left" and "right" arrays of EQUAL length; "answer" maps each left index to a right letter, e.g. "1-C, 2-A, 3-B". Shuffle "right" so the order does not match "left".
- Fill in the blank: embed "___" in the text where the answer goes.
- Short answer: question only. Long answer: question only, add "(Write 3–4 sentences)".
- Generate EXACTLY the count specified for each section — no more, no fewer.
- No question anywhere in the paper repeats the same specific fact as another, even across sections or topics.

Return ONLY valid JSON, no markdown, no extra text:
{
  "sections": [
    ${schemas}
  ]
}
Before returning: for every section, count its "questions" array and confirm it matches the required count exactly; confirm the sections appear in the same order as specified above.`

  try {
    const text = await callAI([{ role: 'user', content: prompt }], { maxTokens: 4000 })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    const data = JSON.parse(match?.[0] ?? cleaned)
    return NextResponse.json({
      sections: data.sections ?? [],
      topic: topicNames.join(', '),
      totalMarks,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to generate paper' }, { status: 500 })
  }
}
