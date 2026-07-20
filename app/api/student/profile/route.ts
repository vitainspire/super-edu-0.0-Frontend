import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { verifyStudentCookie } from '@/lib/student-auth'

// PATCH /api/student/profile — update interests for the authenticated student
export async function PATCH(req: NextRequest) {
  const studentId = verifyStudentCookie(req.cookies.get('edu-student-id')?.value)
  if (!studentId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { interests } = body as { interests?: unknown }
  if (!Array.isArray(interests) || interests.some(i => typeof i !== 'string')) {
    return NextResponse.json({ error: 'interests must be an array of strings' }, { status: 400 })
  }

  const cleaned = (interests as string[]).map(s => s.trim()).filter(Boolean).slice(0, 10)

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('students')
    .update({ interests: cleaned })
    .eq('id', studentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ interests: cleaned })
}
