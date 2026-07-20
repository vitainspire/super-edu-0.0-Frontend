import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { parseBody, StudentDoubtSchema } from '@/lib/schemas'
import { apiLog, getClientIp } from '@/lib/logger'
import { verifyStudentCookie } from '@/lib/student-auth'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const studentId = verifyStudentCookie(req.cookies.get('edu-student-id')?.value)
  if (!studentId) {
    apiLog({ route: 'student/doubt', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const parsed = parseBody(StudentDoubtSchema, await req.json().catch(() => null))
  if (!parsed.ok) {
    apiLog({ route: 'student/doubt', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
    return parsed.response
  }
  const { classId, subject, question, studentName } = parsed.data

  try {
    const supabase   = createAdminClient()
    const id         = crypto.randomUUID()
    const createdAt  = new Date().toISOString()

    const { error } = await supabase.from('student_doubts').insert({
      id, student_id: studentId, student_name: studentName ?? '',
      class_id: classId, subject: subject ?? '',
      question: question.trim(), status: 'pending', created_at: createdAt,
    })
    if (error) throw error

    apiLog({ route: 'student/doubt', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({
      id, studentId, studentName: studentName ?? '', classId,
      subject: subject ?? '', question: question.trim(),
      createdAt, status: 'pending',
    })
  } catch (err) {
    apiLog({ route: 'student/doubt', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
