import type { SupabaseClient } from '@supabase/supabase-js'
import type { Admin, School, Teacher, Class, Student, SchoolTimetablePeriod, TimetableEntry, SchoolSchedule, GradeSubject, Announcement, AcademicEvent, ExamPlanItem, TeacherAvailability, TimetableSubstitution } from './types'
import type { SubstituteCandidate } from './substituteFinder'
import { findSubstitute } from './substituteFinder'

type AC = SupabaseClient

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function fetchAdmin(userId: string, ac: AC): Promise<Admin | null> {
  const { data, error } = await ac.from('admins').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    email: data.email,
    schoolId: data.school_id,
    createdAt: data.created_at,
  }
}

export async function upsertAdmin(a: Admin, ac: AC): Promise<void> {
  const { error } = await ac.from('admins').upsert({
    id: a.id,
    user_id: a.userId,
    name: a.name,
    email: a.email,
    school_id: a.schoolId,
    created_at: a.createdAt,
  })
  if (error) throw new Error(error.message)
}

// ── School ────────────────────────────────────────────────────────────────────

export async function fetchSchool(schoolId: string, ac: AC): Promise<School | null> {
  const { data, error } = await ac.from('schools').select('*').eq('id', schoolId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id,
    name: data.name,
    joinCode: data.join_code ?? '',
    createdBy: data.created_by,
    createdAt: data.created_at,
  }
}

export async function createSchool(school: School, ac: AC): Promise<void> {
  const { error } = await ac.from('schools').insert({
    id: school.id,
    name: school.name,
    join_code: school.joinCode,
    created_by: school.createdBy,
    created_at: school.createdAt,
  })
  if (error) throw new Error(error.message)
}

// ── Teachers ──────────────────────────────────────────────────────────────────

export async function fetchSchoolTeachers(schoolId: string, ac: AC): Promise<Teacher[]> {
  const { data, error } = await ac.from('teachers').select('*').eq('school_id', schoolId)
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    schoolName: r.school_name ?? '',
    schoolId: r.school_id,
    subject: r.subject ?? '',
    // Older rows predate this column — fall back to the single `subject` so
    // they still show up as a one-item list instead of empty.
    subjects: r.subjects?.length ? r.subjects : (r.subject ? [r.subject] : []),
    grade: r.grade ?? '',
    phone: r.phone ?? '',
    languagePreference: r.language_preference ?? 'English',
    teacherCode: r.teacher_code,
    maxPeriodsPerDay: r.max_periods_per_day ?? undefined,
    maxPeriodsPerWeek: r.max_periods_per_week ?? undefined,
  }))
}

export async function updateTeacherSubjects(teacherId: string, subjects: string[], ac: AC): Promise<void> {
  const { error } = await ac.from('teachers').update({
    subjects,
    subject: subjects[0] ?? '', // keep the legacy singular field in sync for every existing read site
  }).eq('id', teacherId)
  if (error) throw new Error(error.message)
}

export async function updateTeacherWorkloadLimits(
  teacherId: string,
  maxPeriodsPerDay: number | null,
  maxPeriodsPerWeek: number | null,
  ac: AC
): Promise<void> {
  const { error } = await ac.from('teachers').update({
    max_periods_per_day: maxPeriodsPerDay,
    max_periods_per_week: maxPeriodsPerWeek,
  }).eq('id', teacherId)
  if (error) throw new Error(error.message)
}

export async function removeTeacherFromSchool(teacherId: string, ac: AC): Promise<void> {
  const { error } = await ac.from('teachers').update({ school_id: null }).eq('id', teacherId)
  if (error) throw new Error(error.message)
}

// ── Classes ───────────────────────────────────────────────────────────────────

export async function fetchSchoolClasses(schoolId: string, ac: AC): Promise<Class[]> {
  const { data, error } = await ac.from('classes').select('*').eq('school_id', schoolId)
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    teacherId: r.teacher_id,
    schoolName: r.school_name ?? '',
    schoolId: r.school_id,
    name: r.name,
    grade: r.grade ?? '',
    section: r.section ?? '',
    academicYear: r.academic_year ?? '',
    createdAt: r.created_at,
    classCode: r.class_code,
  }))
}

