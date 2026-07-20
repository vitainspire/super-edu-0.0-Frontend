import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { parseBody, StudentPollSchema } from '@/lib/schemas'
import { apiLog, getClientIp } from '@/lib/logger'
import { verifyStudentCookie } from '@/lib/student-auth'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const studentId = verifyStudentCookie(req.cookies.get('edu-student-id')?.value)
  if (!studentId) {
    apiLog({ route: 'student/poll', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const parsed = parseBody(StudentPollSchema, await req.json().catch(() => null))
  if (!parsed.ok) {
    apiLog({ route: 'student/poll', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
    return parsed.response
  }
  const { classId, syllabusTopicId, topic, subject, response } = parsed.data

  try {
    const supabase      = createAdminClient()
    const respondedAt   = new Date().toISOString()

    const { error } = await supabase.from('topic_polls').upsert(
      {
        id: crypto.randomUUID(),
        student_id: studentId,
        class_id: classId,
        syllabus_topic_id: syllabusTopicId,
        topic: topic ?? '',
        subject: subject ?? '',
        response,
        responded_at: respondedAt,
      },
      { onConflict: 'student_id,syllabus_topic_id' },
    )
    if (error) throw error

    apiLog({ route: 'student/poll', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    apiLog({ route: 'student/poll', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
