import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getClientIp } from '@/lib/logger'
import { checkVisionRateLimit } from '@/lib/rate-limit'
import { extractHtml, validateSimulationHtml } from '@/lib/simulation-validate'
import { CELEBRATION_RULES, injectLottie } from '@/lib/simulation-lottie'
import { generateIllustration } from '@/lib/ai'
import type { ExpandableBullet, SmartLesson } from '@/lib/types'

// Same class of cost as a vision/image call (a big generation + up to 2 retries),
// and mirrors smart-lesson's own maxDuration for the same reason: an LLM call
// plus a couple of self-fix round-trips can run past the default 10s.
export const maxDuration = 60

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_ATTEMPTS = 3

// Ported from sim.js (a standalone CLI builder), with changes: (1) the "small
// amount of text" and "compact, centered" constraints are explicit per this
// app's actual usage — the page is shown inside an iframe inside a modal, not
// full-page, and there's a teacher talking rather than a child reading
// silently; (2) LOOK mirrors EduTeach's own design system verbatim
// (app/globals.css tokens: paper/ink/forest palette, bold black-outline
// "matte" cards) instead of generic kids'-app clip art; (3) celebrations are
// Lottie (see lib/simulation-lottie.ts) rather than the model hand-rolling CSS
// keyframes or emoji — the model only ever calls playLottie('name'), never
// authors the animation itself, since malformed Lottie fails silently and a
// small pre-verified library covers every lesson topic equally well. The hard
// technical rules are otherwise unchanged — they were already validated
// against real generations.
const SYSTEM_PROMPT = `You write single-file interactive math simulations for elementary school kids (ages 6-10), skinned to match the EduTeach teacher portal's own design system exactly — think a feature of that app, not a generic kids'-app or a developer tool.

Produce ONE complete, self-contained HTML document.

CONTENT AND TONE
- NO EMOJI ANYWHERE, EVER — not for objects, not for feedback, not for decoration, not in labels or button text. This is a hard rule with zero exceptions.
- Represent quantities with things kids recognize (apples, balloons, cookies, stars, animals, cricket balls, coins, rotis, laddoos) drawn as simple CSS shapes/divs — circles, rounded rectangles, conic-gradient wedges, simple layered shapes built from borders/border-radius/background-color — not bare abstract dots, and never emoji as a substitute for drawing them. A plain colored circle labelled "coin" is right; an emoji glyph is not.
- KEEP TEXT TO A MINIMUM — this is shown inside a modal with a teacher talking, not read silently. At most one short sentence of instruction visible at a time (a beginning reader must be able to read it in one breath), plus numbers/labels. Prefer showing the idea over describing it. Never a paragraph, never multiple instructions stacked on screen at once.
- Use real numbers, names, and content matching the description exactly. Never use lorem ipsum or placeholder text.
- Celebrate success by calling playLottie(...) (see CELEBRATION ANIMATIONS below) plus a short plain-text phrase like "Yay!" or "Correct!" — never emoji, never a harsh red X or scolding tone; use an encouraging nudge instead ("Try again!"). No sound is available, so all feedback must be visual.${CELEBRATION_RULES}

LAYOUT — this page renders inside a modal on a teacher's screen, not full-page:
- Design ONE compact, centered activity card, not an edge-to-edge app. Make body a flex container (display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0) and put all content in a single wrapper with max-width around 480px (never wider than 560px), so it reads as one focused card sitting in the middle of the screen.
- It's fine — good, even — for the wrapper to be shorter than the viewport. Don't stretch content to fill unused vertical space, and don't design for a wide desktop layout.

LOOK — match the EduTeach teacher portal's actual design system, not generic kids'-app clip art:
- Page background: warm ivory paper, #F1EDDF. Never white, never a gradient background.
- EVERY card/tile/button gets a BOLD 2px solid near-black outline, #1B180F — this is the app's signature "bold-outline, flat matte" look. NO drop shadows, NO glow, NO gloss/gradient fills anywhere. Depth comes only from the outline, never from shadow.
- Corners are heavily rounded: 20-24px radius on cards, 14-16px on buttons/tiles, fully round (pill/circle) for badges and counters.
- Ink/text colors: #17140F (near-black) for headings and important text, #4A4740 (warm grey) for secondary/help text.
- Primary accent: deep forest green, #1F3D2C, with #2C5540 and #3E7A57 as supporting greens — used for primary buttons, active/selected states, and progress fills. This green is the app's signature color; use it as the main accent, not a rare highlight.
- For grouping/categorizing things (a team, a bucket, a row) pick ONE flat pastel tile color per group, always with the bold #1B180F outline: mint #DCEEE1, peach #F4D6C0, gold #F7EFC4, sky blue #D6E3F3, violet #DED3F2, pink #F4D7E1. Never use these as the page background.
- Buttons: solid fill (ink #17140F or forest #1F3D2C), white bold text, fully rounded, 2px outline optional on the dark fill itself (skip it if fill already reads clearly), NO gradient — matches a flat "sticker" look, not a glossy app-store button.
- Small tags/badges/counters: white or near-white pill background, thin bold #1B180F outline, bold ink text.
- Typography: font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif for EVERYTHING — no Comic Sans, no handwriting/cursive fonts, no serif. Headings and big numbers are very heavy weight (800-900) with tight letter-spacing, like a confident geometric display face; body/instruction text is 500-600 weight. The friendliness comes from color, roundness, and warmth — not from a cartoonish font.
- Large type: body text at least 20px, numbers and key labels much bigger (heavy weight). Tap targets at least 48px, since small fingers use these on tablets.

INTERACTION
- The default interaction is a plain click/tap — clicking something should immediately act (move it, count it, reveal it, toggle it). Never implement a "press and hold, then follow the cursor/finger" drag gesture unless the description explicitly uses the word "drag". If it does, use pointer events (pointerdown/pointermove/pointerup, setPointerCapture) — never the native HTML5 Drag and Drop API (draggable="true", dragstart/drop, DataTransfer), which is unreliable in sandboxes and unsupported on touchscreens.

HARD TECHNICAL RULES — breaking any of these breaks the page:
1. Put ALL CSS inside the <style> tag and ALL JavaScript inside the <script> tag. NEVER put CSS (@keyframes, @media, selectors, style rules) inside <script> — that is a JavaScript syntax error that kills the entire page. Every @keyframes block belongs in <style>, always.
2. Absolutely no network requests: no @import, no <link> to fonts or stylesheets, no external <script src>, no url(https://...), no remote images. Nothing outside this one file. The page must work fully offline.
3. Write only valid CSS. Gradients must be written exactly like: linear-gradient(to bottom right, #A7ECEE, #F7CAC9). CSS function names never contain underscores.
4. Lay the page out in normal document flow with flexbox or grid and gap. Use position: absolute only when an element genuinely must move freely over a track (for example a character sliding along a number line), and only inside a parent with position: relative that reserves enough space for it. An absolutely positioned element must never end up covering a button, an input, or any text.
5. Never set a fixed height (or width) on anything containing text. Use padding plus min-height so text can never overflow its container.
6. Nothing may ever be cut off or run off the edge of the screen. Any row of items (number tiles, counters, cards) must use flex-wrap: wrap so it wraps onto a second line instead of overflowing, and containers should size to their content rather than forcing a fixed width. The page must never scroll sideways.
7. Make sure the JavaScript actually runs: no stray tokens, balanced braces and quotes. The page must render correctly with zero console errors.
8. To draw a round object split into fraction slices (pizza, roti, laddoo, pie, cake), use a div with border-radius: 50% and a conic-gradient background — for example background: conic-gradient(#ff9900 0deg 90deg, #f7d28c 90deg 360deg) shades one quarter. Build the gradient string in JavaScript to shade any number of slices, and draw the dividing lines with a separate overlay using repeating-conic-gradient. Do NOT try to build slices out of rotated rectangles with clip-path — that produces broken diamond shapes that spill outside the circle. For rectangular fractions (chocolate bars, ribbons) just use a flex row of equal-width divs.
9. Respect prefers-reduced-motion by shortening your own CSS animations (tap feedback, character motion). playLottie already handles this for celebrations on its own — nothing to do there.

Output ONLY the raw HTML document, starting with <!DOCTYPE html>. No markdown code fences, no explanation before or after.`