export async function adminCreateClass(cls: Class, ac: AC): Promise<void> {
  const { error } = await ac.from('classes').insert({
    id: cls.id,
    teacher_id: cls.teacherId,
    school_name: cls.schoolName,
    school_id: cls.schoolId,
    name: cls.name,
    grade: cls.grade,
    section: cls.section,
    academic_year: cls.academicYear,
    created_at: cls.createdAt,
    class_code: cls.classCode,
  })
  if (error) throw new Error(error.message)
}

export async function adminDeleteClass(classId: string, ac: AC): Promise<void> {
  const { error } = await ac.from('classes').delete().eq('id', classId)
  if (error) throw new Error(error.message)
}

// ── Students ──────────────────────────────────────────────────────────────────

export async function fetchSchoolStudents(schoolId: string, ac: AC): Promise<Student[]> {
  const { data: classes, error: classesError } = await ac.from('classes').select('id').eq('school_id', schoolId)
  if (classesError) throw new Error(classesError.message)
  if (!classes || classes.length === 0) return []
  const classIds = classes.map((c: { id: string }) => c.id)
  const { data, error } = await ac.from('students').select('*').in('class_id', classIds)
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    teacherId: r.teacher_id,
    classId: r.class_id,
    name: r.name,
    rollNumber: r.roll_number,
    isActive: r.is_active ?? true,
    interests: r.interests ?? [],
    goal: r.goal ?? '',
    pin: r.pin,
    studentCode: r.student_code ?? undefined,
  }))
}

export async function fetchClassStudents(classId: string, ac: AC): Promise<Student[]> {
  const { data, error } = await ac.from('students').select('*').eq('class_id', classId).order('roll_number')
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    teacherId: r.teacher_id,
    classId: r.class_id,
    name: r.name,
    rollNumber: r.roll_number,
    isActive: r.is_active ?? true,
    interests: r.interests ?? [],
    goal: r.goal ?? '',
    pin: r.pin,
    studentCode: r.student_code ?? undefined,
  }))
}

export async function bulkInsertStudents(
  classId: string,
  rows: { id: string; name: string; rollNumber: string; studentCode: string }[],
  ac: AC
): Promise<void> {
  const records = rows.map(r => ({
    id: r.id,
    teacher_id: null,
    class_id: classId,
    name: r.name,
    roll_number: r.rollNumber,
    is_active: true,
    interests: [],
    goal: '',
    student_code: r.studentCode,
  }))
  const { error } = await ac.from('students').upsert(records, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

export async function deleteStudent(studentId: string, ac: AC): Promise<void> {
  const { error } = await ac.from('students').delete().eq('id', studentId)
  if (error) throw new Error(error.message)
}

// ── Teacher–class assignments ─────────────────────────────────────────────────

export async function assignTeacherToClass(
  id: string,
  teacherId: string,
  classId: string,
  ac: AC,
  subject?: string,
): Promise<void> {
  const { error } = await ac.from('teacher_class_assignments').upsert(
    { id, teacher_id: teacherId, class_id: classId, subject: subject ?? null, created_at: new Date().toISOString() },
    { onConflict: 'teacher_id,class_id' }
  )
  if (error) throw new Error(error.message)
}

export async function removeTeacherFromClass(teacherId: string, classId: string, ac: AC): Promise<void> {
  const { error } = await ac.from('teacher_class_assignments')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('class_id', classId)
  if (error) throw new Error(error.message)
}

export async function fetchClassAssignments(
  classId: string,
  ac: AC
): Promise<{ teacherId: string; classId: string; subject?: string }[]> {
  const { data, error } = await ac.from('teacher_class_assignments').select('*').eq('class_id', classId)
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({ teacherId: r.teacher_id, classId: r.class_id, subject: r.subject ?? undefined }))
}

// ── Grade subject lineup ───────────────────────────────────────────────────────

export async function fetchGradeSubjects(schoolId: string, grade: string, ac: AC): Promise<GradeSubject[]> {
  const { data, error } = await ac
    .from('grade_subjects')
    .select('*')
    .eq('school_id', schoolId)
    .eq('grade', grade)
    .order('order_index')
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    schoolId: r.school_id,
    grade: r.grade,
    subject: r.subject,
    periodsPerWeek: r.periods_per_week ?? 0,
    category: (r.category === 'special' ? 'special' : 'core') as GradeSubject['category'],
    orderIndex: r.order_index ?? 0,
    createdAt: r.created_at,
  }))
}

