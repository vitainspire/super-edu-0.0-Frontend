import type { Teacher, Class, AcademicEvent } from '../types'
import { formatDateLabel } from './ask'

export type AdminAskIntent =
  | 'overview' | 'teachers' | 'classes' | 'leave_requests' | 'approve_leave' | 'reject_leave'
  | 'substitutes' | 'announcements' | 'post_announcement' | 'calendar' | 'exam_schedule'
  | 'syllabus_status' | 'textbook_status' | 'unknown'

export interface ParsedAdminAsk {
  intent: AdminAskIntent
  teacherRef: string | null
  announcementTitle: string | null
  announcementBody: string | null
  announcementCategory: string
  gradeRef: string | null
  subjectRef: string | null
}

/** Loose, forgiving match — mirrors lib/logic/ask.ts's helper of the same
 * name (not imported from there to avoid coupling two otherwise-independent
 * portals' logic files over one tiny string-matching function). */
function looseMatch(ref: string, candidate: string): boolean {
  const a = ref.trim().toLowerCase()
  const b = candidate.trim().toLowerCase()
  if (!a || !b) return false
  return a === b || b.includes(a) || a.includes(b)
}

/** Three real outcomes, not two — see lib/logic/ask.ts's matchStudent for
 * why collapsing "ambiguous" into "none" is a real correctness bug, not a
 * simplification. */
export type MatchResult<T> =
  | { kind: 'found'; item: T }
  | { kind: 'ambiguous'; candidates: T[] }
  | { kind: 'none' }

export function matchTeacher(ref: string, teachers: Teacher[]): MatchResult<Teacher> {
  const exact = teachers.filter(t => t.name.trim().toLowerCase() === ref.trim().toLowerCase())
  if (exact.length === 1) return { kind: 'found', item: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact }
  const loose = teachers.filter(t => looseMatch(ref, t.name))
  if (loose.length === 1) return { kind: 'found', item: loose[0] }
  if (loose.length > 1) return { kind: 'ambiguous', candidates: loose }
  return { kind: 'none' }
}

export interface PendingLeaveRow {
  id: string
  teacherId: string
  teacherName: string
  date: string
  reason: string
  note?: string | null
  status: string
}

export interface LeaveRange {
  startDate: string
  endDate: string
  reason: string
}

/** Matches a name against only the teachers who actually have a pending
 * request — narrower and safer than matching the full teacher roster, since
 * "approve Rakesh's leave" should never resolve to some other Rakesh who has
 * nothing pending. */
export function matchPendingTeacher(ref: string, rows: PendingLeaveRow[]): MatchResult<{ teacherId: string; teacherName: string }> {
  const uniq = new Map<string, string>()
  for (const r of rows) uniq.set(r.teacherId, r.teacherName)
  const list = [...uniq.entries()].map(([teacherId, teacherName]) => ({ teacherId, teacherName }))
  const exact = list.filter(t => t.teacherName.trim().toLowerCase() === ref.trim().toLowerCase())
  if (exact.length === 1) return { kind: 'found', item: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact }
  const loose = list.filter(t => looseMatch(ref, t.teacherName))
  if (loose.length === 1) return { kind: 'found', item: loose[0] }
  if (loose.length > 1) return { kind: 'ambiguous', candidates: loose }
  return { kind: 'none' }
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The backend stores one pending row PER DAY (see teacher_availability) —
 * this collapses one teacher's consecutive same-reason days into ranges, the
 * same idea LeavesSection.tsx already applies client-side for the teacher's
 * own view of their requests. A single contiguous range is the case the
 * confirm-before-approve flow can act on directly; more than one distinct
 * range means asking which one, rather than guessing. */
export function groupPendingRanges(rows: PendingLeaveRow[]): LeaveRange[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const ranges: LeaveRange[] = []
  for (const row of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && last.reason === row.reason && addDaysIso(last.endDate, 1) === row.date) {
      last.endDate = row.date
    } else {
      ranges.push({ startDate: row.date, endDate: row.date, reason: row.reason })
    }
  }
  return ranges
}

