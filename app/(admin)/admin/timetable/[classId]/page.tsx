'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'
import { Loader as Loader2, Send, X, Check, CreditCard as Edit2, Trash2, Plus, Coffee, UtensilsCrossed, CircleAlert as AlertCircle, Copy, CalendarCheck, UserPlus } from 'lucide-react'
import Link from 'next/link'
import PageHeader from '@/components/theme/PageHeader'
import type { Class, SchoolTimetablePeriod, ScheduleSlot, SchoolSchedule } from '@/lib/types'
import { ADMIN_SUBJECT_COLORS as SUBJECT_COLORS } from '@/lib/admin-theme'

const DAYS      = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface ClassAssignment { teacherId: string; classId: string; subject?: string }
interface TeacherInfo     { id: string; name: string }
interface GradeSubjectLite { subject: string; category: 'core' | 'special' }

const OTHER_SUBJECT = '__other__'

export default function ClassTimetablePage() {
  const params  = useParams()
  const classId = params.classId as string
  const { school } = useAdmin()

  const [schedule,    setSchedule]    = useState<SchoolSchedule | null>(null)
  const [periods,     setPeriods]     = useState<SchoolTimetablePeriod[]>([])
  const [classInfo,   setClassInfo]   = useState<Class | null>(null)
  const [assignments, setAssignments] = useState<ClassAssignment[]>([])
  const [teachers,    setTeachers]    = useState<TeacherInfo[]>([])
  const [gradeSubjects, setGradeSubjects] = useState<GradeSubjectLite[]>([])
  const [loading,     setLoading]     = useState(true)

  // Modal state
  const [modal,                setModal]                = useState<{ slot: ScheduleSlot; day: number } | null>(null)
  const [selectedAssignmentIdx, setSelectedAssignmentIdx] = useState(-1)
  const [applyToAllDays,       setApplyToAllDays]       = useState(false)
  const [saving,               setSaving]               = useState(false)
  const [conflictErrors,       setConflictErrors]       = useState<string[]>([])

  // Inline "add subject & teacher" form, shown inside the same modal.
  // Subject choice is a closed dropdown sourced from this grade's official
  // subject lineup (Classes → grade → Subjects) — plus an "Other" custom
  // option — so a manual entry here can't silently drift from the exact
  // subject name the whole-school generator expects.
  const [newTeacherId,     setNewTeacherId]     = useState('')
  const [subjectChoice,    setSubjectChoice]    = useState('')
  const [customSubject,    setCustomSubject]    = useState('')
  const [addingAssignment, setAddingAssignment] = useState(false)
  const [addError,         setAddError]         = useState<string | null>(null)
  const isOtherSubject = subjectChoice === OTHER_SUBJECT
  const newSubject = isOtherSubject ? customSubject.trim() : subjectChoice

  // Action states
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [copyingDay,  setCopyingDay]  = useState<number | null>(null)
  const [publishing,  setPublishing]  = useState(false)
  const [publishMsg,  setPublishMsg]  = useState('')

  const load = useCallback(() => {
    if (!school) { setLoading(false); return }
    Promise.all([
      backendFetch(`/api/admin/schools/${school.id}/schedule`).then(r => r.json()),
      backendFetch(`/api/admin/schools/${school.id}/timetable`).then(r => r.json()),
      backendFetch(`/api/admin/schools/${school.id}/classes`).then(r => r.json()),
      backendFetch(`/api/admin/schools/${school.id}/classes/${classId}/assign-teacher`).then(r => r.json()),
      backendFetch(`/api/admin/schools/${school.id}/teachers`).then(r => r.json()),
    ]).then(([sd, tt, cd, at, td]) => {
      setSchedule(sd.schedule ?? null)
      setPeriods((tt.periods ?? []).filter((p: SchoolTimetablePeriod) => p.classId === classId))
      setClassInfo((cd.classes ?? []).find((c: Class) => c.id === classId) ?? null)
      setAssignments(at.assignments ?? [])
      setTeachers(td.teachers ?? [])
    }).finally(() => setLoading(false))
  }, [school, classId])

  useEffect(() => { load() }, [load])

  // The grade's official subject lineup (Classes → grade → Subjects) drives
  // the dropdown below — once classInfo resolves, we know which grade to ask for.
  useEffect(() => {
    if (!school || !classInfo?.grade) return
    backendFetch(`/api/admin/schools/${school.id}/grade-subjects?grade=${encodeURIComponent(classInfo.grade)}`)
      .then(r => r.json())
      .then(d => setGradeSubjects((d.subjects ?? []).map((s: GradeSubjectLite) => ({ subject: s.subject, category: s.category }))))
      .catch(() => setGradeSubjects([]))
  }, [school, classInfo?.grade])

  const teacherName = (tid: string) => teachers.find(t => t.id === tid)?.name ?? '—'

  // Subjects this class hasn't already been assigned a teacher for.
  const availableGradeSubjects = gradeSubjects.filter(gs => !assignments.some(a => a.subject === gs.subject))

  function periodAt(slot: ScheduleSlot, day: number) {
    return periods.find(p => p.dayOfWeek === day && p.periodNumber === slot.periodNumber)
  }

  function openModal(slot: ScheduleSlot, day: number, forAllDays = false) {
    const existing = periodAt(slot, day)
    if (existing) {
      const idx = assignments.findIndex(a => a.teacherId === existing.teacherId && a.subject === existing.label)
      setSelectedAssignmentIdx(idx >= 0 ? idx : -1)
    } else {
      setSelectedAssignmentIdx(-1)
    }
    setApplyToAllDays(forAllDays)
    setNewTeacherId('')
    setSubjectChoice('')
    setCustomSubject('')
    setAddError(null)
    setModal({ slot, day })
  }

  async function addAssignment() {
    if (!school || !newTeacherId || !newSubject) return
    setAddingAssignment(true)
    setAddError(null)
    try {
      const subject = newSubject
      const res = await backendFetch(`/api/admin/schools/${school.id}/classes/${classId}/assign-teacher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: newTeacherId, subject }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setAddError(body.error ?? 'Could not add subject')
        return
      }
      const freshRes = await backendFetch(`/api/admin/schools/${school.id}/classes/${classId}/assign-teacher`)
      const freshData = await freshRes.json()
      const updated: ClassAssignment[] = freshData.assignments ?? []
      setAssignments(updated)
      const idx = updated.findIndex(a => a.teacherId === newTeacherId && a.subject === subject)
      setSelectedAssignmentIdx(idx >= 0 ? idx : updated.length - 1)
      setNewTeacherId('')
      setSubjectChoice('')
      setCustomSubject('')

      // Any period already carrying this subject but with no teacher yet
      // picks up the newly-assigned teacher immediately — no need to open
      // every matching cell by hand. Cells already assigned to a different
      // teacher are left alone; reassigning those is a deliberate action via
      // a cell's Save button, not a side effect of adding a roster entry.
      const syncErrors = await syncTeacherAcrossSubject(subject, newTeacherId, [], true)
      if (syncErrors.length > 0) setConflictErrors(syncErrors)
      load()
    } finally {
      setAddingAssignment(false)
    }
  }

  // Subjects don't sit at the same period number on every day (e.g. "maths"
  // can be Period 3 on Monday and Period 5 on Tuesday), so keeping one
  // teacher on one subject has to match by label across the whole week,
  // not by (day, periodNumber). This pushes a teacher onto every other
  // already-existing period for this class that carries the same subject.
  // `onlyUnassigned` restricts this to cells with no teacher yet — used when
  // a subject+teacher pairing is merely added to the roster, so adding a
  // second/alternate teacher for an already-assigned subject doesn't silently
  // overwrite it without the admin explicitly hitting Save on a cell.
  async function syncTeacherAcrossSubject(
    subject: string, teacherId: string, skip: { day: number; periodNumber: number }[], onlyUnassigned = false,
  ): Promise<string[]> {
    if (!school) return []
    const skipSet = new Set(skip.map(s => `${s.day}-${s.periodNumber}`))
    const targets = periods.filter(p =>
      p.label === subject && p.teacherId !== teacherId && !skipSet.has(`${p.dayOfWeek}-${p.periodNumber}`)
      && (!onlyUnassigned || !p.teacherId),
    )
    if (targets.length === 0) return []

    const results = await Promise.all(targets.map(async p => {
      const res = await backendFetch(`/api/admin/schools/${school.id}/timetable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: p.id,
          dayOfWeek: p.dayOfWeek,
          periodNumber: p.periodNumber,
          startTime: p.startTime,
          endTime: p.endTime,
          classId,
          teacherId,
          label: p.label,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return body.detail as string ?? `Could not update ${DAYS[p.dayOfWeek - 1]} · Period ${p.periodNumber}`
      }
      return null
    }))
    return results.filter((e): e is string => e !== null)
  }

  async function savePeriod() {
    if (!school || !modal || selectedAssignmentIdx < 0) return
    setSaving(true)
    setConflictErrors([])
    const { slot } = modal
    const a = assignments[selectedAssignmentIdx]
    const daysToSave = applyToAllDays ? [1, 2, 3, 4, 5, 6] : [modal.day]

    const results: (string | null)[] = await Promise.all(daysToSave.map(async day => {
      const existing = periodAt(slot, day)
      const res = await backendFetch(`/api/admin/schools/${school.id}/timetable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: existing?.id,
          dayOfWeek: day,
          periodNumber: slot.periodNumber,
          startTime: slot.startTime,
          endTime: slot.endTime,
          classId,
          teacherId: a.teacherId,
          label: a.subject ?? null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return body.detail as string ?? `Could not save ${DAYS[day - 1]}`
      }
      return null
    }))

    if (a.subject) {
      // openModal only ever opens for period-type slots, so periodNumber is always set here.
      const justSaved = daysToSave.map(day => ({ day, periodNumber: slot.periodNumber as number }))
      results.push(...await syncTeacherAcrossSubject(a.subject, a.teacherId, justSaved))
    }

    setSaving(false)
    const errors = results.filter((e): e is string => e !== null)
    if (errors.length > 0) {
      setConflictErrors(errors)
      load()
    } else {
      setModal(null)
      load()
    }
  }

  async function clearPeriod(slot: ScheduleSlot, day: number) {
    if (!school) return
    const existing = periodAt(slot, day)
    if (!existing) return
    setDeletingId(existing.id)
    await backendFetch(`/api/admin/schools/${school.id}/timetable`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodId: existing.id }),
    })
    setDeletingId(null)
    load()
  }

  async function copyDayToAll(sourceDay: number) {
    if (!school || !schedule) return
    const sourcePeriods = periods.filter(p => p.dayOfWeek === sourceDay)
    if (sourcePeriods.length === 0) return
    setCopyingDay(sourceDay)

    const otherDays = [1, 2, 3, 4, 5, 6].filter(d => d !== sourceDay)
    await Promise.all(otherDays.flatMap(day =>
      sourcePeriods.map(sp => {
        const existing = periods.find(p => p.dayOfWeek === day && p.periodNumber === sp.periodNumber)
        return backendFetch(`/api/admin/schools/${school.id}/timetable`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existing?.id,
            dayOfWeek: day,
            periodNumber: sp.periodNumber,
            startTime: sp.startTime,
            endTime: sp.endTime,
            classId,
            teacherId: sp.teacherId,
            label: sp.label,
          }),
        })
      })
    ))

    setCopyingDay(null)
    load()
  }

  async function publish() {
    if (!school) return
    setPublishing(true)
    // Scoped to this one class — the whole-school publish endpoint (no
    // classIds) does a single all-or-nothing insert across every class in
    // the school, so one stale/orphaned row anywhere else silently blocks
    // this class's publish too. Scoping here avoids that entirely.
    const res = await backendFetch(`/api/admin/schools/${school.id}/timetable/publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classIds: [classId] }),
    })
    if (res.ok) { setPublishMsg('Published!'); setTimeout(() => setPublishMsg(''), 3000) }
    setPublishing(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-6 h-6 animate-spin text-ink" />
    </div>
  )

  if (!schedule) return (
    <div className="p-6 max-w-xl mx-auto text-center py-20">
      <p className="text-ink-soft mb-3">No school schedule template set up yet.</p>
      <Link href="/admin/timetable" className="text-ink font-bold underline text-sm">Set up schedule →</Link>
    </div>
  )

  const slots         = schedule.slots
  const assignedCount = periods.length
  const totalSlots    = slots.filter(s => s.type === 'period').length * 6

  return (
    <div className="pb-10">

      <PageHeader
        title={`${classInfo?.name ?? 'Class'} — Timetable`}
        subtitle={`Grade ${classInfo?.grade} · Section ${classInfo?.section} · ${assignedCount} of ${totalSlots} slots filled`}
        action={
          <div className="flex items-center gap-2">
            {publishMsg && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full whitespace-nowrap">
                {publishMsg}
              </span>
            )}
            <button
              onClick={publish}
              disabled={publishing || periods.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-60 whitespace-nowrap"
              style={{ background: '#059669' }}
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Publish
            </button>
          </div>
        }
      />

      <div className="px-5 space-y-4 relative z-10">

        {/* ── Subjects legend ── */}
        {assignments.length > 0 && (
          <div className="paper-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-ink-soft uppercase tracking-widest">Subjects in this class</p>
              <p className="text-xs text-ink-faint">Click a period number to fill all days at once</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {assignments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                  style={{ background: SUBJECT_COLORS[i % SUBJECT_COLORS.length].bg, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length].text }}
                >
                  <span className="font-bold">{a.subject ?? 'Subject'}</span>
                  <span className="opacity-50">·</span>
                  <span className="opacity-80">{teacherName(a.teacherId)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Timetable grid ── */}
        <div className="paper-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 720 }}>
              <thead>
                {/* Row 1: Day names */}
                <tr>
                  <th
                    className="w-28 px-4 py-3 text-left border-b border-r border-[rgba(58,44,30,0.12)]"
                    style={{ background: 'rgba(58,44,30,0.04)' }}
                  >
                    <p className="text-xs font-bold text-ink-soft uppercase tracking-widest">Period</p>
                  </th>
                  {DAYS.map((day, i) => (
                    <th
                      key={day}
                      className="px-3 py-3 text-center border-b border-r border-[rgba(58,44,30,0.12)] last:border-r-0"
                      style={{ background: 'rgba(58,44,30,0.04)' }}
                    >
                      <p className="text-xs font-bold text-ink">{DAY_SHORT[i]}</p>
                      <p className="text-[10px] text-ink-faint font-medium">{day}</p>
                    </th>
                  ))}
                </tr>

                {/* Row 2: Copy-day-to-all action row */}
                <tr style={{ background: 'rgba(170,205,234,0.14)' }}>
                  <td className="px-4 py-2 border-b border-r border-[rgba(91,135,173,0.2)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#5B87AD' }}>Copy day →</p>
                    <p className="text-[9px] text-ink-faint leading-tight mt-0.5">
                      Fills all other days<br />with that day&apos;s schedule
                    </p>
                  </td>
                  {DAYS.map((day, i) => {
                    const dayNum   = i + 1
                    const dayFilled = periods.filter(p => p.dayOfWeek === dayNum).length
                    const isCopying = copyingDay === dayNum
                    return (
                      <td key={day} className="px-2 py-2 text-center border-b border-r border-[rgba(91,135,173,0.2)] last:border-r-0">
                        {dayFilled > 0 ? (
                          <button
                            onClick={() => copyDayToAll(dayNum)}
                            disabled={!!copyingDay}
                            title={`Copy all of ${day}'s schedule to the other 5 days`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-40 hover:opacity-80"
                            style={{ background: 'rgba(170,205,234,0.45)', color: '#1E3A55' }}
                          >
                            {isCopying
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Copy className="w-3 h-3" />}
                            Copy {DAY_SHORT[i]}
                          </button>
                        ) : (
                          <span className="text-[10px] text-ink-faint opacity-60">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </thead>

              <tbody>
                {slots.map((slot, idx) => {

                  // Break row
                  if (slot.type === 'break') {
                    return (
                      <tr key={idx} style={{ background: 'rgba(234,201,104,0.16)' }}>
                        <td className="px-4 py-2.5 border-b border-r border-[rgba(173,138,44,0.25)]">
                          <div className="flex items-center gap-2">
                            {slot.label.toLowerCase().includes('lunch')
                              ? <UtensilsCrossed className="w-3.5 h-3.5" style={{ color: '#AD8A2C' }} />
                              : <Coffee className="w-3.5 h-3.5" style={{ color: '#AD8A2C' }} />}
                            <div>
                              <p className="text-xs font-bold" style={{ color: '#4A3809' }}>{slot.label}</p>
                              <p className="text-[10px]" style={{ color: '#AD8A2C' }}>{slot.startTime}–{slot.endTime}</p>
                            </div>
                          </div>
                        </td>
                        <td colSpan={6} className="border-b border-[rgba(173,138,44,0.25)] text-center">
                          <p className="text-xs italic py-2.5" style={{ color: '#AD8A2C', opacity: 0.75 }}>{slot.startTime} – {slot.endTime}</p>
                        </td>
                      </tr>
                    )
                  }

                  // Period row
                  return (
                    <tr key={idx} className="hover:bg-black/[0.02] transition-colors">

                      {/* Period label — click to fill ALL days */}
                      <td
                        className="px-4 py-3 border-b border-r border-[rgba(58,44,30,0.12)] align-middle group/period cursor-pointer"
                        style={{ background: 'rgba(58,44,30,0.04)' }}
                        onClick={() => openModal(slot, 1, true)}
                        title="Click to assign this period across all days at once"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-colors group-hover/period:bg-[rgba(58,44,30,0.16)]"
                            style={{ background: 'rgba(58,44,30,0.08)', color: 'var(--ink)' }}
                          >
                            {slot.periodNumber}
                          </span>
                          <div>
                            <p className="text-[10px] font-bold text-ink-soft">{slot.startTime}</p>
                            <p className="text-[10px] text-ink-faint">{slot.endTime}</p>
                          </div>
                        </div>
                        <p className="text-[9px] text-ink-soft mt-1 opacity-0 group-hover/period:opacity-100 transition-opacity flex items-center gap-0.5">
                          <CalendarCheck className="w-2.5 h-2.5" /> Fill all days
                        </p>
                      </td>

                      {/* Day cells */}
                      {DAYS.map((_, di) => {
                        const day       = di + 1
                        const period    = periodAt(slot, day)
                        const isDeleting = period && deletingId === period.id
                        const aIdx      = period
                          ? assignments.findIndex(a => a.teacherId === period.teacherId && a.subject === period.label)
                          : -1
                        const aColor    = aIdx >= 0 ? SUBJECT_COLORS[aIdx % SUBJECT_COLORS.length] : null

                        return (
                          <td
                            key={day}
                            className="px-2 py-2 border-b border-r border-[rgba(58,44,30,0.12)] last:border-r-0 align-middle"
                            style={{ minWidth: 115 }}
                          >
                            {period ? (
                              <div
                                className="rounded-xl p-2 relative group/cell"
                                style={{
                                  background: aColor?.bg ?? 'rgba(16,185,129,0.12)',
                                  border: `1.5px solid ${aColor?.border ?? 'rgba(16,185,129,0.35)'}`,
                                }}
                              >
                                <p className="text-xs font-bold leading-tight truncate" style={{ color: aColor?.text ?? '#065f46' }}>
                                  {period.label ?? '—'}
                                </p>
                                <p className="text-[10px] mt-0.5 leading-tight truncate opacity-70" style={{ color: aColor?.text ?? '#065f46' }}>
                                  {teacherName(period.teacherId ?? '')}
                                </p>
                                {/* Hover overlay */}
                                <div className="absolute inset-0 rounded-xl bg-white/95 flex items-center justify-center gap-1.5 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => openModal(slot, day)}
                                    className="p-1.5 rounded-lg text-ink hover:bg-[rgba(58,44,30,0.08)]"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => clearPeriod(slot, day)}
                                    disabled={!!isDeleting}
                                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                                    title="Clear"
                                  >
                                    {isDeleting
                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      : <Trash2 className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => openModal(slot, day)}
                                className="w-full h-12 rounded-xl border-2 border-dashed border-[rgba(58,44,30,0.18)] text-ink-faint
                                  hover:border-[rgba(58,44,30,0.35)] hover:text-ink-soft hover:bg-[rgba(58,44,30,0.05)] transition-all
                                  flex items-center justify-center"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Assignment modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6" style={{ border: '1.5px solid rgba(58,44,30,0.16)' }}>

            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-base font-display font-bold text-ink">{modal.slot.label}</h2>
                <p className="text-xs text-ink-faint mt-0.5">
                  {modal.slot.startTime} – {modal.slot.endTime} · {classInfo?.name}
                </p>
              </div>
              <button onClick={() => { setModal(null); setConflictErrors([]) }} className="text-ink-faint hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Apply to all days toggle */}
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-4 mt-3"
              style={{ background: 'rgba(58,44,30,0.05)', border: '1.5px solid rgba(58,44,30,0.12)' }}
            >
              <button
                onClick={() => setApplyToAllDays(v => !v)}
                className="relative w-10 h-5 rounded-full flex-shrink-0 transition-colors"
                style={{ background: applyToAllDays ? 'var(--ink)' : 'rgba(58,44,30,0.18)' }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all"
                  style={{ left: applyToAllDays ? '22px' : '2px' }}
                />
              </button>
              <div>
                <p className="text-xs font-bold text-ink">Apply to all days (Mon – Sat)</p>
                <p className="text-[10px] text-ink-soft mt-0.5">
                  {applyToAllDays ? 'Will fill all 6 days for this period' : 'Will fill only ' + DAYS[modal.day - 1]}
                </p>
              </div>
            </div>

            <label className="block text-xs font-bold text-ink-soft mb-2 uppercase tracking-widest">
              Select Subject &amp; Teacher
            </label>
            <p className="text-[11px] text-ink-faint -mt-1 mb-2.5">
              Saving also updates every other period this week that already has this subject, so the same teacher is used throughout.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
              {assignments.map((a, i) => {
                const color    = SUBJECT_COLORS[i % SUBJECT_COLORS.length]
                const selected = selectedAssignmentIdx === i
                return (
                  <button
                    key={i}
                    onClick={() => { setSelectedAssignmentIdx(i); setConflictErrors([]) }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all"
                    style={{
                      borderColor: selected ? color.text : 'rgba(58,44,30,0.14)',
                      background:  selected ? color.bg   : 'white',
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: selected ? color.text : 'rgba(58,44,30,0.06)' }}
                    >
                      <span className="text-xs font-bold" style={{ color: selected ? 'white' : 'var(--ink-soft)' }}>
                        {(a.subject ?? 'S')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-ink truncate">{a.subject ?? 'Unnamed Subject'}</p>
                      <p className="text-xs text-ink-faint truncate">{teacherName(a.teacherId)}</p>
                    </div>
                    {selected && <Check className="w-4 h-4 flex-shrink-0" style={{ color: color.text }} />}
                  </button>
                )
              })}
            </div>

            {/* Add a new subject & teacher right here — no need to visit Classes → Assign first */}
            <div
              className="rounded-2xl p-3.5 mt-3"
              style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px dashed rgba(58,44,30,0.18)' }}
            >
              <p className="flex items-center gap-1.5 text-xs font-bold text-ink-soft mb-2.5">
                <UserPlus className="w-3.5 h-3.5" /> Add a subject &amp; teacher
              </p>
              <div className="flex flex-col gap-2">
                <select
                  value={newTeacherId}
                  onChange={e => setNewTeacherId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-[rgba(58,44,30,0.16)] text-sm text-ink focus:outline-none bg-white"
                >
                  <option value="">Select teacher…</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select
                  value={subjectChoice}
                  onChange={e => setSubjectChoice(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-[rgba(58,44,30,0.16)] text-sm text-ink focus:outline-none bg-white"
                >
                  <option value="">Select subject…</option>
                  {availableGradeSubjects.map(gs => (
                    <option key={gs.subject} value={gs.subject}>
                      {gs.subject} ({gs.category === 'special' ? 'Special' : 'Core'})
                    </option>
                  ))}
                  <option value={OTHER_SUBJECT}>Other (custom name)…</option>
                </select>
                <div className="flex gap-2">
                  {isOtherSubject && (
                    <input
                      value={customSubject}
                      onChange={e => setCustomSubject(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void addAssignment() }}
                      placeholder="Custom subject name"
                      className="flex-1 px-3 py-2.5 rounded-xl border-[1.5px] border-[rgba(58,44,30,0.16)] text-sm text-ink focus:outline-none bg-white"
                      autoFocus
                    />
                  )}
                  <button
                    onClick={addAssignment}
                    disabled={addingAssignment || !newTeacherId || !newSubject}
                    className={`px-4 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center ${isOtherSubject ? '' : 'flex-1'}`}
                    style={{ background: 'var(--ink)' }}
                  >
                    {addingAssignment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                  </button>
                </div>
                {availableGradeSubjects.length === 0 && gradeSubjects.length === 0 && (
                  <p className="text-[11px] text-ink-faint">
                    No subjects set up for Grade {classInfo?.grade} yet — add them under Classes → Grade {classInfo?.grade} → Subjects, or use &quot;Other&quot; here for now.
                  </p>
                )}
              </div>
              {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
            </div>

            {/* Conflict errors */}
            {conflictErrors.length > 0 && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm font-bold text-red-700">
                    {conflictErrors.length === 1 ? 'Conflict detected' : `${conflictErrors.length} conflicts detected`}
                  </p>
                </div>
                {conflictErrors.map((msg, i) => (
                  <p key={i} className="text-xs text-red-600 leading-relaxed pl-6">{msg}</p>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setModal(null); setConflictErrors([]) }}
                className="flex-1 py-2.5 rounded-2xl border border-[rgba(58,44,30,0.15)] text-sm font-bold text-ink-soft"
              >
                Cancel
              </button>
              <button
                onClick={savePeriod}
                disabled={saving || selectedAssignmentIdx < 0}
                className="flex-1 paper-btn-primary disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {applyToAllDays ? 'Save to All Days' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