// Every grade's lineup at once — used by the whole-school timetable generator,
// which needs to reason about all grades together, not one at a time.
export async function fetchAllGradeSubjects(schoolId: string, ac: AC): Promise<GradeSubject[]> {
  const { data, error } = await ac
    .from('grade_subjects')
    .select('*')
    .eq('school_id', schoolId)
    .order('order_index')
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    schoolId: r.school_id,
    grade: r.grade,
    subject: r.subject,
    periodsPerWeek: r.periods_per_week ?? 0,
    category: (r.category === 'special' ? 'special' : 'core') as GradeSubject['category'],
    orderIndex: r.order_index ?? 0,
    createdAt: r.created_at,
  }))
}

export async function upsertGradeSubject(s: GradeSubject, ac: AC): Promise<void> {
  const { error } = await ac.from('grade_subjects').upsert({
    id: s.id,
    school_id: s.schoolId,
    grade: s.grade,
    subject: s.subject,
    periods_per_week: s.periodsPerWeek,
    category: s.category,
    order_index: s.orderIndex,
    created_at: s.createdAt,
  })
  if (error) throw new Error(error.message)
}

export async function deleteGradeSubject(id: string, ac: AC): Promise<void> {
  const { error } = await ac.from('grade_subjects').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── School schedule template ──────────────────────────────────────────────────

export async function fetchSchoolSchedule(schoolId: string, ac: AC): Promise<SchoolSchedule | null> {
  const { data, error } = await ac.from('school_schedule').select('*').eq('school_id', schoolId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { id: data.id, schoolId: data.school_id, slots: data.slots ?? [], createdAt: data.created_at }
}

export async function upsertSchoolSchedule(s: SchoolSchedule, ac: AC): Promise<void> {
  const { error } = await ac.from('school_schedule').upsert({
    id: s.id, school_id: s.schoolId, slots: s.slots,
    created_at: s.createdAt, updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

// ── School timetable ──────────────────────────────────────────────────────────

export async function fetchSchoolTimetable(schoolId: string, ac: AC): Promise<SchoolTimetablePeriod[]> {
  const { data, error } = await ac.from('school_timetable_periods').select('*').eq('school_id', schoolId)
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    schoolId: r.school_id,
    dayOfWeek: r.day_of_week,
    periodNumber: r.period_number,
    startTime: r.start_time,
    endTime: r.end_time,
    classId: r.class_id,
    teacherId: r.teacher_id,
    label: r.label,
    createdAt: r.created_at,
  }))
}

export async function upsertSchoolTimetablePeriod(p: SchoolTimetablePeriod, ac: AC): Promise<void> {
  const { error } = await ac.from('school_timetable_periods').upsert({
    id: p.id,
    school_id: p.schoolId,
    day_of_week: p.dayOfWeek,
    period_number: p.periodNumber,
    start_time: p.startTime,
    end_time: p.endTime,
    class_id: p.classId,
    teacher_id: p.teacherId ?? null,
    label: p.label ?? null,
    created_at: p.createdAt,
  })
  if (error) throw new Error(error.message)
}

export async function deleteSchoolTimetablePeriod(periodId: string, ac: AC): Promise<void> {
  const { error } = await ac.from('school_timetable_periods').delete().eq('id', periodId)
  if (error) throw new Error(error.message)
}

export async function deleteSchoolTimetablePeriodsForClasses(classIds: string[], ac: AC): Promise<void> {
  if (classIds.length === 0) return
  const { error } = await ac.from('school_timetable_periods').delete().in('class_id', classIds)
  if (error) throw new Error(error.message)
}

export async function bulkInsertSchoolTimetablePeriods(periods: SchoolTimetablePeriod[], ac: AC): Promise<void> {
  if (periods.length === 0) return
  const { error } = await ac.from('school_timetable_periods').insert(
    periods.map(p => ({
      id: p.id,
      school_id: p.schoolId,
      day_of_week: p.dayOfWeek,
      period_number: p.periodNumber,
      start_time: p.startTime,
      end_time: p.endTime,
      class_id: p.classId,
      teacher_id: p.teacherId ?? null,
      label: p.label ?? null,
      created_at: p.createdAt,
    }))
  )
  if (error) throw new Error(error.message)
}

export async function publishTimetable(schoolId: string, ac: AC): Promise<void> {
  const periods = await fetchSchoolTimetable(schoolId, ac)
  if (periods.length === 0) return

  // Fan periods out into per-teacher timetable rows
  const rows: Omit<TimetableEntry, never>[] = periods
    .filter(p => p.teacherId)
    .map(p => ({
      // timetable.id is a uuid column — must be a real UUID, not
      // `stp-${p.id}` (that string isn't valid UUID syntax and made every
      // publish silently fail the insert with a Postgres 22P02 error).
      id: crypto.randomUUID(),
      teacherId: p.teacherId!,
      classId: p.classId,
      dayOfWeek: p.dayOfWeek,
      periodNumber: p.periodNumber,
      startTime: p.startTime,
      endTime: p.endTime,
      label: p.label ?? undefined,
    }))

  if (rows.length === 0) return

  // Delete all existing timetable rows for affected teachers before re-inserting
  // to avoid stale entries accumulating across republishes
  const teacherIds = [...new Set(rows.map(r => r.teacherId))]
  const { error: delErr } = await ac.from('timetable').delete().in('teacher_id', teacherIds)
  if (delErr) throw new Error(delErr.message)

  const { error: insErr } = await ac.from('timetable').insert(
    rows.map(r => ({
      id: r.id,
      teacher_id: r.teacherId,
      class_id: r.classId,
      day_of_week: r.dayOfWeek,
      period_number: r.periodNumber,
      start_time: r.startTime,
      end_time: r.endTime,
      label: r.label ?? null,
    }))
  )
  if (insErr) throw new Error(insErr.message)
}

// Publish just the given classes' current draft periods to their teachers, leaving
// every other class/teacher's already-published timetable untouched. Scoped by
// class_id (not teacher_id) so a teacher who also teaches classes outside this set
// keeps those other published entries intact.
export async function publishTimetableForClasses(schoolId: string, classIds: string[], ac: AC): Promise<number> {
  if (classIds.length === 0) return 0

  const { data, error: selErr } = await ac
    .from('school_timetable_periods')
    .select('*')
    .eq('school_id', schoolId)
    .in('class_id', classIds)
  if (selErr) throw new Error(selErr.message)

  const rows = (data ?? [])
    .filter((p: Record<string, unknown>) => p.teacher_id)
    .map((p: Record<string, unknown>) => ({
      // Same fix as publishTimetable above — timetable.id is a uuid column.
      id: crypto.randomUUID(),
      teacher_id: p.teacher_id,
      class_id: p.class_id,
      day_of_week: p.day_of_week,
      period_number: p.period_number,
      start_time: p.start_time,
      end_time: p.end_time,
      label: p.label ?? null,
    }))

  const { error: delErr } = await ac.from('timetable').delete().in('class_id', classIds)
  if (delErr) throw new Error(delErr.message)
  if (rows.length > 0) {
    const { error } = await ac.from('timetable').insert(rows)
    if (error) throw new Error(error.message)
  }
  return rows.length
}

// ── Announcements ─────────────────────────────────────────────────────────────

export async function fetchSchoolAnnouncements(schoolId: string, ac: AC): Promise<Announcement[]> {
  const { data, error } = await ac
    .from('announcements')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    schoolId: r.school_id,
    adminId: r.admin_id,
    adminName: r.admin_name ?? 'Admin',
    title: r.title,
    body: r.body,
    category: (r.category ?? 'general') as Announcement['category'],
    createdAt: r.created_at,
  }))
}

