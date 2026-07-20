import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'

function createSSRClient(cookieStore: ReturnType<typeof cookies>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )
}

// GET /api/teacher/school-data
// Returns admin-assigned classes, students, timetable, and assignments for the
// current teacher. Uses service-role client to bypass RLS on admin-managed tables.
//
// Classes are sourced from TWO places so both admin workflows are covered:
//   1. teacher_class_assignments  — admin used the "Assign" button on the class card
//   2. school_timetable_periods   — admin assigned teacher directly while filling the timetable
// We union both and return the distinct set of classes.
export async function GET() {
  const empty = { classes: [], students: [], timetable: [], assignments: [] }
  try {
    const cookieStore = cookies()
    const { data: { user } } = await createSSRClient(cookieStore).auth.getUser()
    if (!user) return NextResponse.json(empty)

    const ac = createAdminClient()

    // Resolve teacher profile from auth user id
    const { data: teacherRow } = await ac
      .from('teachers')
      .select('id, school_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!teacherRow?.school_id) return NextResponse.json(empty)

    const teacherId = teacherRow.id as string

    // ── Fetch both data sources in parallel ──────────────────────────────────────
    const [asgResult, timetableResult] = await Promise.all([
      ac.from('teacher_class_assignments')
        .select('id, class_id, subject, created_at')
        .eq('teacher_id', teacherId),
      ac.from('school_timetable_periods')
        .select('*')
        .eq('teacher_id', teacherId),
    ])

    const asgRows       = asgResult.data     ?? []
    const timetableRows = timetableResult.data ?? []

    // ── Build assignment list ────────────────────────────────────────────────────
    // Include explicit assignments from teacher_class_assignments PLUS synthetic
    // assignments for any class that appears only in timetable periods.
    // This ensures home/classes pages compute myClasses correctly even when the
    // admin used the timetable path instead of the "Assign" button.
    const asgClassIds = new Set(asgRows.map((r: Row) => r.class_id as string))
    const ttClassIds  = [...new Set(timetableRows.map((r: Row) => r.class_id as string))]
    const syntheticAssignments = ttClassIds
      .filter(id => !asgClassIds.has(id))
      .map(classId => ({
        id:        `timetable-derived-${classId}`,
        teacherId,
        classId,
        subject:   undefined as string | undefined,
        createdAt: '',
      }))

    const assignments = [
      ...asgRows.map((r: Row) => ({
        id:        r.id          as string,
        teacherId,
        classId:   r.class_id   as string,
        subject:   (r.subject   as string) ?? undefined,
        createdAt: (r.created_at as string) ?? '',
      })),
      ...syntheticAssignments,
    ]

    // ── Build timetable entries ───────────────────────────────────────────────────
    // Prefer live school_timetable_periods; fall back to published timetable table
    let timetable: ReturnType<typeof mapTimetable>
    if (timetableRows.length > 0) {
      timetable = timetableRows.map((r: Row) => ({
        id:           `stp-${r.id as string}`,
        teacherId:    r.teacher_id    as string,
        classId:      r.class_id      as string,
        dayOfWeek:    r.day_of_week   as number,
        periodNumber: r.period_number as number,
        startTime:    r.start_time    as string,
        endTime:      r.end_time      as string,
        label:        (r.label        as string) ?? undefined,
      }))
    } else {
      const { data: pubRows } = await ac.from('timetable').select('*').eq('teacher_id', teacherId)
      timetable = mapTimetable(pubRows ?? [])
    }

    // ── Union class IDs from both sources ────────────────────────────────────────
    // An admin can assign a teacher to a class via the "Assign" button OR by simply
    // adding them to a timetable period. Either route should surface the class.
    const classIdSet = new Set<string>([
      ...asgRows.map((r: Row) => r.class_id as string),
      ...timetableRows.map((r: Row) => r.class_id as string),
    ])
    const classIds = [...classIdSet]

    if (!classIds.length) {
      return NextResponse.json({ ...empty, timetable, assignments })
    }

    // ── Fetch classes + students ──────────────────────────────────────────────────
    const [classResult, studentResult] = await Promise.all([
      ac.from('classes').select('*').in('id', classIds),
      ac.from('students').select('*').in('class_id', classIds).order('roll_number'),
    ])

    return NextResponse.json({
      classes:  mapClasses(classResult.data   ?? []),
      students: mapStudents(studentResult.data ?? []),
      timetable,
      assignments,
    })
  } catch (err) {
    console.error('[teacher/school-data] failed:', err)
    return NextResponse.json(empty)
  }
}

type Row = Record<string, unknown>

function mapClasses(rows: Row[]) {
  return rows.map(r => ({
    id:           r.id             as string,
    teacherId:    r.teacher_id     as string,
    schoolName:   (r.school_name   as string) ?? '',
    schoolId:     (r.school_id     as string) ?? undefined,
    name:         r.name           as string,
    grade:        r.grade          as string,
    section:      (r.section       as string) ?? '',
    academicYear: (r.academic_year as string) ?? '',
    createdAt:    (r.created_at    as string) ?? '',
    classCode:    (r.class_code    as string) ?? undefined,
  }))
}

function mapStudents(rows: Row[]) {
  return rows.map(r => ({
    id:          r.id            as string,
    teacherId:   r.teacher_id   as string,
    classId:     (r.class_id    as string) ?? '',
    name:        r.name          as string,
    rollNumber:  r.roll_number   as string,
    isActive:    r.is_active     as boolean,
    interests:   (r.interests    as string[]) ?? [],
    goal:        (r.goal         as string) ?? '',
    pin:         (r.pin          as string) ?? undefined,
    studentCode: (r.student_code as string) ?? undefined,
  }))
}

function mapTimetable(rows: Row[]) {
  return rows.map(r => ({
    id:           r.id            as string,
    teacherId:    r.teacher_id    as string,
    classId:      r.class_id      as string,
    dayOfWeek:    r.day_of_week   as number,
    periodNumber: r.period_number as number,
    startTime:    r.start_time    as string,
    endTime:      r.end_time      as string,
    label:        (r.label        as string) ?? undefined,
  }))
}
