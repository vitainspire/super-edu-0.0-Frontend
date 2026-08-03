import { NextRequest, NextResponse } from 'next/server'
import { generateIllustration } from '@/lib/ai'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'

// POST /api/workbook-image
// Generates ONE clean workbook-style illustration for a single problem, on demand
// (teacher taps "Add image" on a problem that needs a visual). Same clean, no-clutter
// style as the prep-material figures.
export const maxDuration = 45

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  let body: { focus?: string; subject?: string; grade?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const focus = (body.focus ?? '').trim()
  if (!focus) return NextResponse.json({ error: 'focus is required' }, { status: 400 })

  const prompt = `A clean, friendly primary-school WORKBOOK illustration that helps a student understand this practice problem, using concrete real objects. Illustrate: "${focus}". Context: Grade ${body.grade ?? ''} ${body.subject ?? ''}. Show only the countable objects/scene that make the problem clear (coins, fruits, sticks, groups, a simple picture), in the EXACT quantities the problem uses, neatly arranged. Plain solid white background, bold clean flat black-and-white line-art suitable for a photocopy, generous spacing, no clutter, no decorative scenery, no watermarks. At most a couple of short, correctly-spelled labels. Accurate and easy to read at a glance.`

  const generated = await generateIllustration(prompt, { timeoutMs: 35_000 })
  if (!generated) return NextResponse.json({ error: 'Could not generate image' }, { status: 502 })
  return NextResponse.json({ url: generated.url })
}
