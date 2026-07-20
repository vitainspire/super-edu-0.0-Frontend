import { NextRequest, NextResponse } from 'next/server'
import { callAI, generateIllustration } from '@/lib/ai'
import { withCache, ck } from '@/lib/server-cache'
import { getClientIp, checkVisionRateLimit } from '@/lib/rate-limit'
import { TestPrepSchema, parseBody } from '@/lib/schemas'

// Generates an illustration on every cache miss — image generation is 5-10x
// costlier than text, so this uses the tighter vision rate limit, and the
// serial text+image AI calls (up to ~90s + ~30s) need a raised function timeout.
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkVisionRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parsed_ = parseBody(TestPrepSchema, rawBody)
  if (!parsed_.ok) return parsed_.response
  const { topic, subject, grade, interests } = parsed_.data

  const interestHint = interests?.length
    ? `Where natural, use examples from: ${interests.slice(0, 2).join(', ')}.`
    : 'Use simple Indian everyday examples (cricket, market, cooking, farming) where helpful.'

  const prompt =
`You are helping a Grade ${grade} student in an Indian government school prepare for an upcoming test in ${subject}.
Test topic: ${topic}
${interestHint}

Produce focused revision material to help them prepare, organized as 3–5 short "sections":
- The first section must be a brief intro: { "heading": short 2–4 word heading, "body": 1–2 simple sentences recapping what this topic is about }.
- Later sections should cover the key facts, parts, or steps as: { "heading": short 2–4 word heading, "bullets": 3–6 short points (each under 15 words) }.
- Each section has EITHER "body" OR "bullets", never both.
- "imageQuery": the single best Wikipedia article title for a helpful diagram or photo of this concept (e.g. "Human heart", "Water cycle", "Human body"). 1–3 words, a real encyclopedia topic.
- "diagramLabels": 3–6 short labels (1–2 words each, e.g. "Roots", "Stem", "Leaves") for the main visible parts/steps of this concept that a labelled diagram should point to. Use plain English words a Grade ${grade} student knows. If this concept has no distinct visual parts to label (e.g. an abstract idea), return an empty array.

Rules:
- Match Grade ${grade} level — simple language, no jargon.

Return ONLY valid JSON, no markdown, no extra text:
{
  "sections": [
    { "heading": "...", "body": "..." },
    { "heading": "...", "bullets": ["...", "..."] }
  ],
  "imageQuery": "...",
  "diagramLabels": ["...", "..."]
}`

  try {
    const topInterest = interests?.[0]?.slice(0, 20).toLowerCase().replace(/\s+/g, '_') ?? 'none'
    const { value } = await withCache(
      ck('test-prep-v9', topic.toLowerCase().trim(), subject.toLowerCase().trim(), grade, topInterest),
      604800, // 7 days
      async () => {
        const text = await callAI([{ role: 'user', content: prompt }], { maxTokens: 1100 })
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        const match   = cleaned.match(/\{[\s\S]*\}/)
        const parsed  = JSON.parse(match?.[0] ?? cleaned)
        const imageSubject = typeof parsed?.imageQuery === 'string' && parsed.imageQuery.trim() ? parsed.imageQuery.trim() : topic
        const diagramLabels = Array.isArray(parsed?.diagramLabels)
          ? (parsed.diagramLabels as unknown[]).filter((l): l is string => typeof l === 'string' && l.trim().length > 0).slice(0, 6)
          : []
        const imagePrompt = diagramLabels.length > 0
          ? `A clean, simple, colorful flat-vector educational diagram for a Grade ${grade} school student, depicting: ${imageSubject} (${subject}). Clearly label these parts on the diagram: ${diagramLabels.join(', ')} — each label in bold black sans-serif text, spelled exactly as given, connected to its part with a thin leader line. No other text in the image. Friendly, age-appropriate, plain light background.`
          : `A clean, simple, colorful flat-vector educational illustration for a Grade ${grade} school student, depicting: ${imageSubject} (${subject}). No text or labels in the image. Friendly, age-appropriate, plain light background.`
        const generated = await generateIllustration(imagePrompt)
        const image = generated ? { url: generated.url, caption: imageSubject } : null
        return { ...parsed, image }
      },
    )
    const image = value?.image && typeof value.image?.url === 'string' ? value.image : null
    const sections = Array.isArray(value?.sections)
      ? (value.sections as unknown[]).reduce<{ heading: string; body?: string; bullets?: string[] }[]>((acc, s) => {
          if (s == null || typeof s !== 'object') return acc
          const rec = s as Record<string, unknown>
          if (typeof rec.heading !== 'string' || !rec.heading.trim()) return acc
          const body = typeof rec.body === 'string' && rec.body.trim() ? rec.body.trim() : undefined
          const bullets = Array.isArray(rec.bullets)
            ? (rec.bullets as unknown[]).filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
            : []
          if (!body && bullets.length === 0) return acc
          acc.push({ heading: rec.heading.trim(), ...(body ? { body } : { bullets }) })
          return acc
        }, [])
      : []
    if (sections.length === 0)
      throw new Error('No valid prep material returned by AI')
    return NextResponse.json({ sections, image })
  } catch (err) {
    console.error('[test-prep] generation failed:', err)
    return NextResponse.json({ error: 'Failed to generate prep material' }, { status: 500 })
  }
}
