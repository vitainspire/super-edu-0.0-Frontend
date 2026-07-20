import type { ScheduleSlot } from './types'

// ─── Inputs ────────────────────────────────────────────────────────────────────

export interface ClassInput {
  classId: string
  className: string
  grade: string
}

export interface LineupItem {
  grade: string
  subject: string
  periodsPerWeek: number
  /** 'core' academic subjects vs 'special' activity periods — defaults to 'core' when omitted. */
  category?: 'core' | 'special'
}

export interface AssignmentInput {
  classId: string
  subject: string
  teacherId: string
}

export interface TeacherCapsInput {
  teacherId: string
  teacherName?: string
  maxPeriodsPerDay?: number
  maxPeriodsPerWeek?: number
}

// ─── Outputs ───────────────────────────────────────────────────────────────────

export interface GeneratedPeriod {
  classId: string
  dayOfWeek: number
  periodNumber: number
  startTime: string
  endTime: string
  teacherId?: string
  label: string
}

export interface ClassStat {
  classId: string
  className: string
  placed: number
  kept: number
  skipped: number
}

export interface TeacherLoadWarning {
  teacherId: string
  teacherName?: string
  requiredPeriods: number
  availableSlots: number
  overBy: number
}

export interface UnplacedTask {
  classId: string
  className: string
  subject: string
  teacherId?: string
  reason: string
}

export interface GenerationResult {
  periods: GeneratedPeriod[]
  classStats: ClassStat[]
  teacherWarnings: TeacherLoadWarning[]
  unplaced: UnplacedTask[]
  keptCount: number
  placedCount: number
}

// ─── Internal task representation ─────────────────────────────────────────────

interface Task {
  classId: string
  className: string
  subject: string
  teacherId?: string
}