export async function createAnnouncement(a: Announcement, ac: AC): Promise<void> {
  const { error } = await ac.from('announcements').insert({
    id: a.id,
    school_id: a.schoolId,
    admin_id: a.adminId,
    admin_name: a.adminName,
    title: a.title,
    body: a.body,
    category: a.category,
    created_at: a.createdAt,
  })
  if (error) throw new Error(error.message)
}

export async function deleteAnnouncement(id: string, schoolId: string, ac: AC): Promise<void> {
  const { error } = await ac.from('announcements').delete().eq('id', id).eq('school_id', schoolId)
  if (error) throw new Error(error.message)
}

// ── Academic calendar ────────────────────────────────────────────────────────

export async function fetchAcademicEvents(schoolId: string, ac: AC): Promise<AcademicEvent[]> {
  const { data, error } = await ac
    .from('academic_events')
    .select('*')
    .eq('school_id', schoolId)
    .order('start_date', { ascending: true })
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    schoolId: r.school_id,
    title: r.title,
    category: r.category as AcademicEvent['category'],
    holidaySubtype: r.holiday_subtype ?? undefined,
    countsAsNonWorking: r.counts_as_non_working ?? true,
    published: r.published ?? false,
    startDate: r.start_date,
    endDate: r.end_date,
    description: r.description ?? undefined,
    createdAt: r.created_at,
  }))
}

