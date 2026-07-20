import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin } from '@/lib/admin-queries'

function sb() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}

// GET /api/admin/schools/[schoolId]/students/[studentId]/full-record — the
// complete picture of one student: every subject's attendance/marks/mastery/
// syllabus progress, plus doubts, teacher notes, and catch-up materials —
// aggregated across every sibling `students` row the legacy per-subject data
// model creates for the same physical child (matched by roll number + grade +
// section + school, the same heuristic `verifyStudentAccess` already uses).
export async function GET(_req: Request, { params }: { params: { schoolId: string; studentId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ac = createAdminClient()
    const admin = await fetchAdmin(user.id, ac)
    if (!admin || admin.schoolId !== params.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: student } = await ac.from('students').select('*').eq('id', params.studentId).maybeSingle()
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    const { data: cls } = await ac.from('classes').select('*').eq('id', student.class_id).maybeSingle()
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    // school_id is the reliable isolation key; a class without one can't be
    // safely confirmed as belonging to this school, so treat it as forbidden.
    if (cls.school_id !== params.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // ── Resolve every subject this student has, and which row-id + class each
    // subject's data actually lives under ─────────────────────────────────────
    interface SubjectRef { classId: string; subjectName: string; teacherName: string; teacherId: string | null; studentRowId: string }
    const subjectRefs: SubjectRef[] = []

    const { data: assignments } = await ac
      .from('teacher_class_assignments').select('teacher_id, subject').eq('class_id', cls.id)

    if (assignments && assignments.length > 0 && assignments.some((a: { subject: string }) => a.subject)) {
      // New model: one class, multiple subject assignments — same student row throughout.
      for (const a of assignments) {
        const { data: t } = await ac.from('teachers').select('name').eq('id', a.teacher_id).maybeSingle()
        subjectRefs.push({
          classId: cls.id, subjectName: a.subject || 'Subject',
          teacherName: t?.name ?? 'Unknown Teacher', teacherId: a.teacher_id,
          studentRowId: student.id,
        })
      }
    } else {
      // Legacy model: each subject is a separate class (same grade+section+school) —
      // find this child's OWN row in each one; that row's own id owns its attendance/marks.
      let q = ac.from('classes').select('*').eq('grade', cls.grade)
      if (cls.section) q = q.eq('section', cls.section)
      if (cls.school_id) q = q.eq('school_id', cls.school_id)
      else q = q.eq('school_name', cls.school_name)
      const { data: allClasses } = await q

      for (const c of allClasses ?? []) {
        const { data: st } = await ac
          .from('students').select('id')
          .eq('class_id', c.id).eq('roll_number', student.roll_number).eq('is_active', true)
          .maybeSingle()
        if (!st) continue
        const { data: t } = await ac.from('teachers').select('name, subject').eq('id', c.teacher_id).maybeSingle()
        subjectRefs.push({
          classId: c.id, subjectName: t?.subject || c.name,
          teacherName: t?.name ?? 'Unknown Teacher', teacherId: c.teacher_id,
          studentRowId: st.id,
        })
      }
    }

    const siblingStudentIds = [...new Set(subjectRefs.map(s => s.studentRowId))]

    // ── Per-subject attendance, marks, mastery, syllabus ────────────────────
    const subjects = await Promise.all(subjectRefs.map(async s => {
      const [attRes, testsRes, masteryRes, syllabusRes] = await Promise.all([
        ac.from('attendance').select('status').eq('student_id', s.studentRowId).eq('class_id', s.classId),
        s.teacherId
          ? ac.from('tests').select('id, topic, total_marks, conducted_on').eq('teacher_id', s.teacherId).eq('class_id', s.classId)
          : Promise.resolve({ data: [] as { id: string; topic: string; total_marks: number; conducted_on: string }[] }),
        ac.from('student_topic_mastery').select('topic, mastery, attempts').eq('student_id', s.studentRowId).eq('subject', s.subjectName),
        ac.from('syllabus_topics').select('is_completed').eq('class_id', s.classId),
      ])

      const attRows = attRes.data ?? []
      const totalSessions = attRows.length
      const presentCount = attRows.filter(a => a.status === 'present' || a.status === 'late').length
      const attendanceRate = totalSessions > 0 ? presentCount / totalSessions : 0

      const tests = testsRes.data ?? []
      let marks: { topic: string; score: number; totalMarks: number; date: string }[] = []
      let avgScore = 0
      if (tests.length > 0) {
        const testIds = tests.map(t => t.id)
        const { data: markRows } = await ac.from('marks').select('test_id, score').eq('student_id', s.studentRowId).in('test_id', testIds)
        const testMap = new Map(tests.map(t => [t.id, t]))
        marks = (markRows ?? [])
          .map(m => {
            const t = testMap.get(m.test_id)
            return t ? { topic: t.topic, score: m.score, totalMarks: t.total_marks, date: t.conducted_on } : null
          })
          .filter((x): x is { topic: string; score: number; totalMarks: number; date: string } => x !== null)
          .sort((a, b) => b.date.localeCompare(a.date))
        if (marks.length > 0) avgScore = marks.reduce((sum, m) => sum + (m.totalMarks > 0 ? m.score / m.totalMarks : 0), 0) / marks.length
      }

      const syllabusRows = syllabusRes.data ?? []

      return {
        classId: s.classId, subjectName: s.subjectName, teacherName: s.teacherName,
        attendanceRate, totalSessions, avgScore, totalTests: marks.length, marks,
        mastery: (masteryRes.data ?? []).map(m => ({ topic: m.topic, mastery: m.mastery, attempts: m.attempts })),
        syllabus: { done: syllabusRows.filter(t => t.is_completed).length, total: syllabusRows.length },
      }
    }))

    // ── Cross-subject activity — keyed to whichever sibling row it landed on ──
    const [doubtsRes, notesRes, catchupRes] = await Promise.all([
      ac.from('student_doubts').select('subject, question, answer, status, created_at').in('student_id', siblingStudentIds).order('created_at', { ascending: false }),
      ac.from('interventions').select('note, date, teacher_id').in('student_id', siblingStudentIds).order('date', { ascending: false }),
      ac.from('catchup_materials').select('topic, subject, status, created_at').in('student_id', siblingStudentIds).order('created_at', { ascending: false }),
    ])

    const noteTeacherIds = [...new Set((notesRes.data ?? []).map(n => n.teacher_id).filter(Boolean))]
    const { data: noteTeachers } = noteTeacherIds.length
      ? await ac.from('teachers').select('id, name').in('id', noteTeacherIds)
      : { data: [] as { id: string; name: string }[] }
    const teacherNameById = new Map((noteTeachers ?? []).map(t => [t.id, t.name]))

    return NextResponse.json({
      student: {
        id: student.id, name: student.name, rollNumber: student.roll_number,
        studentCode: student.student_code ?? null, grade: cls.grade ?? '', section: cls.section ?? '',
      },
      subjects,
      doubts: (doubtsRes.data ?? []).map(d => ({ subject: d.subject, question: d.question, answer: d.answer, status: d.status, createdAt: d.created_at })),
      interventionNotes: (notesRes.data ?? []).map(n => ({ note: n.note, date: n.date, teacherName: n.teacher_id ? teacherNameById.get(n.teacher_id) ?? 'Teacher' : 'Teacher' })),
      catchupMaterials: (catchupRes.data ?? []).map(c => ({ topic: c.topic, subject: c.subject, status: c.status, createdAt: c.created_at })),
    })
  } catch (err) {
    console.error('[admin/students/full-record GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
