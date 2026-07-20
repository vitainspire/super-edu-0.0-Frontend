import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { createServerComponentClient } from '@/lib/supabase-server'
import { parseBody, ExtractStudentsSchema } from '@/lib/schemas'
import { apiLog, getClientIp } from '@/lib/logger'
import { checkVisionRateLimit } from '@/lib/rate-limit'

// Reads a photo of a class roster/register (handwritten or printed) and
// extracts name + roll number pairs. Vision call, so gated by the tighter
// vision rate limit — same convention as /api/extract-syllabus.
export const maxDuration = 60

const SYSTEM = `You are reading a photo of a school class roster or attendance register. It may be handwritten (including Indian regional handwriting styles) or printed, and may be messy, angled, or partly faded.

Extract every student's name and roll number you can identify.

Return ONLY valid JSON (no markdown, no code fences):
{
  "students": [
    { "name": "student full name", "rollNumber": "roll number as written" }
  ]
}

Rules:
- List students in the order they appear on the page (top to bottom).
- If a roll number isn't clearly visible for an entry, use an empty string for rollNumber — don't invent a number that isn't there.
- Correct obvious spelling/OCR issues in names only where you're confident — don't invent names that aren't there.
- Skip headers, titles, and column labels (e.g. "Class 5A Roster", "Name", "Roll No.") — only actual student entries.
- If handwriting for an entry is fully illegible, skip that entry rather than guessing.`

function extractJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) return fenced[1]
  const firstBrace = raw.indexOf('{')
  const lastBrace  = raw.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1) return raw.slice(firstBrace, lastBrace + 1)
  return raw
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const { allowed } = await checkVisionRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'extract-students', ip, durationMs: Date.now() - t, fromCache: false, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    apiLog({ route: 'extract-students', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = parseBody(ExtractStudentsSchema, await req.json().catch(() => null))
  if (!parsed.ok) {
    apiLog({ route: 'extract-students', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
    return parsed.response
  }
  const { image } = parsed.data

  try {
    const messages = [{ role: 'user' as const, content: [
      { type: 'image_url' as const, image_url: { url: image } },
      { type: 'text'      as const, text: SYSTEM },
    ]}]

    const raw = await callAI(messages, { jsonMode: false, temperature: 0.1 })

    if (!raw) {
      apiLog({ route: 'extract-students', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: 'empty AI response' })
      return NextResponse.json({ error: 'AI returned an empty response. Please try again.' }, { status: 500 })
    }

    let result: { students?: unknown[] }
    try {
      result = JSON.parse(extractJSON(raw))
    } catch {
      apiLog({ route: 'extract-students', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: 'JSON parse failed' })
      return NextResponse.json({ error: 'Could not read the photo. Try a clearer or better-lit picture.' }, { status: 500 })
    }

    const students = (result.students ?? [])
      .map((s: unknown) => {
        const row = s as Record<string, unknown>
        return {
          name:       String(row.name ?? '').trim(),
          rollNumber: String(row.rollNumber ?? '').trim(),
        }
      })
      .filter(s => s.name.length > 0)

    if (students.length === 0) {
      apiLog({ route: 'extract-students', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: 'no students found' })
      return NextResponse.json({ error: 'No student names found in this photo. Try a clearer picture.' }, { status: 422 })
    }

    apiLog({ route: 'extract-students', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ students })
  } catch (err) {
    apiLog({ route: 'extract-students', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Unexpected server error. Please try again.' }, { status: 500 })
  }
}