// Only the published (circulated) events — what teachers should see.
export async function fetchPublishedAcademicEvents(schoolId: string, ac: AC): Promise<AcademicEvent[]> {
  const { data, error } = await ac
    .from('academic_events')
    .select('*')
    .eq('school_id', schoolId)
    .eq('published', true)
    .order('start_date', { ascending: true })
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    schoolId: r.school_id,
    title: r.title,
    category: r.category as AcademicEvent['category'],
    holidaySubtype: r.holiday_subtype ?? undefined,
    countsAsNonWorking: r.counts_as_non_working ?? true,
    published: true,
    startDate: r.start_date,
    endDate: r.end_date,
    description: r.description ?? undefined,
    createdAt: r.created_at,
  }))
}

export async function upsertAcademicEvent(e: AcademicEvent, ac: AC): Promise<void> {
  const { error } = await ac.from('academic_events').upsert({
    id: e.id,
    school_id: e.schoolId,
    title: e.title,
    category: e.category,
    holiday_subtype: e.holidaySubtype ?? null,
    counts_as_non_working: e.countsAsNonWorking,
    published: e.published,
    start_date: e.startDate,
    end_date: e.endDate,
    description: e.description ?? null,
    created_at: e.createdAt,
  })
  if (error) throw new Error(error.message)
}

// Publishes every current draft event for the school in one go — a
// deliberate, explicit action, not automatic on every edit.
export async function publishAcademicEvents(schoolId: string, ac: AC): Promise<number> {
  const { data, error } = await ac
    .from('academic_events')
    .update({ published: true })
    .eq('school_id', schoolId)
    .eq('published', false)
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

export async function deleteAcademicEvent(id: string, schoolId: string, ac: AC): Promise<void> {
  const { error } = await ac.from('academic_events').delete().eq('id', id).eq('school_id', schoolId)
  if (error) throw new Error(error.message)
}

// ── Exam plan (school-wide exam-type quotas) ─────────────────────────────────

export async function fetchExamPlanItems(schoolId: string, ac: AC): Promise<ExamPlanItem[]> {
  const { data, error } = await ac
    .from('exam_plan_items')
    .select('*')
    .eq('school_id', schoolId)
    .order('order_index')
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    schoolId: r.school_id,
    name: r.name,
    count: r.count ?? 1,
    orderIndex: r.order_index ?? 0,
    createdAt: r.created_at,
  }))
}

