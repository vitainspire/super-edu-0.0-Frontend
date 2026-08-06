import type { Attendance, Class, Student, StudentDoubt, TimetableEntry, TopicMastery, Warning } from '../types'
import { classSnapshot } from './class-snapshot'
import { entriesOn } from './weekPlan'
import type { HomeAlert } from './home-alerts'
import type { PacingResult } from './pacing'

export type AskIntent =
  | 'student_progress' | 'class_analytics' | 'attendance' | 'schedule' | 'alerts'
  | 'prep_material' | 'generate_worksheet'
  | 'doubts' | 'announcements' | 'syllabus_status' | 'leave_status' | 'apply_leave' | 'unknown'

export interface ParsedAsk {
  intent: AskIntent
  studentRef: string | null
  classRef: string | null
  subjectRef: string | null
  topicRef: string | null
  dateRef: string | null
  endDateRef: string | null
  leaveReason: string | null
}

/** Loose, forgiving match — a teacher typing a question isn't going to spell a
 * name exactly as stored. Prefers an exact (case/space-insensitive) match,
 * falls back to "one name contains the other" so "Ravi" finds "Ravi Kumar"
 * and vice versa. */
function looseMatch(ref: string, candidate: string): boolean {
  const a = ref.trim().toLowerCase()
  const b = candidate.trim().toLowerCase()
  if (!a || !b) return false
  return a === b || b.includes(a) || a.includes(b)
}

/** Three real outcomes, not two — "no match" and "more than one equally
 * likely match" are different situations and need different messages.
 * Collapsing 'ambiguous' into 'none' (the old behaviour) told a teacher
 * "I couldn't find X" when X actually matched two students — wrong and
 * unhelpful, since the honest answer is "which one did you mean?". */
export type MatchResult<T> =
  | { kind: 'found'; item: T }
  | { kind: 'ambiguous'; candidates: T[] }
  | { kind: 'none' }

/** Resolves a student reference to one real, active student the teacher
 * actually teaches — scoped to their own classes so this can never surface a
 * student from a class this teacher has no access to. */
export function matchStudent(ref: string, students: Student[], myClassIds: Set<string>): MatchResult<Student> {
  const pool = students.filter(s => s.isActive && myClassIds.has(s.classId))
  const exact = pool.filter(s => s.name.trim().toLowerCase() === ref.trim().toLowerCase())
  if (exact.length === 1) return { kind: 'found', item: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact }
  const loose = pool.filter(s => looseMatch(ref, s.name))
  if (loose.length === 1) return { kind: 'found', item: loose[0] }
  if (loose.length > 1) return { kind: 'ambiguous', candidates: loose }
  return { kind: 'none' }
}

/** Resolves a class reference like "Grade 5B", "5 B", or "5B" against this
 * teacher's own classes. */
export function matchClass(ref: string, classes: Class[]): MatchResult<Class> {
  const norm = (s: string) => s.replace(/grade/i, '').replace(/[\s-]/g, '').toLowerCase()
  const target = norm(ref)
  const exact = classes.filter(c => norm(`${c.grade}${c.section}`) === target || norm(c.name) === target)
  if (exact.length === 1) return { kind: 'found', item: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact }
  const loose = classes.filter(c => looseMatch(ref, c.name) || looseMatch(ref, `${c.grade}${c.section}`))
  if (loose.length === 1) return { kind: 'found', item: loose[0] }
  if (loose.length > 1) return { kind: 'ambiguous', candidates: loose }
  return { kind: 'none' }
}

/** Resolves a topic reference against a class's real syllabus, so a
 * generation request lands on a real topic (with its definitionId, enabling
 * grounding/shared-stock) instead of whatever loose text the teacher typed —
 * falling back to the raw text untouched when nothing matches closely, since
 * a topic outside the syllabus is still a valid thing to generate for. */
export function matchTopic<T extends { topic: string }>(ref: string, topics: T[]): T | null {
  const exact = topics.filter(t => t.topic.trim().toLowerCase() === ref.trim().toLowerCase())
  if (exact.length === 1) return exact[0]
  const loose = topics.filter(t => looseMatch(ref, t.topic))
  return loose.length === 1 ? loose[0] : null
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}

