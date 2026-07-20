import { NextRequest, NextResponse } from 'next/server'
import { callAI, generateIllustration } from '@/lib/ai'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkVisionRateLimit } from '@/lib/rate-limit'
import { TestStudyGuideSchema, parseBody } from '@/lib/schemas'

// Breaks a test's topic into several focus-area "tabs" and writes comprehensive
// revision material for each in a single AI call, so the student portal can
// render a full study guide without a per-tab round trip. Also generates one
// illustration per focus area (in parallel, after the text call) — image
// generation is 5-10x costlier than text, so this uses the tighter vision
// rate limit, and the serial text + parallel-image calls need a raised timeout.
export const maxDuration = 120

interface StudyTopic {
  name: string
  summary: string
  keyPoints: string[]
  examples: string[]
  commonMistakes: string[]
  practiceQuestions: { question: string; answer: string }[]
  image?: { url: string; caption: string } | null
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkVisionRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed_ = parseBody(TestStudyGuideSchema, rawBody)
  if (!parsed_.ok) return parsed_.response
  const { topic, subject, grade, totalMarks, interests } = parsed_.data

  const interestHint = interests?.length
    ? `Where natural, use examples from: ${interests.slice(0, 2).join(', ')}.`
    : 'Use simple Indian everyday examples (cricket, market, cooking, farming) where helpful.'

  const prompt =
`You are building a complete study guide for a Grade ${grade} student in an Indian government school preparing for an upcoming ${subject} test${totalMarks ? ` worth ${totalMarks} marks` : ''}.
Test topic: ${topic}
${interestHint}

Break this topic into 3-5 focus areas that together comprehensively cover everything the student should revise for this test, ordered from foundational to advanced. For EACH focus area, write:
- "name": a short 2-5 word title for this focus area.
- "summary": 2-3 simple sentences explaining what this focus area covers and why it matters.
- "keyPoints": 3-6 short bullet facts/steps/rules to remember (each under 18 words).
- "examples": 2-3 short worked examples or real-life illustrations of this focus area.
- "commonMistakes": 2-3 short mistakes students often make with this focus area, and how to avoid them.
- "practiceQuestions": exactly 3 practice questions with their answers, ordered easy → medium → hard, matching what could appear on this test.
- "imageQuery": the single best Wikipedia article title for a helpful diagram or photo of this focus area (e.g. "Human heart", "Water cycle"). 1-3 words, a real encyclopedia topic.
- "diagramLabels": 3-6 short labels (1-2 words each) for the main visible parts/steps of this focus area that a labelled diagram should point to. Use plain English words a Grade ${grade} student knows. If this focus area has no distinct visual parts to label (e.g. an abstract idea), return an empty array.

Rules:
- Match Grade ${grade} level — simple language, no jargon.
- Every focus area must be genuinely distinct — do not repeat the same content across focus areas.
- Together, the focus areas should let a student revise this ENTIRE topic without missing anything important.

Return ONLY valid JSON, no markdown, no extra text:
{
  "topics": [
    {
      "name": "...",
      "summary": "...",
      "keyPoints": ["...", "..."],
      "examples": ["...", "..."],
      "commonMistakes": ["...", "..."],
      "practiceQuestions": [{ "question": "...", "answer": "..." }, { "question": "...", "answer": "..." }, { "question": "...", "answer": "..." }],
      "imageQuery": "...",
      "diagramLabels": ["...", "..."]
    }
  ]
}`