export async function upsertExamPlanItem(item: ExamPlanItem, ac: AC): Promise<void> {
  const { error } = await ac.from('exam_plan_items').upsert({
    id: item.id,
    school_id: item.schoolId,
    name: item.name,
    count: item.count,
    order_index: item.orderIndex,
    created_at: item.createdAt,
  })
  if (error) throw new Error(error.message)
}

export async function deleteExamPlanItem(id: string, ac: AC): Promise<void> {
  const { error } = await ac.from('exam_plan_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Teacher availability & substitutes ──────────────────────────────────────────

export async function fetchTeacherAvailability(schoolId: string, date: string, ac: AC): Promise<TeacherAvailability[]> {
  const { data, error } = await ac
    .from('teacher_availability')
    .select('*')
    .eq('school_id', schoolId)
    .eq('date', date)
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    schoolId: r.school_id,
    teacherId: r.teacher_id,
    date: r.date,
    reason: r.reason,
    note: r.note ?? undefined,
    source: (r.source ?? 'admin') as TeacherAvailability['source'],
  }))
}

// All of one teacher's own availability rows (their leave requests), from
// `fromDate` onward — used for the "Leaves" section on the teacher's own
// Profile page, as opposed to fetchTeacherAvailability above which is scoped
// to the whole school on a single date (the admin's Substitutes page).
export async function fetchTeacherAvailabilityForTeacher(teacherId: string, fromDate: string, ac: AC): Promise<TeacherAvailability[]> {
  const { data, error } = await ac
    .from('teacher_availability')
    .select('*')
    .eq('teacher_id', teacherId)
    .gte('date', fromDate)
    .order('date', { ascending: true })
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    schoolId: r.school_id,
    teacherId: r.teacher_id,
    date: r.date,
    reason: r.reason,
    note: r.note ?? undefined,
    source: (r.source ?? 'admin') as TeacherAvailability['source'],
  }))
}

export async function upsertTeacherAvailability(a: TeacherAvailability, ac: AC): Promise<void> {
  const { error } = await ac.from('teacher_availability').upsert(
    {
      id: a.id,
      school_id: a.schoolId,
      teacher_id: a.teacherId,
      date: a.date,
      reason: a.reason,
      note: a.note ?? null,
      source: a.source,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'teacher_id,date' }
  )
  if (error) throw new Error(error.message)
}

export async function deleteTeacherAvailability(teacherId: string, date: string, ac: AC): Promise<void> {
  const { error } = await ac.from('teacher_availability').delete().eq('teacher_id', teacherId).eq('date', date)
  if (error) throw new Error(error.message)
}

export async function fetchSubstitutionsForDate(schoolId: string, date: string, ac: AC): Promise<TimetableSubstitution[]> {
  const { data, error } = await ac
    .from('timetable_substitutions')
    .select('*')
    .eq('school_id', schoolId)
    .eq('date', date)
  if (error) throw new Error(error.message)
  if (!data) return []
  return data.map(r => ({
    id: r.id,
    schoolId: r.school_id,
    date: r.date,
    dayOfWeek: r.day_of_week,
    periodNumber: r.period_number,
    classId: r.class_id,
    subject: r.subject ?? undefined,
    originalTeacherId: r.original_teacher_id,
    substituteTeacherId: r.substitute_teacher_id ?? undefined,
    status: r.status,
  }))
}