interface DaySlot {
  day: number
  periodNumber: number
  startTime: string
  endTime: string
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function slotKey(day: number, periodNumber: number): string {
  return `${day}|${periodNumber}`
}

/**
 * Whole-school timetable generator — STABLE/INCREMENTAL by design.
 *
 * A school's timetable is something teachers and students build daily
 * routines around. Re-solving from scratch every time an admin makes one
 * small change (a new teacher, one grade's lineup tweak) would reshuffle a
 * large number of *unrelated* periods too — technically valid, but
 * disruptive and untrustworthy in practice.
 *
 * So `existingPeriods` (the currently-published timetable, if any) is
 * treated as PINNED by default: any period whose (class, subject, teacher)
 * still matches what's currently required is kept in its exact slot,
 * untouched. Only the delta — periods for a requirement that's new, whose
 * assignment changed, or whose required count increased — goes through the
 * constrained-first + backtracking placement below. Placement can still
 * relocate OTHER newly-placed periods to resolve a conflict, but it will
 * never move a pinned one — that's what keeps re-runs stable.
 *
 * This is a strong heuristic, not a guaranteed-optimal CSP/ILP solver —
 * genuinely infeasible overcommitment (a teacher needs more periods than
 * exist) is reported via `teacherWarnings`, not silently dropped.
 *
 * This produces a repeating WEEKLY template (e.g. "Monday period 3"), same
 * as before — it has no awareness of specific calendar dates/holidays. That
 * is a deliberate scope boundary: calendar data belongs in day-level
 * consumers (attendance, daily briefing), not in this weekly-pattern
 * generator. See lib/academic-calendar.ts for the capacity-planning side.
 */
export function generateSchoolTimetable(
  slots: ScheduleSlot[],
  workingWeekdays: readonly number[],
  classes: ClassInput[],
  lineup: LineupItem[],
  assignments: AssignmentInput[],
  teacherCaps: TeacherCapsInput[],
  existingPeriods: GeneratedPeriod[] = [],
): GenerationResult {
  const periodSlots = slots.filter(s => s.type === 'period' && s.periodNumber != null)
  const allDaySlots: DaySlot[] = workingWeekdays.flatMap(day =>
    periodSlots.map(s => ({ day, periodNumber: s.periodNumber!, startTime: s.startTime, endTime: s.endTime }))
  )
  const validSlotKeys = new Set(allDaySlots.map(s => slotKey(s.day, s.periodNumber)))
  const totalSlotsPerWeek = allDaySlots.length

  const classById = new Map(classes.map(c => [c.classId, c]))
  const capByTeacher = new Map(teacherCaps.map(t => [t.teacherId, t]))
  const assignmentByClassSubject = new Map(assignments.map(a => [`${a.classId}|${a.subject}`, a.teacherId]))

  // 'core' academic subjects vs 'special' activity periods (Sports/Library/Lab/...) —
  // lets placement below prefer spacing core periods apart instead of stacking
  // them back-to-back, with special periods acting as natural breaks between them.
  const categoryByGradeSubject = new Map(lineup.map(l => [`${l.grade}|${l.subject}`, l.category ?? 'core']))
  function categoryOf(classId: string, subject: string): 'core' | 'special' {
    const cls = classById.get(classId)
    if (!cls) return 'core'
    return categoryByGradeSubject.get(`${cls.grade}|${subject}`) ?? 'core'
  }

  // ── 1. How many periods of each (class, subject) are actually required now ──
  const requiredCount = new Map<string, number>() // `${classId}|${subject}` -> count still needed
  for (const cls of classes) {
    for (const item of lineup.filter(l => l.grade === cls.grade)) {
      requiredCount.set(`${cls.classId}|${item.subject}`, Math.max(0, item.periodsPerWeek))
    }
  }

  // ── 2. State maps, shared by both the "keep pinned" pass and the placement pass ──
  const classUsedSlots = new Map<string, Set<string>>()      // classId -> slotKeys
  const teacherUsedSlots = new Map<string, Set<string>>()    // teacherId -> slotKeys
  const teacherDayCount = new Map<string, Map<number, number>>() // teacherId -> day -> count
  const classSubjectDays = new Map<string, Set<number>>()    // `${classId}|${subject}` -> days used
  const placedByClassSlot = new Map<string, GeneratedPeriod>() // `${classId}|${slotKey}` -> period
  const pinnedKeys = new Set<string>()                        // `${classId}|${slotKey}` entries that must never move

  const periods: GeneratedPeriod[] = []
  const classStats = new Map<string, ClassStat>()
  for (const cls of classes) classStats.set(cls.classId, { classId: cls.classId, className: cls.className, placed: 0, kept: 0, skipped: 0 })

  function isFreeForClass(classId: string, key: string): boolean {
    return !classUsedSlots.get(classId)?.has(key)
  }
  function isFreeForTeacher(teacherId: string, day: number, key: string): boolean {
    if (teacherUsedSlots.get(teacherId)?.has(key)) return false
    const cap = capByTeacher.get(teacherId)?.maxPeriodsPerDay
    if (cap == null) return true
    return (teacherDayCount.get(teacherId)?.get(day) ?? 0) < cap
  }

  function markOccupied(classId: string, subject: string, teacherId: string | undefined, day: number, key: string) {
    if (!classUsedSlots.has(classId)) classUsedSlots.set(classId, new Set())
    classUsedSlots.get(classId)!.add(key)
    if (teacherId) {
      if (!teacherUsedSlots.has(teacherId)) teacherUsedSlots.set(teacherId, new Set())
      teacherUsedSlots.get(teacherId)!.add(key)
      if (!teacherDayCount.has(teacherId)) teacherDayCount.set(teacherId, new Map())
      const dc = teacherDayCount.get(teacherId)!
      dc.set(day, (dc.get(day) ?? 0) + 1)
    }
    const subjKey = `${classId}|${subject}`
    if (!classSubjectDays.has(subjKey)) classSubjectDays.set(subjKey, new Set())
    classSubjectDays.get(subjKey)!.add(day)
  }

  function place(task: Task, slot: DaySlot) {
    const key = slotKey(slot.day, slot.periodNumber)
    markOccupied(task.classId, task.subject, task.teacherId, slot.day, key)
    const period: GeneratedPeriod = {
      classId: task.classId, dayOfWeek: slot.day, periodNumber: slot.periodNumber,
      startTime: slot.startTime, endTime: slot.endTime, teacherId: task.teacherId, label: task.subject,
    }
    periods.push(period)
    placedByClassSlot.set(`${task.classId}|${key}`, period)
    classStats.get(task.classId)!.placed++
  }

  function unplace(period: GeneratedPeriod) {
    const key = slotKey(period.dayOfWeek, period.periodNumber)
    classUsedSlots.get(period.classId)?.delete(key)
    if (period.teacherId) {
      teacherUsedSlots.get(period.teacherId)?.delete(key)
      const dc = teacherDayCount.get(period.teacherId)
      if (dc) dc.set(period.dayOfWeek, Math.max(0, (dc.get(period.dayOfWeek) ?? 1) - 1))
    }
    classSubjectDays.get(`${period.classId}|${period.label}`)?.delete(period.dayOfWeek)
    placedByClassSlot.delete(`${period.classId}|${key}`)
    const idx = periods.indexOf(period)
    if (idx >= 0) periods.splice(idx, 1)
    classStats.get(period.classId)!.placed--
  }

  // ── 3. Keep every existing period whose (class, subject, teacher) still
  // matches a current, not-yet-fulfilled requirement — pinned, untouched. ──
  for (const existing of existingPeriods) {
    if (!classById.has(existing.classId)) continue // class no longer exists — drop
    const key = slotKey(existing.dayOfWeek, existing.periodNumber)
    if (!validSlotKeys.has(key)) continue // schedule template changed under it — drop
    if (!isFreeForClass(existing.classId, key)) continue // duplicate/conflicting stale row — drop

    const reqKey = `${existing.classId}|${existing.label}`
    const remaining = requiredCount.get(reqKey) ?? 0
    if (remaining <= 0) continue // subject dropped from lineup, or already fully kept — drop

    const currentTeacherId = assignmentByClassSubject.get(reqKey)
    if (existing.teacherId !== currentTeacherId) continue // assignment changed — drop, will be re-placed

    if (existing.teacherId && !isFreeForTeacher(existing.teacherId, existing.dayOfWeek, key)) continue // teacher double-booked by an earlier kept row — drop this one

    markOccupied(existing.classId, existing.label, existing.teacherId, existing.dayOfWeek, key)
    periods.push(existing)
    placedByClassSlot.set(`${existing.classId}|${key}`, existing)
    pinnedKeys.add(`${existing.classId}|${key}`)
    classStats.get(existing.classId)!.kept++
    requiredCount.set(reqKey, remaining - 1)
  }

  // ── 4. Build tasks for whatever's still needed after keeping pinned periods ──
  const tasks: Task[] = []
  for (const [reqKey, count] of requiredCount) {
    if (count <= 0) continue
    const [classId, subject] = reqKey.split('|')
    const cls = classById.get(classId)
    if (!cls) continue
    const teacherId = assignmentByClassSubject.get(reqKey)
    for (let i = 0; i < count; i++) tasks.push({ classId, className: cls.className, subject, teacherId })
  }

  // ── 5. Per-teacher load (kept periods so far + the still-to-place delta) + upfront feasibility check ──
  const loadByTeacher = new Map<string, number>()
  for (const t of tasks) if (t.teacherId) loadByTeacher.set(t.teacherId, (loadByTeacher.get(t.teacherId) ?? 0) + 1)
  // `periods` only holds kept/pinned rows at this point — nothing has been placed yet.
  for (const p of periods) if (p.teacherId) loadByTeacher.set(p.teacherId, (loadByTeacher.get(p.teacherId) ?? 0) + 1)

  const teacherWarnings: TeacherLoadWarning[] = []
  const ceilingByTeacher = new Map<string, number>()
  for (const [teacherId, required] of loadByTeacher) {
    const cap = capByTeacher.get(teacherId)
    const weeklyCap = cap?.maxPeriodsPerWeek ?? Infinity
    const ceiling = Math.min(weeklyCap, totalSlotsPerWeek)
    ceilingByTeacher.set(teacherId, ceiling)
    if (required > ceiling) {
      teacherWarnings.push({
        teacherId, teacherName: cap?.teacherName,
        requiredPeriods: required, availableSlots: ceiling, overBy: required - ceiling,
      })
    }
  }

  // ── 6. Order the remaining delta: most-constrained teacher first ──
  const pressureByTeacher = new Map<string, number>()
  for (const [teacherId, required] of loadByTeacher) {
    const ceiling = ceilingByTeacher.get(teacherId) ?? totalSlotsPerWeek
    pressureByTeacher.set(teacherId, required / Math.max(1, ceiling))
  }

  const withTeacher = tasks.filter(t => t.teacherId)
  const withoutTeacher = tasks.filter(t => !t.teacherId)
  const teacherOrder = [...loadByTeacher.keys()].sort(
    (a, b) => (pressureByTeacher.get(b) ?? 0) - (pressureByTeacher.get(a) ?? 0)
  )
  const orderedTasks: Task[] = []
  for (const teacherId of teacherOrder) {
    orderedTasks.push(...shuffleArray(withTeacher.filter(t => t.teacherId === teacherId)))
  }
  orderedTasks.push(...shuffleArray(withoutTeacher))

  // ── 7. Placement — identical algorithm to before, but the state maps are
  // already pre-populated with pinned periods, and the swap/backtrack below
  // is only ever allowed to relocate a NON-pinned (this-run) period. ──
  const unplaced: UnplacedTask[] = []

  // Is the period immediately before/after this one, for this class on this day,
  // already a 'core' subject? Only matters for placing another core subject —
  // special periods are always fine to place anywhere, and act as the spacer.
  function hasCoreNeighbor(classId: string, day: number, periodNumber: number): boolean {
    for (const neighborPeriod of [periodNumber - 1, periodNumber + 1]) {
      const neighbor = placedByClassSlot.get(`${classId}|${slotKey(day, neighborPeriod)}`)
      if (neighbor && categoryOf(classId, neighbor.label) === 'core') return true
    }
    return false
  }

  function findSlot(task: Task, preferNewDay: boolean): DaySlot | null {
    const usedDays = classSubjectDays.get(`${task.classId}|${task.subject}`) ?? new Set()
    const isCore = categoryOf(task.classId, task.subject) === 'core'
    let fallback: DaySlot | null = null
    for (const slot of shuffleArray(allDaySlots)) {
      const key = slotKey(slot.day, slot.periodNumber)
      if (!isFreeForClass(task.classId, key)) continue
      if (preferNewDay && usedDays.has(slot.day)) continue
      if (task.teacherId && !isFreeForTeacher(task.teacherId, slot.day, key)) continue
      if (!fallback) fallback = slot
      // Keep scanning for a slot that doesn't stack two core subjects back-to-back —
      // but never let that preference cost us feasibility; `fallback` covers that.
      if (isCore && hasCoreNeighbor(task.classId, slot.day, slot.periodNumber)) continue
      return slot
    }
    return fallback
  }

  for (const task of orderedTasks) {
    let chosen = findSlot(task, true) ?? findSlot(task, false)

    // Bounded backtrack: if every slot that's free for this class is blocked
    // by the SAME teacher's other commitments, try relocating one of that
    // teacher's other (non-pinned) periods elsewhere to free up the slot.
    if (!chosen && task.teacherId) {
      outer: for (const slot of shuffleArray(allDaySlots)) {
        const key = slotKey(slot.day, slot.periodNumber)
        if (!isFreeForClass(task.classId, key)) continue
        if (isFreeForTeacher(task.teacherId, slot.day, key)) continue // would've been chosen already
        for (const [key2, period] of placedByClassSlot) {
          if (pinnedKeys.has(key2)) continue // never relocate a pinned/kept period
          if (period.teacherId !== task.teacherId) continue
          if (slotKey(period.dayOfWeek, period.periodNumber) !== key) continue
          const relocated = shuffleArray(allDaySlots).find(alt => {
            const altKey = slotKey(alt.day, alt.periodNumber)
            if (altKey === key) return false
            if (!isFreeForClass(period.classId, altKey)) return false
            if (!isFreeForTeacher(period.teacherId!, alt.day, altKey)) return false
            return true
          })
          if (relocated) {
            const relocatedClassName = classStats.get(period.classId)?.className ?? period.classId
            const relocatedTask: Task = { classId: period.classId, className: relocatedClassName, subject: period.label, teacherId: period.teacherId }
            unplace(period)
            place(relocatedTask, relocated)
            chosen = slot
            break outer
          }
        }
      }
    }

    if (!chosen) {
      classStats.get(task.classId)!.skipped++
      const cap = task.teacherId ? capByTeacher.get(task.teacherId) : undefined
      unplaced.push({
        classId: task.classId, className: task.className, subject: task.subject, teacherId: task.teacherId,
        reason: !task.teacherId
          ? 'No slot free for this class — the lineup likely needs more periods/week than the schedule has slots.'
          : (cap?.maxPeriodsPerDay != null || cap?.maxPeriodsPerWeek != null)
            ? `No slot free within ${cap.teacherName ?? 'the teacher'}'s workload cap — consider raising it or reassigning this subject.`
            : `${cap?.teacherName ?? 'This teacher'} has no free slot across their other classes — likely overcommitted (see teacherWarnings).`,
      })
      continue
    }

    place(task, chosen)
  }

  const classStatsList = [...classStats.values()]
  return {
    periods,
    classStats: classStatsList,
    teacherWarnings,
    unplaced,
    keptCount: classStatsList.reduce((s, c) => s + c.kept, 0),
    placedCount: classStatsList.reduce((s, c) => s + c.placed, 0),
  }
}