/** Finds a month by name, tolerating small typos ("augest" -> august) —
 * but ONLY for month names of 6+ letters. Short months (may, july, june)
 * are matched by exact substring only: a 1-edit tolerance on a 3-4 letter
 * word risks matching common unrelated words ("day" is 1 edit from "may"). */
function findMonthIndex(text: string): number {
  const words = text.split(/\s+/)
  for (let i = 0; i < MONTHS.length; i++) {
    const month = MONTHS[i]
    if (text.includes(month)) return i
    if (month.length < 6) continue
    if (words.some(w => Math.abs(w.length - month.length) <= 1 && levenshtein(w, month) <= 1)) return i
  }
  return -1
}

export interface ResolvedDate {
  date: Date
  isToday: boolean
  /** true when dateRef was non-empty but nothing below could make sense of
   * it — the caller should say so rather than silently answering about
   * today as if that's what was asked. */
  unparsed: boolean
}

/** Turns whatever day/date phrase the classifier pulled out ("tomorrow",
 * "next monday", "12th august") into an actual Date. Deliberately handled
 * here in plain code rather than trusted to the LLM — date arithmetic is
 * exact-answer territory, not something to let a model compute. Covers the
 * common phrasings; anything else falls back to today with unparsed=true so
 * the answer can be honest about that instead of quietly answering the
 * wrong day. */
export function resolveDateRef(ref: string | null, now: Date): ResolvedDate {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!ref || !ref.trim()) return { date: today, isToday: true, unparsed: false }
  const r = ref.trim().toLowerCase()

  if (r === 'today') return { date: today, isToday: true, unparsed: false }
  if (r === 'tomorrow') {
    const d = new Date(today); d.setDate(d.getDate() + 1)
    return { date: d, isToday: false, unparsed: false }
  }
  if (r === 'yesterday') {
    const d = new Date(today); d.setDate(d.getDate() - 1)
    return { date: d, isToday: false, unparsed: false }
  }

  const weekday = WEEKDAYS.findIndex(w => r.includes(w))
  if (weekday !== -1) {
    const d = new Date(today)
    let diff = (weekday - d.getDay() + 7) % 7
    if (diff === 0 && r.includes('next')) diff = 7
    d.setDate(d.getDate() + diff)
    return { date: d, isToday: diff === 0, unparsed: false }
  }

  // "12th august", "august 12", "12 august 2026" — tolerant of a small typo
  // in the month name (e.g. "augest"), never in the day/year digits.
  const cleaned = r.replace(/(\d+)(st|nd|rd|th)\b/g, '$1')
  const monthIdx = findMonthIndex(cleaned)
  const dayMatch = cleaned.match(/\b(\d{1,2})\b/)
  if (monthIdx !== -1 && dayMatch) {
    const day = parseInt(dayMatch[1], 10)
    const yearMatch = cleaned.match(/\b(20\d{2})\b/)
    const year = yearMatch ? parseInt(yearMatch[1], 10) : today.getFullYear()
    const d = new Date(year, monthIdx, day)
    if (!isNaN(d.getTime()) && d.getDate() === day) {
      return { date: d, isToday: d.getTime() === today.getTime(), unparsed: false }
    }
  }

  return { date: today, isToday: true, unparsed: true }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