  try {
    const topInterest = interests?.[0]?.slice(0, 20).toLowerCase().replace(/\s+/g, '_') ?? 'none'
    const { value } = await withCache(
      ck('test-study-guide-v2', topic.toLowerCase().trim(), subject.toLowerCase().trim(), grade, totalMarks ?? 0, topInterest),
      604800, // 7 days
      async () => {
        // 5 focus areas × (summary + keyPoints + examples + commonMistakes + 3 Q&A pairs)
        // is a much larger structured payload than this app's other AI routes generate,
        // so this needs a bigger budget than test-prep/practice-quiz to avoid truncated JSON.
        const text = await callAI([{ role: 'user', content: prompt }], { maxTokens: 6000 })
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        const match   = cleaned.match(/\{[\s\S]*\}/)
        const parsed  = JSON.parse(match?.[0] ?? cleaned)

        // One illustration per focus area, generated in parallel (not serially —
        // with up to 5 focus areas, a serial chain would blow past maxDuration).
        // generateIllustration never throws; a failed/timed-out image just
        // resolves to null so one bad image can't fail the whole study guide.
        const rawTopics = Array.isArray(parsed?.topics) ? parsed.topics as unknown[] : []
        const topicsWithImages = await Promise.all(rawTopics.map(async (t) => {
          if (t == null || typeof t !== 'object') return t
          const rec = t as Record<string, unknown>
          const imageSubject = typeof rec.imageQuery === 'string' && rec.imageQuery.trim() ? rec.imageQuery.trim() : (typeof rec.name === 'string' ? rec.name : topic)
          const diagramLabels = Array.isArray(rec.diagramLabels)
            ? (rec.diagramLabels as unknown[]).filter((l): l is string => typeof l === 'string' && l.trim().length > 0).slice(0, 6)
            : []
          const imagePrompt = diagramLabels.length > 0
            ? `A clean, simple, colorful flat-vector educational diagram for a Grade ${grade} school student, depicting: ${imageSubject} (${subject}). Clearly label these parts on the diagram: ${diagramLabels.join(', ')} — each label in bold black sans-serif text, spelled exactly as given, connected to its part with a thin leader line. No other text in the image. Friendly, age-appropriate, plain light background.`
            : `A clean, simple, colorful flat-vector educational illustration for a Grade ${grade} school student, depicting: ${imageSubject} (${subject}). No text or labels in the image. Friendly, age-appropriate, plain light background.`
          const generated = await generateIllustration(imagePrompt)
          return { ...rec, image: generated ? { url: generated.url, caption: imageSubject } : null }
        }))

        return { ...parsed, topics: topicsWithImages }
      },
    )

    const rawTopics = Array.isArray(value?.topics) ? value.topics as unknown[] : []
    const topics = rawTopics.reduce<StudyTopic[]>((acc, t) => {
      if (t == null || typeof t !== 'object') return acc
      const rec = t as Record<string, unknown>
      if (typeof rec.name !== 'string' || !rec.name.trim()) return acc
      const strArr = (v: unknown) => Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
      const practiceQuestions = Array.isArray(rec.practiceQuestions)
        ? (rec.practiceQuestions as unknown[]).reduce<{ question: string; answer: string }[]>((qacc, q) => {
            if (q == null || typeof q !== 'object') return qacc
            const qrec = q as Record<string, unknown>
            if (typeof qrec.question === 'string' && qrec.question.trim() && typeof qrec.answer === 'string' && qrec.answer.trim()) {
              qacc.push({ question: qrec.question.trim(), answer: qrec.answer.trim() })
            }
            return qacc
          }, [])
        : []
      const image = rec.image && typeof rec.image === 'object' && typeof (rec.image as Record<string, unknown>).url === 'string'
        ? rec.image as { url: string; caption: string }
        : null
      acc.push({
        name: rec.name.trim(),
        summary: typeof rec.summary === 'string' ? rec.summary.trim() : '',
        keyPoints: strArr(rec.keyPoints),
        examples: strArr(rec.examples),
        commonMistakes: strArr(rec.commonMistakes),
        practiceQuestions,
        image,
      })
      return acc
    }, [])

    if (topics.length === 0) throw new Error('No valid study guide returned by AI')
    return NextResponse.json({ topics })
  } catch (err) {
    console.error('[test-study-guide] generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate study guide' }, { status: 500 })
  }
}
