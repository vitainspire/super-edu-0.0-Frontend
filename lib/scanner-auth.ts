import crypto from 'crypto'
import { createAdminClient } from './supabase-admin'

// The scanner portal is deliberately login-free (volunteers just enter a school
// join code) — this signs a short opaque token scoping that session to the
// verified schoolId, so write endpoints can check "does this test/worksheet
// belong to the school this caller proved they know the join code for?"
// instead of trusting a client-supplied teacherId (which anyone could guess).
const SECRET = process.env.SCANNER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function sign(schoolId: string): string {
  return crypto.createHmac('sha256', SECRET).update(schoolId).digest('hex')
}

export function signSchoolToken(schoolId: string): string {
  return `${schoolId}.${sign(schoolId)}`
}

export function verifySchoolToken(raw: string | undefined | null): string | null {
  if (!raw) return null
  const idx = raw.lastIndexOf('.')
  if (idx === -1) return null
  const schoolId = raw.slice(0, idx)
  const sig = raw.slice(idx + 1)
  const expected = sign(schoolId)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return schoolId
}

export function getScannerSchoolId(req: { headers: { get: (k: string) => string | null } }): string | null {
  return verifySchoolToken(req.headers.get('x-scanner-token'))
}

/** Confirms a test's class belongs to the given (already-verified) school. */
export async function verifyTestInSchool(schoolId: string, testId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: test } = await admin.from('tests').select('class_id').eq('id', testId).maybeSingle()
  if (!test?.class_id) return false
  const { data: cls } = await admin.from('classes').select('school_id').eq('id', test.class_id).maybeSingle()
  return !!cls && cls.school_id === schoolId
}

/** Confirms a worksheet's class belongs to the given (already-verified) school. */
export async function verifyWorksheetInSchool(schoolId: string, worksheetId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: ws } = await admin.from('worksheets').select('class_id').eq('id', worksheetId).maybeSingle()
  if (!ws?.class_id) return false
  const { data: cls } = await admin.from('classes').select('school_id').eq('id', ws.class_id).maybeSingle()
  return !!cls && cls.school_id === schoolId
}
