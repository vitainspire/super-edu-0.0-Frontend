import crypto from 'crypto'
import { createAdminClient } from './supabase-admin'

// Signs the `edu-student-id` cookie so it can't be forged by setting an arbitrary
// student UUID client-side. Falls back to the service-role key (already a strong,
// server-only secret) if a dedicated STUDENT_SESSION_SECRET isn't configured.
const SECRET = process.env.STUDENT_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function sign(studentId: string): string {
  return crypto.createHmac('sha256', SECRET).update(studentId).digest('hex')
}

export function signStudentId(studentId: string): string {
  return `${studentId}.${sign(studentId)}`
}

/** Verifies the cookie's signature and returns the authenticated student id, or null. */
export function verifyStudentCookie(raw: string | undefined | null): string | null {
  if (!raw) return null
  const idx = raw.lastIndexOf('.')
  if (idx === -1) return null
  const studentId = raw.slice(0, idx)
  const sig = raw.slice(idx + 1)
  const expected = sign(studentId)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return studentId
}

/**
 * A student can have more than one `students` row — the legacy data model gives
 * each subject/class its own row, linked by matching roll_number + grade/section/school.
 * This confirms a (studentId, classId) pair requested by the client actually belongs
 * to the same physical student as the authenticated cookie, before any row-level data
 * for that pair is returned.
 */
export async function verifyStudentAccess(
  cookieStudentId: string,
  requestedStudentId: string,
  requestedClassId: string,
): Promise<boolean> {
  if (requestedStudentId === cookieStudentId) return true

  const supabase = createAdminClient()
  const [{ data: me }, { data: target }] = await Promise.all([
    supabase.from('students').select('*, classes(*)').eq('id', cookieStudentId).maybeSingle(),
    supabase.from('students').select('*, classes(*)').eq('id', requestedStudentId).maybeSingle(),
  ])
  if (!me || !target || !target.is_active) return false
  if (target.class_id !== requestedClassId) return false

  const myClass = me.classes
  const targetClass = target.classes
  if (!myClass || !targetClass) return false

  const sameSchool = myClass.school_id
    ? myClass.school_id === targetClass.school_id
    : myClass.school_name === targetClass.school_name
  return (
    target.roll_number === me.roll_number &&
    targetClass.grade === myClass.grade &&
    (targetClass.section ?? '') === (myClass.section ?? '') &&
    sameSchool
  )
}
