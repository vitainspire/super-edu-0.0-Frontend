import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { verifyStudentCookie } from '@/lib/student-auth'
import { apiLog, getClientIp } from '@/lib/logger'
import { computeAvgMastery, computeProgressStatus } from '@/lib/peerPairProgress'

interface MasteryRow { student_id: string; subject: string; mastery: number }

// GET /api/student/peer-matches?classId=... — for the authenticated student:
// classmates worth pairing with (shared interests / complementary subject
// strengths, never raw scores), plus their current requests and active pairs.
export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const studentId = verifyStudentCookie(req.cookies.get('edu-student-id')?.value)
  if (!studentId) {
    apiLog({ route: 'student/peer-matches', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 })

  try {
    const supabase = createAdminClient()

    const [{ data: me }, { data: classmates }, { data: pairings }] = await Promise.all([
      supabase.from('students').select('id, name, interests').eq('id', studentId).maybeSingle(),
      supabase.from('students').select('id, name, interests')
        .eq('class_id', classId).eq('is_active', true).neq('id', studentId),
      supabase.from('peer_pairings').select('*')
        .eq('class_id', classId)
        .or(`requester_student_id.eq.${studentId},target_student_id.eq.${studentId}`),
    ])

    if (!me) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    const candidates = classmates ?? []
    const rows = pairings ?? []

    const incoming = rows
      .filter(r => r.status === 'pending' && r.target_student_id === studentId)
      .map(r => ({ id: r.id, fromStudentId: r.requester_student_id, subject: r.subject ?? undefined, createdAt: r.created_at }))
    const outgoing = rows
      .filter(r => r.status === 'pending' && r.requester_student_id === studentId)
      .map(r => ({ id: r.id, toStudentId: r.target_student_id, subject: r.subject ?? undefined, createdAt: r.created_at }))
    const activeRows = rows.filter(r => r.status === 'active')
    // Only ever a positive note — "no_change" is a teacher-facing signal, never
    // shown to the student, since it would read as blame rather than encouragement.
    const progressNoteById = new Map<string, string>()
    await Promise.all(activeRows.filter(r => r.responded_at).map(async r => {
      const [curReq, curTgt] = await Promise.all([
        computeAvgMastery(supabase, r.requester_student_id, r.subject ?? undefined),
        computeAvgMastery(supabase, r.target_student_id, r.subject ?? undefined),
      ])
      const status = computeProgressStatus(r.responded_at, r.baseline_requester_mastery, r.baseline_target_mastery, curReq, curTgt)
      if (status === 'improving') progressNoteById.set(r.id, "You two are making great progress together!")
    }))

    const active = activeRows.map(r => ({
      id: r.id,
      partnerStudentId: r.requester_student_id === studentId ? r.target_student_id : r.requester_student_id,
      subject: r.subject ?? undefined,
      activity: r.activity ?? undefined,
      createdAt: r.created_at,
      progressNote: progressNoteById.get(r.id),
    }))

    // Names for anyone referenced in incoming/outgoing/active but not already
    // in `candidates` (a partner may no longer be an active classmate row we fetched).
    const referencedIds = new Set([
      ...incoming.map(r => r.fromStudentId),
      ...outgoing.map(r => r.toStudentId),
      ...active.map(r => r.partnerStudentId),
    ])
    const nameById = new Map(candidates.map(c => [c.id, c.name]))
    const missingIds = [...referencedIds].filter(id => !nameById.has(id))
    if (missingIds.length > 0) {
      const { data: extra } = await supabase.from('students').select('id, name').in('id', missingIds)
      for (const s of extra ?? []) nameById.set(s.id, s.name)
    }

    // A classmate already in any pending/active relationship with me shouldn't
    // also show up as a fresh "match" suggestion.
    const excluded = new Set(
      rows.filter(r => r.status !== 'dissolved')
        .map(r => (r.requester_student_id === studentId ? r.target_student_id : r.requester_student_id))
    )

    // Mastery lookup — used only to detect complementary subject strengths,
    // never surfaced to the student as raw numbers.
    const allIds = [studentId, ...candidates.map(c => c.id)]
    const { data: masteryRows } = await supabase
      .from('student_topic_mastery').select('student_id, subject, mastery').in('student_id', allIds)
    const bySubject = new Map<string, Map<string, number>>() // studentId -> subject -> best mastery
    for (const m of (masteryRows ?? []) as MasteryRow[]) {
      if (!m.subject) continue
      if (!bySubject.has(m.student_id)) bySubject.set(m.student_id, new Map())
      const subjMap = bySubject.get(m.student_id)!
      subjMap.set(m.subject, Math.max(subjMap.get(m.subject) ?? 0, m.mastery))
    }
    const myMastery = bySubject.get(studentId) ?? new Map()

    const matches = candidates
      .filter(c => !excluded.has(c.id))
      .map(c => {
        const theirInterests = c.interests ?? []
        const sharedInterests = (me.interests ?? []).filter((i: string) => theirInterests.includes(i))

        const theirMastery = bySubject.get(c.id) ?? new Map()
        const complementarySubjects: string[] = []
        const subjectsSeen = new Set([...myMastery.keys(), ...theirMastery.keys()])
        for (const subject of subjectsSeen) {
          const mine = myMastery.get(subject)
          const theirs = theirMastery.get(subject)
          if (mine == null || theirs == null) continue
          if ((mine >= 0.7 && theirs < 0.6) || (theirs >= 0.7 && mine < 0.6)) complementarySubjects.push(subject)
        }

        if (sharedInterests.length === 0 && complementarySubjects.length === 0) return null

        const reason = sharedInterests.length > 0
          ? `You both like ${sharedInterests.slice(0, 2).join(' and ')}`
          : `Great match for ${complementarySubjects[0]} practice`

        return {
          studentId: c.id,
          name: c.name,
          reason,
          score: sharedInterests.length * 2 + complementarySubjects.length,
        }
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ studentId: id, name, reason }) => ({ studentId: id, name, reason }))

    apiLog({ route: 'student/peer-matches', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({
      matches,
      incoming: incoming.map(r => ({ ...r, fromName: nameById.get(r.fromStudentId) ?? 'Classmate' })),
      outgoing: outgoing.map(r => ({ ...r, toName: nameById.get(r.toStudentId) ?? 'Classmate' })),
      active: active.map(r => ({ ...r, partnerName: nameById.get(r.partnerStudentId) ?? 'Classmate' })),
    })
  } catch (err) {
    apiLog({ route: 'student/peer-matches', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