function bulletLines(bullets: ExpandableBullet[] | undefined): string {
  return (bullets ?? []).map(b => `- ${b.text}${b.detail ? ` — ${b.detail}` : ''}`).join('\n')
}

// Builds the user-facing description from the lesson's core worked example
// (Concept + Explore + Challenge) — the scope chosen for this feature: one
// simulation per prep material, matching what the teacher already presented,
// rather than one simulation per section.
function describeLesson(topic: string, subtopic: string | null, subject: string, grade: string, lesson: SmartLesson): string {
  const parts = [
    `Topic: ${topic}${subtopic ? ` — ${subtopic}` : ''}`,
    `Subject: ${subject}`,
    `Grade: ${grade}`,
    '',
    'This is the exact worked example the students just saw explained by their teacher. Build ONE small interactive simulation around these same numbers/objects — a continuation of this scene, not a new topic.',
    '',
    'Concept (the idea being taught):',
    bulletLines(lesson.concept),
    '',
    'Explore scenario (the real-life scene the class stepped into):',
    bulletLines(lesson.explore?.points),
  ]
  if (lesson.challenge?.activity) {
    parts.push('', `Challenge activity ("${lesson.challenge.activity}"):`, bulletLines(lesson.challenge.points))
  }
  if (lesson.materialsUsed?.length) {
    parts.push('', `Materials named in the lesson: ${lesson.materialsUsed.join(', ')}`)
  }
  parts.push(
    '',
    'Pick ONE clear, tappable idea from the above and build the whole simulation around it — a child should be able to interact with it (tap, count, build, reveal) in a few seconds without reading instructions first.'
  )
  return parts.filter(Boolean).join('\n')
}

