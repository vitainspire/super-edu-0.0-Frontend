import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { apiLog, getClientIp } from '@/lib/logger'
import { verifyStudentCookie } from '@/lib/student-auth'

export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()
  try {
    const studentId = verifyStudentCookie(req.cookies.get('edu-student-id')?.value)
    if (!studentId) {
      apiLog({ route: 'student/init', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data: student } = await supabase
      .from('students').select('*').eq('id', studentId).single()
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    const { data: cls } = await supabase
      .from('classes').select('*').eq('id', student.class_id).single()
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

    const tabs: Array<{ classId: string; studentId: string; subject: string; teacherId?: string }> = []

    // Model A: Check if this class has teacher_class_assignments with subjects
    // (new model: one class per grade+section, teachers assigned per subject)
    const { data: classAssignments } = await supabase
      .from('teacher_class_assignments')
      .select('teacher_id, subject')
      .eq('class_id', cls.id)

    if (classAssignments && classAssignments.length > 0 && classAssignments.some((a: { teacher_id: string; subject: string }) => a.subject)) {
      // New model: create one tab per teacher assignment
      for (const a of classAssignments) {
        const label = a.subject || 'Subject'
        tabs.push({ classId: cls.id, studentId: student.id, subject: label, teacherId: a.teacher_id })
      }
    } else {
      // Legacy model: find all classes with same grade+section+school (each class = a subject)
      let classQuery = supabase.from('classes').select('*').eq('grade', cls.grade)
      if (cls.section) classQuery = classQuery.eq('section', cls.section)
      if (cls.school_id) {
        classQuery = classQuery.eq('school_id', cls.school_id)
      } else {
        classQuery = classQuery.eq('school_name', cls.school_name)
      }
      const { data: allClasses } = await classQuery

      for (const c of allClasses ?? []) {
        const { data: st } = await supabase
          .from('students').select('id')
          .eq('class_id', c.id)
          .eq('roll_number', student.roll_number)
          .eq('is_active', true)
          .single()
        if (!st) continue

        const { data: teacher } = await supabase
          .from('teachers').select('subject, id').eq('id', c.teacher_id).single()
        const label = teacher?.subject || c.name

        tabs.push({ classId: c.id, studentId: st.id, subject: label, teacherId: teacher?.id })
      }
    }

    apiLog({ route: 'student/init', ip, userId: studentId, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({
      student: {
        id: student.id,
        name: student.name,
        rollNumber: student.roll_number,
        goal: student.goal ?? '',
        interests: student.interests ?? [],
      },
      primaryClass: {
        id: cls.id,
        grade: cls.grade,
        section: cls.section ?? '',
        schoolId: cls.school_id ?? undefined,
        schoolName: cls.school_name ?? '',
      },
      tabs,
    })
  } catch (err) {
    apiLog({ route: 'student/init', ip, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
