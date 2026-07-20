import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { createServerComponentClient } from '@/lib/supabase-server'
import { checkVisionRateLimit, getClientIp } from '@/lib/rate-limit'
import { parseBody, ScanAttendanceSchema } from '@/lib/schemas'
import { apiLog } from '@/lib/logger'

export const maxDuration = 90

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    apiLog({ route: 'scan-attendance', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { allowed } = await checkVisionRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'scan-attendance', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'rate_limited' })
    return NextResponse.json({ error: 'Rate limit exceeded. Try again in an hour.' }, { status: 429 })
  }

  const parsed = parseBody(ScanAttendanceSchema, await req.json().catch(() => null))
  if (!parsed.ok) {
    apiLog({ route: 'scan-attendance', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
    return parsed.response
  }
  const { imageBase64, students } = parsed.data

  try {
    const studentList = students.map((s, i) => `${i + 1}. ${s.name} (roll: ${s.rollNumber}, id: ${s.id})`).join('\n')

    const prompt = `You are reading a teacher's handwritten class attendance register from a photo.

Known students in this class:
${studentList}

For each student, work out whether they were marked present, absent, or late. Handwritten registers vary in convention:
- A tick/checkmark or "P" next to a name usually means present
- A cross, "A", or an empty attendance cell usually means absent
- "L" or a note about arriving late means late
- Some sheets only list the names of ABSENT students (no full roster) — in that case, mark only those listed names as absent

Return ONLY valid JSON (no markdown, no extra text):
{
  "entries": [
    { "studentId": "...", "status": "present" }
  ]
}

Rules:
- status must be exactly one of: "present", "absent", "late"
- studentId must exactly match one of the ids listed above
- Match each handwritten name/roll number to the closest student in the list above, even if spelling or handwriting is imperfect
- Only include a student if you can reasonably tell their status from the image — omit anyone you're unsure about`

    const raw = await callAI([{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageBase64 } },
        { type: 'text',      text: prompt },
      ],
    }], { temperature: 0.2, timeoutMs: 90_000 })

    let parsed2: { entries?: unknown[] }
    try {
      parsed2 = JSON.parse(raw)
    } catch {
      apiLog({ route: 'scan-attendance', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: 'JSON parse failed' })
      return NextResponse.json({ entries: [] })
    }

    const validStatuses = new Set(['present', 'absent', 'late'])
    const entries = (parsed2.entries ?? [])
      .filter((e: unknown) => {
        const r = e as { studentId: string; status: string }
        return validStatuses.has(r.status) && students.some(s => s.id === r.studentId)
      })
      .map((e: unknown) => {
        const r = e as { studentId: string; status: 'present' | 'absent' | 'late' }
        return { studentId: r.studentId, status: r.status }
      })

    apiLog({ route: 'scan-attendance', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ entries })
  } catch (err) {
    const msg = String(err)
    apiLog({ route: 'scan-attendance', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: msg })
    if (msg.startsWith('[ai]')) {
      return NextResponse.json({ error: 'AI service temporarily unavailable. Please retry shortly.' }, { status: 503 })
    }
    return NextResponse.json({ entries: [] })
  }
}