// A second, independent artifact generated alongside the interactive
// simulation: a richly detailed chalk-on-blackboard sketch of the SAME worked
// example, for a teacher to redraw (or just hold up) in a real low-resource
// classroom that may have no screen at all for the students to see. Best-
// effort — generateIllustration() already returns null on any failure, and a
// missing blackboard image never blocks the simulation itself from shipping.
function describeBlackboardScene(topic: string, subtopic: string | null, subject: string, grade: string, lesson: SmartLesson): string {
  const example = [
    lesson.concept?.[0] && `${lesson.concept[0].text}${lesson.concept[0].detail ? ` — ${lesson.concept[0].detail}` : ''}`,
    lesson.explore?.points?.[0] && `${lesson.explore.points[0].text}${lesson.explore.points[0].detail ? ` — ${lesson.explore.points[0].detail}` : ''}`,
  ].filter(Boolean).join(' ')

  return `A richly detailed, teacher-facing CHALK-ON-BLACKBOARD illustration — the exact scene a teacher would draw on a real classroom blackboard to explain this, in white and colored chalk on a dark green/black board background (visible chalk texture, slightly rough hand-drawn line quality, not a clean vector graphic).

Topic: ${topic}${subtopic ? ` — ${subtopic}` : ''} (${subject}, Grade ${grade})
It must accurately and thoroughly depict this worked example: "${example || `${topic}${subtopic ? `, focusing on ${subtopic}` : ''}`}"

Requirements:
- VERY DESCRIPTIVE: don't just sketch one bare object — build a small complete scene with concrete, countable real-life objects (coins, rotis, fruits, stick figures, a number line drawn in chalk, small labels) that together walk through the actual example step by step, exactly as a teacher narrating it aloud would draw it piece by piece.
- Quantities must be EXACTLY right and countable — if the example says a specific number, draw exactly that many, correctly grouped.
- Use only chalk-plausible marks: simple outlines, cross-hatching for shading, dotted/dashed lines for division, stick-figure people — nothing photorealistic or painterly.
- A few short handwritten-style chalk labels or numbers are welcome; keep any text minimal, correctly spelled, and secondary to the drawing itself.
- Plain dark blackboard background (near-black or dark slate green), no classroom walls, no border, no watermark or logo.
Clean enough to read from the back of a classroom, but full of the concrete detail that makes the idea click at a glance.`
}

