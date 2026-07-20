import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { verifyStudentCookie } from '@/lib/student-auth'
import { parseBody, PeerPairRequestSchema, PeerPairActionSchema } from '@/lib/schemas'
import { apiLog, getClientIp } from '@/lib/logger'
import { generatePeerActivity } from '@/lib/peerPairActivity'
import { computeAvgMastery } from '@/lib/peerPairProgress'

// POST /api/student/peer-pairings — send a pairing request to a classmate.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const studentId = verifyStudentCookie(req.cookies.get('edu-student-id')?.value)
  if (!studentId) {
    apiLog({ route: 'student/peer-pairings', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const parsed = parseBody(PeerPairRequestSchema, await req.json().catch(() => null))
  if (!parsed.ok) return parsed.response
  const { classId, targetStudentId, subject } = parsed.data

  if (targetStudentId === studentId) {
    return NextResponse.json({ error: 'You cannot pair with yourself' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    // Idempotency — don't create a second request if any non-dissolved
    // relationship already exists between these two students in this class.
    const { data: existing } = await supabase
      .from('peer_pairings').select('id, status')
      .eq('class_id', classId)
      .neq('status', 'dissolved')
      .or(`and(requester_student_id.eq.${studentId},target_student_id.eq.${targetStudentId}),and(requester_student_id.eq.${targetStudentId},target_student_id.eq.${studentId})`)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'A request or pairing already exists with this classmate' }, { status: 409 })
    }

    const id = crypto.randomUUID()
    const { error } = await supabase.from('peer_pairings').insert({
      id, class_id: classId, subject: subject ?? null,
      requester_student_id: studentId, target_student_id: targetStudentId,
      status: 'pending',
    })
    if (error) throw error

    apiLog({ route: 'student/peer-pairings', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ id, status: 'pending' })
  } catch (err) {
    apiLog({ route: 'student/peer-pairings', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/student/peer-pairings — accept an incoming request, or cancel
// your own still-pending outgoing one. No "decline" action is exposed — an
// unwanted request is simply left pending rather than surfacing rejection.
export async function PATCH(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const studentId = verifyStudentCookie(req.cookies.get('edu-student-id')?.value)
  if (!studentId) {
    apiLog({ route: 'student/peer-pairings', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const parsed = parseBody(PeerPairActionSchema, await req.json().catch(() => null))
  if (!parsed.ok) return parsed.response
  const { id, action } = parsed.data

  try {
    const supabase = createAdminClient()
    const { data: row } = await supabase.from('peer_pairings').select('*').eq('id', id).maybeSingle()
    if (!row || row.status !== 'pending') {
      return NextResponse.json({ error: 'Request not found or no longer pending' }, { status: 404 })
    }

    if (action === 'accept') {
      if (row.target_student_id !== studentId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { data: students } = await supabase
        .from('students').select('id, name').in('id', [row.requester_student_id, row.target_student_id])
      const nameById = new Map((students ?? []).map(s => [s.id, s.name]))
      const [activity, baselineRequester, baselineTarget] = await Promise.all([
        generatePeerActivity(
          row.subject ?? undefined,
          nameById.get(row.requester_student_id) ?? 'Your buddy',
          nameById.get(row.target_student_id) ?? 'You',
        ),
        computeAvgMastery(supabase, row.requester_student_id, row.subject ?? undefined),
        computeAvgMastery(supabase, row.target_student_id, row.subject ?? undefined),
      ])

      const { error } = await supabase.from('peer_pairings')
        .update({
          status: 'active', responded_at: new Date().toISOString(), activity,
          baseline_requester_mastery: baselineRequester, baseline_target_mastery: baselineTarget,
        })
        .eq('id', id)
      if (error) throw error

      apiLog({ route: 'student/peer-pairings', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
      return NextResponse.json({ id, status: 'active', activity })
    }

    // action === 'cancel' — only the original requester can withdraw their own request.
    if (row.requester_student_id !== studentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { error } = await supabase.from('peer_pairings')
      .update({ status: 'dissolved', responded_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    apiLog({ route: 'student/peer-pairings', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ id, status: 'dissolved' })
  } catch (err) {
    apiLog({ route: 'student/peer-pairings', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