export function buildOverviewAnswer(o: {
  teacherCount: number
  classCount: number
  studentCount: number
  timetableCoverage: number
  readiness: { classesWithoutTeacher: number; classesWithoutStudents: number; unstaffedPeriods: number }
  operations: { attendanceRate: number | null; pendingDoubts: number; teachersAbsentToday: number; unresolvedCover: number }
}): string {
  const parts = [
    `${o.teacherCount} teachers`, `${o.classCount} classes`, `${o.studentCount} students`,
    `${o.timetableCoverage}% timetable coverage`,
  ]
  const flags: string[] = []
  if (o.readiness.classesWithoutTeacher) flags.push(`${o.readiness.classesWithoutTeacher} class${o.readiness.classesWithoutTeacher > 1 ? 'es' : ''} without a teacher`)
  if (o.readiness.unstaffedPeriods) flags.push(`${o.readiness.unstaffedPeriods} unstaffed period${o.readiness.unstaffedPeriods > 1 ? 's' : ''}`)
  if (o.operations.unresolvedCover) flags.push(`${o.operations.unresolvedCover} unresolved substitute gap${o.operations.unresolvedCover > 1 ? 's' : ''} today`)
  if (o.operations.teachersAbsentToday) flags.push(`${o.operations.teachersAbsentToday} teacher${o.operations.teachersAbsentToday > 1 ? 's' : ''} absent today`)
  if (o.operations.pendingDoubts) flags.push(`${o.operations.pendingDoubts} unanswered student doubt${o.operations.pendingDoubts > 1 ? 's' : ''}`)
  const flagLine = flags.length ? ` Needs attention: ${flags.join(', ')}.` : ' Nothing urgent flagged.'
  return `${parts.join(', ')}.${flagLine}`
}

export function buildTeachersAnswer(teachers: Teacher[], one: Teacher | null): string {
  if (one) {
    const subjects = one.subjects?.length ? one.subjects.join(', ') : one.subject || 'no subject set'
    const dayCap = one.maxPeriodsPerDay ? `${one.maxPeriodsPerDay}/day` : ''
    const weekCap = one.maxPeriodsPerWeek ? `${one.maxPeriodsPerWeek}/week` : ''
    const capLine = dayCap || weekCap ? ` Workload cap: ${[dayCap, weekCap].filter(Boolean).join(', ')}.` : ''
    return `${one.name} — teaches ${subjects}, grade ${one.grade || 'unset'}.${capLine}`
  }
  if (!teachers.length) return 'No teachers added yet.'
  const names = teachers.slice(0, 8).map(t => t.name)
  return `${teachers.length} teacher${teachers.length !== 1 ? 's' : ''}: ${names.join(', ')}${teachers.length > 8 ? ', and others' : ''}.`
}

export function buildClassesAnswer(classes: Class[]): string {
  if (!classes.length) return 'No classes set up yet.'
  const byGrade = new Map<string, number>()
  for (const c of classes) byGrade.set(c.grade, (byGrade.get(c.grade) ?? 0) + 1)
  const summary = [...byGrade.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([g, n]) => `Grade ${g}: ${n}`).join(', ')
  return `${classes.length} class${classes.length !== 1 ? 'es' : ''} total — ${summary}.`
}

export function buildLeaveRequestsAnswer(rows: PendingLeaveRow[]): string {
  if (!rows.length) return 'No pending leave requests.'
  const byTeacher = new Map<string, PendingLeaveRow[]>()
  for (const r of rows) {
    const list = byTeacher.get(r.teacherId) ?? []
    list.push(r)
    byTeacher.set(r.teacherId, list)
  }
  const parts = [...byTeacher.values()].map(teacherRows => {
    const ranges = groupPendingRanges(teacherRows)
    const dateBits = ranges.map(r => r.startDate === r.endDate ? r.startDate : `${r.startDate} to ${r.endDate}`)
    return `${teacherRows[0].teacherName} (${dateBits.join(', ')})`
  })
  return `${rows.length} pending day${rows.length !== 1 ? 's' : ''} across ${byTeacher.size} teacher${byTeacher.size !== 1 ? 's' : ''}: ${parts.join('; ')}.`
}

interface SubstituteAvailabilityRow { teacherId: string }
interface SubstitutionRow { status: string; periodNumber: number; className: string }
export function buildSubstitutesAnswer(availability: SubstituteAvailabilityRow[], substitutions: SubstitutionRow[]): string {
  const out = availability.length
  if (!out && !substitutions.length) return 'Nobody out today — no substitute coverage needed.'
  const unresolved = substitutions.filter(s => s.status === 'unresolved')
  const resolved = substitutions.filter(s => s.status !== 'unresolved')
  const parts = [`${out} teacher${out !== 1 ? 's' : ''} out today`]
  if (resolved.length) parts.push(`${resolved.length} period${resolved.length !== 1 ? 's' : ''} covered`)
  if (unresolved.length) {
    const gaps = unresolved.slice(0, 3).map(s => `Period ${s.periodNumber} (${s.className})`)
    parts.push(`${unresolved.length} unresolved gap${unresolved.length !== 1 ? 's' : ''}: ${gaps.join(', ')}`)
  }
  return `${parts.join(', ')}.`
}

/** Bounded to a real window, not "everything ever scheduled" — the previous
 * version reported a count across the whole future calendar while only ever
 * displaying the first 3, so a school with 15 holidays on record somewhere in
 * the next two years said "15 upcoming holidays" and then named 3 of them,
 * which reads as contradictory. windowDays defaults to roughly two months, a
 * reasonable stand-in for "this month and next month" without needing full
 * date-range parsing on top of the single-day parsing resolveDateRef already
 * does — every holiday within the window is listed, none silently dropped. */