async function callModel(messages: { role: string; content: string }[], apiKey: string): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'EduTeach Simulation',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
      max_tokens: 8192,
      messages,
    }),
  })
  const data = await res.json() as { choices?: { message: { content: string } }[]; error?: { message: string } }
  if (!res.ok) throw new Error(data.error?.message || `OpenRouter request failed (${res.status}).`)
  return data.choices?.[0]?.message?.content || ''
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkVisionRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })

  let body: {
    prepMaterialId?: string; classId?: string
    subject?: string; grade?: string; topic?: string; subtopic?: string
    lesson?: SmartLesson
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { prepMaterialId, classId, subject, grade, topic, lesson } = body
  const subtopic = body.subtopic ?? null
  // No DB lookup here on purpose — this route trusts the lesson the client
  // already generated and has on screen, rather than depending on the
  // prep_materials row having successfully persisted first (that save is
  // best-effort/fire-and-forget, so requiring it here was a source of
  // spurious "not found" failures whenever it hadn't landed yet).
  if (!prepMaterialId || !classId || !subject || !grade || !topic || !lesson) {
    return NextResponse.json({ error: 'prepMaterialId, classId, subject, grade, topic, and lesson are required' }, { status: 400 })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 500 })

  const admin = createAdminClient()

  const description = describeLesson(topic, subtopic, subject, grade, lesson)

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: description },
  ]

  let html = ''
  let problems: string[] = []

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let text: string
    try {
      text = await callModel(messages, apiKey)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'AI request failed' }, { status: 500 })
    }
    const candidate = extractHtml(text)

    if (!candidate.toLowerCase().includes('<html')) {
      problems = ['You did not return a complete HTML document starting with <!DOCTYPE html>.']
    } else {
      html = candidate
      problems = validateSimulationHtml(html)
    }

    if (!problems.length) break
    if (attempt === MAX_ATTEMPTS) break   // save the latest version anyway, matching the CLI script's behavior

    messages.push({ role: 'assistant', content: html || '(no document)' })
    messages.push({
      role: 'user',
      content: `That document has these problems:\n\n${problems.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nReturn the COMPLETE corrected HTML document with every problem fixed. Output only the raw HTML, no code fences.`,
    })
  }

  if (!html) return NextResponse.json({ error: 'Could not generate a usable simulation' }, { status: 500 })

  // Idempotent — same pattern as any Storage bucket in this app (see
  // scanned-papers): created on first use rather than via a migration.
  await admin.storage.createBucket('simulations', { public: true }).catch(() => {})

  // No DB table — the Storage object IS the record. Path is deterministic
  // (classId/prepMaterialId.html), so the client can derive the same public
  // URL and check existence itself (see lib/simulation-url.ts) without a
  // `simulations` table or any migration. `upsert: true` makes "Regenerate"
  // replace the existing file at the same path rather than needing a
  // separate delete step.
  // Static checks above read the model's own markup, so the bundled player
  // can't trip them; `doc` — html plus the Lottie player + data, if any
  // playLottie() call was actually used — is what gets shipped.
  const doc = injectLottie(html)

  const storagePath = `${classId}/${prepMaterialId}.html`
  // supabase-js's `contentType` option is silently ignored when the body is a
  // plain string in Node — it falls back to detecting the Blob's own `type`,
  // which is empty for a raw string, so Storage serves it as text/plain and
  // the browser shows source instead of rendering the page. Wrapping in an
  // explicitly-typed Blob is what actually gets text/html onto the object.
  const { error: uploadError } = await admin.storage
    .from('simulations')
    .upload(storagePath, new Blob([doc], { type: 'text/html' }), { contentType: 'text/html', upsert: true })
  if (uploadError) return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })

  const { data: urlData } = admin.storage.from('simulations').getPublicUrl(storagePath)

  // Second artifact, same bucket, same deterministic-path pattern — best
  // effort. A failure here (model declined, timeout) never fails the request;
  // the simulation itself has already been saved above.
  let blackboardImageUrl: string | undefined
  try {
    const illustration = await generateIllustration(
      describeBlackboardScene(topic, subtopic, subject, grade, lesson),
      { timeoutMs: 25_000 },
    )
    if (illustration?.url) {
      const match = illustration.url.match(/^data:([^;]+);base64,([\s\S]+)$/)
      const bytes = match ? Buffer.from(match[2], 'base64') : await fetch(illustration.url).then(r => r.arrayBuffer()).then(b => Buffer.from(b))
      const contentType = match?.[1] || 'image/png'
      const imagePath = `${classId}/${prepMaterialId}-blackboard.png`
      const { error: imgUploadError } = await admin.storage
        .from('simulations')
        .upload(imagePath, new Blob([bytes], { type: contentType }), { contentType, upsert: true })
      if (!imgUploadError) {
        blackboardImageUrl = admin.storage.from('simulations').getPublicUrl(imagePath).data.publicUrl
      }
    }
  } catch (err) {
    console.warn('[generate-simulation] blackboard image failed:', err)
  }

  return NextResponse.json({ url: urlData.publicUrl, blackboardImageUrl })
}
