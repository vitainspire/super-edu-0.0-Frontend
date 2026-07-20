import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { getClientIp } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rate-limit'
import { getScannerSchoolId, verifyWorksheetInSchool } from '@/lib/scanner-auth'

// Scanner portal — save a worksheet mark using service role key (no Supabase session needed).
// Authorization is via the signed school-scoped token from /api/scanner/connect,
// not a client-supplied teacherId (which anyone could guess/forge).
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip)
  if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })

  const schoolId = getScannerSchoolId(req)
  if (!schoolId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: {
    worksheetId: string
    studentId: string
    score: number
    totalMarks: number
    breakdown?: unknown
    feedback?: string
    imageUrl?: string
    driveUrl?: string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const { worksheetId, studentId, score, totalMarks, breakdown, feedback, imageUrl, driveUrl } = body
  if (!worksheetId || !studentId || score === undefined || !totalMarks) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (score < 0 || score > totalMarks) {
    return NextResponse.json({ error: 'score out of range' }, { status: 400 })
  }

  // Verify the worksheet belongs to a class in the authenticated school
  if (!(await verifyWorksheetInSchool(schoolId, worksheetId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('worksheet_marks').upsert(
    {
      id: crypto.randomUUID(),
      worksheet_id: worksheetId,
      student_id: studentId,
      score,
      entered_at: new Date().toISOString(),
      source: 'ai_scanned',
      breakdown: breakdown ?? null,
      feedback: feedback ?? null,
      image_url: imageUrl ?? null,
      drive_url: driveUrl ?? null,
    },
    { onConflict: 'worksheet_id,student_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
