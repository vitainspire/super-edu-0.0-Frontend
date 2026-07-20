import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { apiLog, getClientIp } from '@/lib/logger'
import { signStudentId } from '@/lib/student-auth'
import { checkAuthRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const { allowed } = await checkAuthRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'student/login', ip, durationMs: Date.now() - t, fromCache: false, status: 'rate_limited' })
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  try {
    const { studentCode } = await req.json()
    if (!studentCode?.trim()) {
      return NextResponse.json({ error: 'Please enter your Student ID.' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: student } = await supabase
      .from('students')
      .select('*, classes(*)')
      .eq('student_code', studentCode.trim().toUpperCase())
      .eq('is_active', true)
      .maybeSingle()

    if (!student) {
      return NextResponse.json(
        { error: 'Student ID not found. Ask your teacher or school admin for your Student ID.' },
        { status: 404 },
      )
    }

    const cls = student.classes

    const session = {
      studentId: student.id,
      classId: student.class_id,
      studentName: student.name,
      grade: cls?.grade ?? '',
      section: cls?.section ?? '',
      subject: cls?.name ?? '',
    }

    apiLog({ route: 'student/login', ip, userId: student.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    const res = NextResponse.json({ ok: true, session })
    res.cookies.set('edu-student-id', signStudentId(student.id), {
      path: '/',
      maxAge: 86400 * 30,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    })
    return res
  } catch (err) {
    apiLog({ route: 'student/login', ip, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