export function buildStudentProgressAnswer(
  student: Student,
  subjectRef: string | null,
  data: { attendance: Attendance[]; mastery: TopicMastery[]; getStudentWarnings: (studentId: string) => Warning[] },
): string {
  const records = data.attendance.filter(a => a.studentId === student.id)
  const present = records.filter(a => a.status === 'present' || a.status === 'late').length
  const attendanceLine = records.length
    ? `attendance is ${pct(present / records.length)}`
    : 'no attendance recorded yet'

  const subjectScores = subjectRef
    ? data.mastery.filter(m => m.studentId === student.id && looseMatch(subjectRef, m.subject))
    : data.mastery.filter(m => m.studentId === student.id)
  const masteryLine = subjectScores.length
    ? `mastery is around ${pct(subjectScores.reduce((sum, m) => sum + m.mastery, 0) / subjectScores.length)}${subjectRef ? ` in ${subjectRef}` : ''}`
    : `no ${subjectRef ? subjectRef + ' ' : ''}assessment data yet`

  const warnings = data.getStudentWarnings(student.id)
  const warningLine = warnings.length
    ? ` ${warnings[0].reason}.`
    : ' Nothing flagged right now.'

  return `${student.name} — ${attendanceLine}, ${masteryLine}.${warningLine}`
}

export function buildClassAnalyticsAnswer(
  cls: Class,
  data: { students: Student[]; attendance: Attendance[]; mastery: TopicMastery[]; getStudentWarnings: (studentId: string) => Warning[] },
): string {
  const snap = classSnapshot(cls.id, data)
  const parts = [
    `${snap.students} students`,
    snap.attendancePct != null ? `${snap.attendancePct}% attendance` : 'no attendance recorded yet',
    snap.masteryPct != null ? `${snap.masteryPct}% average mastery` : 'no assessments yet',
  ]
  const attentionLine = snap.needAttention > 0
    ? ` ${snap.needAttention} student${snap.needAttention > 1 ? 's' : ''} need${snap.needAttention > 1 ? '' : 's'} attention.`
    : ' Nobody flagged right now.'
  return `${cls.grade} ${cls.section} — ${parts.join(', ')}.${attentionLine}`
}

export function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Prefixed onto the answer when dateRef was given but couldn't be resolved
 * — says so honestly instead of silently answering about today as if that's
 * what was asked. */
function dateDisclaimer(resolved: ResolvedDate, dateRef: string | null): string {
  return resolved.unparsed && dateRef ? `I couldn't tell which day "${dateRef}" means, so here's today instead — ` : ''
}

export function buildAttendanceAnswer(
  student: Student | null,
  cls: Class | null,
  attendance: Attendance[],
  students: Student[],
  resolved: ResolvedDate,
  dateRef: string | null,
): string {
  const disclaimer = dateDisclaimer(resolved, dateRef)
  const iso = toIsoDate(resolved.date)
  const dayWord = resolved.isToday ? 'today' : `on ${formatDateLabel(resolved.date)}`

  if (student) {
    const record = attendance.find(a => a.studentId === student.id && a.date === iso)
    if (!record) return `${disclaimer}No attendance recorded for ${student.name} ${dayWord} yet.`
    return `${disclaimer}${student.name} was marked ${record.status} ${dayWord}.`
  }
  if (cls) {
    const roster = students.filter(s => s.classId === cls.id && s.isActive)
    const dayRecords = attendance.filter(a => a.classId === cls.id && a.date === iso)
    const absent = dayRecords.filter(a => a.status === 'absent').map(a => roster.find(s => s.id === a.studentId)?.name).filter(Boolean)
    if (!dayRecords.length) return `${disclaimer}No attendance marked ${dayWord} for ${cls.grade} ${cls.section}.`
    return absent.length
      ? `${disclaimer}${absent.length} absent ${dayWord} in ${cls.grade} ${cls.section}: ${absent.join(', ')}.`
      : `${disclaimer}Everyone present ${dayWord} in ${cls.grade} ${cls.section}.`
  }
  return "Which student or class did you mean?"
}