export async function upsertSubstitutions(rows: TimetableSubstitution[], ac: AC): Promise<void> {
  if (rows.length === 0) return
  const { error } = await ac.from('timetable_substitutions').upsert(
    rows.map(r => ({
      id: r.id,
      school_id: r.schoolId,
      date: r.date,
      day_of_week: r.dayOfWeek,
      period_number: r.periodNumber,
      class_id: r.classId,
      subject: r.subject ?? null,
      original_teacher_id: r.originalTeacherId,
      substitute_teacher_id: r.substituteTeacherId ?? null,
      status: r.status,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'class_id,date,period_number' }
  )
  if (error) throw new Error(error.message)
}

export async function deleteSubstitutionsForTeacherOnDate(teacherId: string, date: string, ac: AC): Promise<void> {
  const { error } = await ac.from('timetable_substitutions').delete().eq('original_teacher_id', teacherId).eq('date', date)
  if (error) throw new Error(error.message)
}

export async function updateSubstituteAssignment(substitutionId: string, substituteTeacherId: string, ac: AC): Promise<void> {
  const { error } = await ac.from('timetable_substitutions').update({
    substitute_teacher_id: substituteTeacherId,
    status: 'manual',
    updated_at: new Date().toISOString(),
  }).eq('id', substitutionId)
  if (error) throw new Error(error.message)
}

/**
 * Marks a teacher unavailable for a date and (re)computes substitute
 * assignments for their affected periods. Shared by the admin "set status"
 * flow and the teacher's own daily check-in — `source` records which one.
 */
export async function markTeacherUnavailable(
  schoolId: string,
  teacherId: string,
  date: string,
  reason: TeacherAvailability['reason'],
  source: TeacherAvailability['source'],
  note: string | undefined,
  ac: AC
): Promise<void> {
  await upsertTeacherAvailability(
    { id: `${teacherId}-${date}`, schoolId, teacherId, date, reason, note, source },
    ac
  )

  const dayOfWeek = new Date(date + 'T00:00:00').getDay()

  const [{ data: needRows, error: needErr }, availability, existingSubs, candidates] = await Promise.all([
    ac.from('timetable').select('*').eq('teacher_id', teacherId).eq('day_of_week', dayOfWeek),
    fetchTeacherAvailability(schoolId, date, ac),
    fetchSubstitutionsForDate(schoolId, date, ac),
    fetchTeacherEligibilityData(schoolId, date, ac),
  ])
  if (needErr) throw new Error(needErr.message)

  const excludeTeacherIds = new Set<string>([teacherId, ...availability.map(a => a.teacherId)])

  // Seed "already used this slot today" from substitutions already assigned
  // for OTHER teachers' absences today, keyed by day|period, so two absent
  // teachers don't get double-booked to the same substitute for one period.
  const usedBySlot = new Map<string, Set<string>>()
  for (const s of existingSubs) {
    if (s.originalTeacherId === teacherId) continue // being recomputed below
    if (!s.substituteTeacherId) continue
    const key = `${s.dayOfWeek}|${s.periodNumber}`
    if (!usedBySlot.has(key)) usedBySlot.set(key, new Set())
    usedBySlot.get(key)!.add(s.substituteTeacherId)
  }

  const newSubs: TimetableSubstitution[] = []
  for (const row of needRows ?? []) {
    const need = { dayOfWeek, periodNumber: row.period_number as number, subject: (row.label as string) ?? '' }
    const slotKey = `${need.dayOfWeek}|${need.periodNumber}`
    const usedThisSlot = usedBySlot.get(slotKey) ?? new Set<string>()

    // Subject-qualified teachers only. There used to be a fallback to any free
    // teacher, so a period was always "covered" — but by someone who couldn't
    // teach it and who got no class access either, producing a booking that
    // read as solved while the class was really just being supervised. An
    // unfillable period is left unresolved for an admin to deal with.
    const substituteId = findSubstitute(need, candidates, excludeTeacherIds, usedThisSlot)
    if (substituteId) {
      if (!usedBySlot.has(slotKey)) usedBySlot.set(slotKey, new Set())
      usedBySlot.get(slotKey)!.add(substituteId)
    }

    newSubs.push({
      id: `${row.class_id}-${date}-${row.period_number}`,
      schoolId,
      date,
      dayOfWeek,
      periodNumber: row.period_number as number,
      classId: row.class_id as string,
      subject: (row.label as string) ?? undefined,
      originalTeacherId: teacherId,
      substituteTeacherId: substituteId ?? undefined,
      status: substituteId ? 'assigned' : 'unresolved',
    })
  }

  await upsertSubstitutions(newSubs, ac)
}

export async function revertTeacherAvailability(teacherId: string, date: string, ac: AC): Promise<void> {
  await deleteTeacherAvailability(teacherId, date, ac)
  await deleteSubstitutionsForTeacherOnDate(teacherId, date, ac)
}

// Monday–Saturday range containing `date` (school days are 1=Mon..6=Sat).
function weekRangeOf(date: string): { start: string; end: string } {
  const d = new Date(date + 'T00:00:00')
  const dow = d.getDay() || 7   // treat Sunday as 7 so it still resolves to the preceding week
  const monday = new Date(d)
  monday.setDate(d.getDate() - (dow - 1))
  const saturday = new Date(monday)
  saturday.setDate(monday.getDate() + 5)
  const toStr = (x: Date) => x.toISOString().slice(0, 10)
  return { start: toStr(monday), end: toStr(saturday) }
}

/**
 * Builds one SubstituteCandidate per school teacher. Teacher.subject/grade
 * aren't reliable (grade is never actually set — see Teacher type comment),
 * so `subjectsTaught` is derived empirically from teacher_class_assignments
 * and the labels on the teacher's own published timetable rows. `weeklyLoad`
 * is their regular weekly period count plus any substitute periods they've
 * already picked up this week, so workload caps account for both.
 */
export async function fetchTeacherEligibilityData(schoolId: string, date: string, ac: AC): Promise<SubstituteCandidate[]> {
  const teachers = await fetchSchoolTeachers(schoolId, ac)
  const teacherIds = teachers.map(t => t.id)
  if (teacherIds.length === 0) return []

  const { start, end } = weekRangeOf(date)

  const [asgResult, ttResult, subsResult] = await Promise.all([
    ac.from('teacher_class_assignments').select('teacher_id, subject').in('teacher_id', teacherIds),
    ac.from('timetable').select('teacher_id, day_of_week, period_number, label').in('teacher_id', teacherIds),
    ac.from('timetable_substitutions').select('substitute_teacher_id')
      .in('substitute_teacher_id', teacherIds).gte('date', start).lte('date', end),
  ])
  if (asgResult.error) throw new Error(asgResult.error.message)
  if (ttResult.error) throw new Error(ttResult.error.message)
  if (subsResult.error) throw new Error(subsResult.error.message)

  const subjectsByTeacher = new Map<string, Set<string>>()
  const busyByTeacher = new Map<string, Set<string>>()
  const extraLoadByTeacher = new Map<string, number>()
  const ensure = (map: Map<string, Set<string>>, id: string) => {
    if (!map.has(id)) map.set(id, new Set())
    return map.get(id)!
  }

  for (const r of asgResult.data ?? []) {
    if (r.subject) ensure(subjectsByTeacher, r.teacher_id).add(r.subject)
  }
  for (const r of ttResult.data ?? []) {
    if (r.label) ensure(subjectsByTeacher, r.teacher_id).add(r.label)
    ensure(busyByTeacher, r.teacher_id).add(`${r.day_of_week}|${r.period_number}`)
  }
  for (const r of subsResult.data ?? []) {
    const id = r.substitute_teacher_id as string | null
    if (id) extraLoadByTeacher.set(id, (extraLoadByTeacher.get(id) ?? 0) + 1)
  }

  return teachers.map(t => {
    const busySlots = busyByTeacher.get(t.id) ?? new Set<string>()
    return {
      teacherId: t.id,
      name: t.name,
      subjectsTaught: subjectsByTeacher.get(t.id) ?? new Set<string>(),
      busySlots,
      maxPeriodsPerDay: t.maxPeriodsPerDay,
      maxPeriodsPerWeek: t.maxPeriodsPerWeek,
      weeklyLoad: busySlots.size + (extraLoadByTeacher.get(t.id) ?? 0),
    }
  })
}
