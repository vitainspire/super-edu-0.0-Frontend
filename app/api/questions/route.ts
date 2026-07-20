import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter } from '@/lib/openrouter'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'
import { apiLog } from '@/lib/logger'
import { QuestionsSchema, parseBody } from '@/lib/schemas'

type QuestionType = 'mcq' | 'fill-in-blank' | 'short-answer' | 'long-answer'

interface Section {
  marks: number
  count: number
  difficulty: 'easy' | 'medium' | 'hard'
  type: QuestionType
  label: string
}

// Subjective-only patterns (short-answer + long-answer)
const PATTERNS: Record<number, Section[]> = {
  10: [
    { marks: 2, count: 3, difficulty: 'easy',   type: 'short-answer', label: 'Short Answer' },
    { marks: 4, count: 1, difficulty: 'hard',   type: 'long-answer',  label: 'Long Answer'  },
  ],
  20: [
    { marks: 2, count: 4, difficulty: 'easy',   type: 'short-answer', label: 'Short Answer' },
    { marks: 6, count: 2, difficulty: 'hard',   type: 'long-answer',  label: 'Long Answer'  },
  ],
  25: [
    { marks: 3, count: 5, difficulty: 'medium', type: 'short-answer', label: 'Short Answer' },
    { marks: 5, count: 2, difficulty: 'hard',   type: 'long-answer',  label: 'Long Answer'  },
  ],
  50: [
    { marks: 4, count: 5, difficulty: 'medium', type: 'short-answer', label: 'Short Answer' },
    { marks: 6, count: 5, difficulty: 'hard',   type: 'long-answer',  label: 'Long Answer'  },
  ],
  100: [
    { marks: 4,  count: 10, difficulty: 'medium', type: 'short-answer', label: 'Short Answer' },
    { marks: 12, count: 5,  difficulty: 'hard',   type: 'long-answer',  label: 'Long Answer'  },
  ],
}

function getPattern(totalMarks: number): Section[] {
  const supported = [10, 20, 25, 50, 100]
  const closest = supported.reduce((a, b) =>
    Math.abs(b - totalMarks) < Math.abs(a - totalMarks) ? b : a
  )
  return PATTERNS[closest]
}



export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'questions', ip, fromCache: false, durationMs: 0, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }
  const t = Date.now()
  try {
    let rawBody: unknown
    try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const parsed_ = parseBody(QuestionsSchema, rawBody)
    if (!parsed_.ok) return parsed_.response
    const { subject, topic, grade, totalMarks } = parsed_.data
    const marks   = parseInt(String(totalMarks)) || 10
    const pattern = getPattern(marks)
    const total   = pattern.reduce((s, p) => s + p.marks * p.count, 0)

    const sectionLines = pattern.map((s, i) =>
      `  Section ${String.fromCharCode(65 + i)} — ${s.label}: ${s.count} question${s.count > 1 ? 's' : ''} × ${s.marks} mark${s.marks > 1 ? 's' : ''} each (${s.type}, difficulty: ${s.difficulty})`
    ).join('\n')

    const prompt = `Generate a ${total}-mark subjective exam paper for Grade ${grade} ${subject} on the topic: "${topic}".

Paper structure — follow EXACTLY (correct count and marks per section):
${sectionLines}
Total: ${total} marks

Rules:
- short-answer: question requires a 2-4 sentence written response. "answer" = model answer (2-4 sentences). "keywords" = 3-5 key terms a teacher would look for when grading.
- long-answer: question requires a detailed paragraph response. "answer" = full model answer paragraph (5-8 sentences).
- Simple language for Grade ${grade} students in Indian schools
- Use Indian contexts (farming, cricket, food, festivals, Indian cities, rupees)
- Self-contained questions only — no "refer to diagram" or "as discussed"
- Follow section counts exactly — no MCQ, no fill-in-the-blank

Return valid JSON only — no markdown, no extra text:
{
  "questions": [
    { "text": "Why is the Sun important for life on Earth?", "type": "short-answer", "difficulty": "easy", "marks": 2, "options": [], "answer": "The Sun provides light and heat needed for plants to grow and for humans to stay warm. Without the Sun, life on Earth would not be possible.", "keywords": ["light", "heat", "energy", "plants"] },
    { "text": "Describe the water cycle and explain why it is important for living things.", "type": "long-answer", "difficulty": "hard", "marks": 4, "options": [], "answer": "The water cycle is the continuous movement of water...", "keywords": [] }
  ]
}`

    const { value: parsed, fromCache } = await withCache(
      ck('questions', 'v4-subj', topic.toLowerCase().trim(), grade, total),
      2592000,
      async () => {
        const result = await callOpenRouter([{ role: 'user', content: prompt }])
        return JSON.parse(result)
      },
    )
    apiLog({ route: 'questions', ip, fromCache, durationMs: Date.now() - t, status: 'ok' })
    return NextResponse.json(parsed)
  } catch (err) {
    apiLog({ route: 'questions', ip, fromCache: false, durationMs: Date.now() - t, status: 'error', error: String(err) })
    return NextResponse.json({ questions: [] }, { status: 500 })
  }
}