export function buildScheduleAnswer(
  timetableEntries: TimetableEntry[],
  now: Date,
  classNameFor: (classId: string) => string,
  resolved: ResolvedDate,
  dateRef: string | null,
): string {
  const disclaimer = dateDisclaimer(resolved, dateRef)
  const dayEntries = entriesOn(timetableEntries, resolved.date).sort((a, b) => a.periodNumber - b.periodNumber)

  // Only "today" gets the live "what's next right now" framing — it's the
  // only day "next" means anything against the clock. Any other day (past,
  // future, or an unparsed fallback) gets its full period list instead.
  if (resolved.isToday) {
    if (!dayEntries.length) return `${disclaimer}Nothing on your timetable today.`
    const nowMins = now.getHours() * 60 + now.getMinutes()
    const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const next = dayEntries.find(e => toMins(e.endTime) > nowMins)
    if (!next) return `${disclaimer}That's everything for today — no periods left.`
    const label = next.label ?? classNameFor(next.classId)
    return `${disclaimer}Next up: ${label} · ${next.startTime}–${next.endTime} · ${classNameFor(next.classId)}.`
  }

  const dateLabel = formatDateLabel(resolved.date)
  if (!dayEntries.length) return `${disclaimer}Nothing scheduled on ${dateLabel}.`
  const list = dayEntries
    .map(e => `${e.label ?? classNameFor(e.classId)} ${e.startTime}–${e.endTime} (${classNameFor(e.classId)})`)
    .join('; ')
  return `${disclaimer}On ${dateLabel}: ${list}.`
}

export function buildAlertsAnswer(alerts: HomeAlert[]): string {
  if (!alerts.length) return "Nothing flagged right now — all clear."
  const top = alerts.slice(0, 3).map(a => a.title)
  return `${alerts.length} thing${alerts.length > 1 ? 's' : ''} to know: ${top.join('; ')}.`
}

export function buildDoubtsAnswer(doubts: StudentDoubt[], cls: Class | null): string {
  const pending = doubts.filter(d => d.status === 'pending')
  const scope = cls ? ` in ${cls.grade} ${cls.section}` : ''
  if (!pending.length) return `No unanswered questions${scope} right now.`
  const names = pending.slice(0, 3).map(d => d.studentName)
  const rest = pending.length > 3 ? `, and ${pending.length - 3} more` : ''
  return `${pending.length} unanswered question${pending.length > 1 ? 's' : ''}${scope}: ${names.join(', ')}${rest}.`
}

export function buildAnnouncementsAnswer(announcements: { title: string; category: string }[]): string {
  if (!announcements.length) return 'No announcements right now.'
  const top = announcements.slice(0, 3).map(a => a.title)
  const rest = announcements.length > 3 ? `, and ${announcements.length - 3} more` : ''
  return `${announcements.length} announcement${announcements.length > 1 ? 's' : ''}: ${top.join('; ')}${rest}.`
}

export function buildSyllabusStatusAnswer(cls: Class, pacing: PacingResult | null): string {
  if (!pacing) return `Not enough data yet to tell how ${cls.grade} ${cls.section} is pacing — either the academic year hasn't started or no topics are set up.`
  const statusWord = pacing.status === 'on-track' ? 'on track'
    : pacing.status === 'ahead' ? `ahead of schedule by about ${pacing.weeksAhead} week${Math.abs(pacing.weeksAhead) > 1 ? 's' : ''}`
    : pacing.status === 'behind' ? `behind schedule by about ${Math.abs(pacing.weeksAhead)} week${Math.abs(pacing.weeksAhead) > 1 ? 's' : ''}`
    : 'not started yet'
  return `${cls.grade} ${cls.section} is ${statusWord} — ${pacing.completedCount} of ${pacing.totalCount} topics done (${pct(pacing.completionPct)}).`
}

interface CoveringEntryLike { periodNumber: number; className: string }
export function buildLeaveStatusAnswer(
  leaves: { status: string }[],
  covering: CoveringEntryLike[],
  coveredBy: CoveringEntryLike[],
): string {
  const pending = leaves.filter(l => l.status === 'pending').length
  const parts: string[] = []
  if (pending) parts.push(`${pending} pending leave request${pending > 1 ? 's' : ''}`)
  if (covering.length) parts.push(`covering ${covering.length} period${covering.length > 1 ? 's' : ''} today`)
  if (coveredBy.length) parts.push(`${coveredBy.length} of your period${coveredBy.length > 1 ? 's are' : ' is'} being covered today`)
  if (!parts.length) return 'Nothing pending — no leave requests waiting, and no substitute coverage today.'
  return `${parts.join('; ')}.`
}