export function buildCalendarAnswer(events: AcademicEvent[], windowDays = 60): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + windowDays)
  const upcoming = events
    .filter(e => {
      const start = new Date(e.startDate + 'T00:00:00').getTime()
      return e.category === 'holiday' && start >= today.getTime() && start <= horizon.getTime()
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  // A count alone invites exactly the confusion this replaced: "why does
  // this say 15 when only 3 are named?" — every version of this answer now
  // states its own window explicitly and, when the events aren't all the
  // same kind, breaks that down too, so nothing about what the number
  // actually contains has to be guessed at.
  const rangeLabel = `${formatDateLabel(today)} to ${formatDateLabel(horizon)}`
  if (!upcoming.length) return `No holidays between ${rangeLabel}.`

  const bySubtype = new Map<string, number>()
  for (const e of upcoming) bySubtype.set(e.holidaySubtype ?? 'other', (bySubtype.get(e.holidaySubtype ?? 'other') ?? 0) + 1)
  const subtypeLabel = (s: string) => s === 'public' ? 'public holiday' : s === 'school' ? 'school holiday' : s === 'cultural' ? 'cultural event' : 'other'
  const breakdown = bySubtype.size > 1
    ? ` (${[...bySubtype.entries()].map(([s, n]) => `${n} ${subtypeLabel(s)}${n > 1 ? 's' : ''}`).join(', ')})`
    : ''

  const list = upcoming.map(e => `${e.title} (${e.startDate})`)
  return `${upcoming.length} holiday${upcoming.length !== 1 ? 's' : ''} between ${rangeLabel}${breakdown}: ${list.join(', ')}.`
}

function formatExamDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Exams are a distinct category on the same academic_events table as
 * holidays (see AcademicEvent['category']), not a filtered view of
 * buildCalendarAnswer — that function deliberately only ever looked at
 * category 'holiday', so a question about exam months/dates routed through
 * it came back with holidays instead, answering something the admin never
 * asked. Unbounded rather than windowed like holidays: exam blocks are few
 * and often scheduled further ahead than 60 days, so a fixed window would
 * silently hide the very "which months" answer being asked for. */
export function buildExamScheduleAnswer(events: AcademicEvent[]): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = events
    .filter(e => e.category === 'exam' && new Date(e.endDate + 'T00:00:00').getTime() >= today.getTime())
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  if (!upcoming.length) return 'No exams scheduled yet — add them from the Academic Calendar page.'
  const list = upcoming.map(e => {
    const range = e.startDate === e.endDate ? formatExamDate(e.startDate) : `${formatExamDate(e.startDate)} to ${formatExamDate(e.endDate)}`
    return `${e.title} (${range})`
  })
  return `${upcoming.length} exam${upcoming.length !== 1 ? 's' : ''} scheduled: ${list.join(', ')}.`
}

export interface SyllabusStatusSection { classId: string; section: string; completed: number; total: number }

/** Per-section, deliberately — never collapsed into one grade-wide verdict.
 * Sections of the same grade share the syllabus definition but not its
 * completion state, and can genuinely be at different paces; a single
 * "on track" answer would hide exactly the section an admin needs to see. */
export function buildSyllabusStatusAnswer(grade: string, subject: string, sections: SyllabusStatusSection[]): string {
  if (!sections.length) return `No sections found for Grade ${grade}.`
  if (!sections.some(s => s.total > 0)) return `No syllabus topics set up yet for Grade ${grade} ${subject}.`
  const parts = sections.map(s => `${s.section}: ${s.completed} of ${s.total}${s.total ? ` (${Math.round((s.completed / s.total) * 100)}%)` : ''}`)
  return `Grade ${grade} ${subject} — ${parts.join(', ')}.`
}

export interface TextbookBook { grade: string; subject: string; chapterCount: number; publishedCount: number }

export function buildTextbookStatusAnswer(books: TextbookBook[], grade: string | null, subject: string | null): string {
  const scoped = books.filter(b =>
    (!grade || b.grade.trim().toLowerCase() === grade.trim().toLowerCase())
    && (!subject || b.subject.trim().toLowerCase() === subject.trim().toLowerCase()),
  )
  if (!scoped.length) {
    return grade || subject ? `No textbook found for ${[grade && `Grade ${grade}`, subject].filter(Boolean).join(' ')}.` : 'No textbooks ingested yet.'
  }
  const parts = scoped.map(b => `Grade ${b.grade} ${b.subject}: ${b.publishedCount} of ${b.chapterCount} chapters published`)
  return `${parts.join('; ')}.`
}
