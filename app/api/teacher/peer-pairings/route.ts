import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { parseBody, PeerPairDissolveSchema } from '@/lib/schemas'
import { computeAvgMastery, computeProgressStatus } from '@/lib/peerPairProgress'

function sb() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}

async function myClassIds(ac: ReturnType<typeof createAdminClient>, teacherId: string): Promise<string[]> {
  const [{ data: owned }, { data: assigned }] = await Promise.all([
    ac.from('classes').select('id').eq('teacher_id', teacherId),
    ac.from('teacher_class_assignments').select('class_id').eq('teacher_id', teacherId),
  ])
  return [...new Set([...(owned ?? []).map(c => c.id), ...(assigned ?? []).map(a => a.class_id)])]
}

// GET /api/teacher/peer-pairings — pending + active peer pairings across every
// class this teacher owns or is assigned to, grouped by class for the Settings view.
export async function GET() {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ac = createAdminClient()
    const { data: teacher } = await ac.from('teachers').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const classIds = await myClassIds(ac, teacher.id)
    if (classIds.length === 0) return NextResponse.json({ classes: [] })

    const [{ data: classes }, { data: pairings }] = await Promise.all([
      ac.from('classes').select('id, name, grade, section').in('id', classIds),
      ac.from('peer_pairings').select('*').in('class_id', classIds).neq('status', 'dissolved'),
    ])

    const studentIds = [...new Set((pairings ?? []).flatMap(p => [p.requester_student_id, p.target_student_id]))]
    const { data: students } = studentIds.length
      ? await ac.from('students').select('id, name').in('id', studentIds)
      : { data: [] as { id: string; name: string }[] }
    const nameById = new Map((students ?? []).map(s => [s.id, s.name]))

    // Progress signal — only meaningful for active pairings that have a
    // captured baseline; recompute each student's current mastery and let the
    // teacher see which pairings aren't showing movement.
    const progressByPairingId = new Map<string, string>()
    await Promise.all(
      (pairings ?? [])
        .filter(p => p.status === 'active' && p.responded_at)
        .map(async p => {
          const [currentRequester, currentTarget] = await Promise.all([
            computeAvgMastery(ac, p.requester_student_id, p.subject ?? undefined),
            computeAvgMastery(ac, p.target_student_id, p.subject ?? undefined),
          ])
          progressByPairingId.set(p.id, computeProgressStatus(
            p.responded_at, p.baseline_requester_mastery, p.baseline_target_mastery,
            currentRequester, currentTarget,
          ))
        })
    )

    const result = (classes ?? []).map(cls => ({
      classId: cls.id,
      className: cls.name,
      grade: cls.grade,
      section: cls.section,
      pairings: (pairings ?? [])
        .filter(p => p.class_id === cls.id)
        .map(p => ({
          id: p.id,
          status: p.status,
          subject: p.subject ?? undefined,
          activity: p.activity ?? undefined,
          requesterName: nameById.get(p.requester_student_id) ?? 'Student',
          targetName: nameById.get(p.target_student_id) ?? 'Student',
          createdAt: p.created_at,
          progressStatus: progressByPairingId.get(p.id) ?? undefined,
        })),
    }))

    return NextResponse.json({ classes: result })
  } catch (err) {
    console.error('[teacher/peer-pairings GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/teacher/peer-pairings — dissolve a pending or active pairing in
// one of this teacher's classes. The safety valve: a teacher can end any
// pairing at any time, not just ones they were asked to approve upfront.
export async function PATCH(req: NextRequest) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ac = createAdminClient()
    const { data: teacher } = await ac.from('teachers').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = parseBody(PeerPairDissolveSchema, await req.json().catch(() => null))
    if (!parsed.ok) return parsed.response

    const { data: row } = await ac.from('peer_pairings').select('id, class_id').eq('id', parsed.data.id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const classIds = await myClassIds(ac, teacher.id)
    if (!classIds.includes(row.class_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await ac.from('peer_pairings')
      .update({ status: 'dissolved', responded_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[teacher/peer-pairings PATCH] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
