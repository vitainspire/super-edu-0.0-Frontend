'use client'
import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen, Users, Save, Check, Sparkles,
  AlertTriangle,
  ChevronDown, ChevronUp, CheckCircle2,
  GraduationCap, Play, Link2, Camera,
} from 'lucide-react'
import { useApp } from '@/lib/context'
import ScanAttendanceModal from './ScanAttendanceModal'
import type { Student } from '@/lib/types'
import { isCurrentSmartLesson } from '@/lib/types'
import clsx from 'clsx'

type Status = 'present' | 'absent' | 'late'
const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  present: { label: 'P', color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-300' },
  absent:  { label: 'A', color: 'text-red-700',     bg: 'bg-red-100 border-red-300' },
  late:    { label: 'L', color: 'text-amber-700',   bg: 'bg-amber-100 border-amber-300' },
}

interface AttendanceFormProps {
  classId: string
  // Rendered as an extra button right after the save confirmation — lets a caller
  // (e.g. Classroom Mode) continue into its own next step without this component
  // needing to know about that flow.
  postSaveAction?: { label: string; icon: ReactNode; onClick: () => void }
}

export default function AttendanceForm({ classId, postSaveAction }: AttendanceFormProps) {
  const router = useRouter()
  const {
    classes,
    students: rawStudents,
    getClassSyllabus,
    sessions: rawSessions,
    attendance: rawAttendance,
    recordSession, toggleTopicComplete,
    syllabusSubTopics, toggleSubTopicComplete,
    getTaughtTopicToday, saveTaughtTopic,
    getPrepMaterial, prepMaterials, saveSessionSnapshot,
  } = useApp()

  const cls      = classes.find(c => c.id === classId)
  // Use raw React state (not ref-based getter) so the effect never sees a stale empty list
  const ctxStudents = useMemo(
    () => rawStudents.filter(s => s.classId === classId && s.isActive),
    [rawStudents, classId]
  )
  // Fallback: if the shared context roster is empty for this class (e.g. the initial
  // load hasn't populated admin-managed students yet), fetch them directly so the
  // teacher never ends up marking attendance against an empty roster.
  const [directStudents, setDirectStudents] = useState<Student[]>([])
  useEffect(() => {
    if (ctxStudents.length > 0) { setDirectStudents([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const { fetchStudentsByClasses } = await import('@/lib/supabase-queries')
        const list = await fetchStudentsByClasses([classId])
        if (!cancelled) {
          setDirectStudents(
            list.filter(s => s.isActive).sort((a, b) => (a.rollNumber || '').localeCompare(b.rollNumber || ''))
          )
        }
      } catch { /* leave empty — save guard will handle it */ }
    })()
    return () => { cancelled = true }
  }, [ctxStudents.length, classId])

  const students = ctxStudents.length > 0 ? ctxStudents : directStudents
  const syllabus = getClassSyllabus(classId)
  const today    = new Date().toISOString().split('T')[0]

  // Raw-state derived values — not ref-based, so never stale inside effects
  const classSessions = useMemo(
    () => rawSessions.filter(s => s.classId === classId).sort((a, b) => b.date.localeCompare(a.date)),
    [rawSessions, classId]
  )

  // Topic state — teacher types freely or picks from syllabus
  const [topicText, setTopicText]               = useState('')
  const [selectedTopicId, setSelectedTopicId]   = useState('')
  const [selectedSubTopicIds, setSelectedSubTopicIds] = useState<Set<string>>(new Set())
  const [showSyllabusPicker, setShowSyllabusPicker] = useState(false)

  const [sessionNote, setSessionNote]     = useState('')
  const [statusMap, setStatusMap]         = useState<Record<string, Status>>({})
  const [saving, setSaving]               = useState(false)
  // Prevent the fresh-form init effect from firing more than once (syllabus may arrive later)
  const hasInitialized = useRef(false)
  // manuallyReset: teacher tapped "Record Another Session" → ignore today's saved data
  const [manuallyReset, setManuallyReset] = useState(false)
  const [markingDone, setMarkingDone]     = useState(false)
  const [weekComplete, setWeekComplete]   = useState<number | null>(null)
  // Post-save late-arrival edits: absent → late after session is saved
  const [lateEdits, setLateEdits] = useState<Record<string, Status>>({})
  // Second-session mode: attendance inherited from morning roll, show compact view
  const [isInheritedAttendance, setIsInheritedAttendance] = useState(false)
  const [showFullAttendance, setShowFullAttendance]       = useState(false)
  const inheritedFromMorning = useRef(false)
  // True when the topic/sub-topic below was auto-filled from a Timetable prep material for today
  const [syncedFromTimetable, setSyncedFromTimetable] = useState(false)
  const skipNextSubtopicAutoPick = useRef(false)
  // Topic id we've already auto-picked a sub-topic for — lets multi-select survive data refreshes
  const autoPickedTopic = useRef('')
  const [scanOpen, setScanOpen] = useState(false)

  // ── Derived state (no effects needed) ─────────────────────────────────────
  // todaySession: the session saved for this class today, if any
  const todaySession = useMemo(
    () => manuallyReset ? undefined : classSessions.find(s => s.date === today),
    [classSessions, today, manuallyReset]
  )
  // isSaved: true whenever today's session exists AND teacher hasn't manually cleared
  const isSaved = !!todaySession

  // Build the attendance map from raw DB records when session exists
  const todayAttMap = useMemo(() => {
    if (!todaySession) return null
    const map: Record<string, Status> = {}
    students.forEach(s => { map[s.id] = 'present' })
    rawAttendance
      .filter(a => a.sessionId === todaySession.id)
      .forEach(a => { map[a.studentId] = a.status as Status })
    return map
  }, [todaySession, rawAttendance, students])

  // First session of today — not affected by manuallyReset, always reflects the morning roll.
  // Used to auto-inherit attendance for subsequent sessions of the same class.
  const todayFirstSession = useMemo(
    () => classSessions.find(s => s.date === today),
    [classSessions, today]
  )
  const todayFirstAttMap = useMemo(() => {
    if (!todayFirstSession) return null
    const map: Record<string, Status> = {}
    students.forEach(s => { map[s.id] = 'present' })
    rawAttendance
      .filter(a => a.sessionId === todayFirstSession.id)
      .forEach(a => { map[a.studentId] = a.status as Status })
    return map
  }, [todayFirstSession, rawAttendance, students])

  // displayMap: use DB records when saved, teacher's edits when not
  // effectiveMap: also layers post-save late-arrival edits on top
  const displayMap   = todayAttMap ?? statusMap
  const effectiveMap = isSaved ? { ...displayMap, ...lateEdits } : displayMap
  // displayTopic: show saved session topic on restore, live input when editing
  const displayTopic = todaySession?.topic ?? topicText

  const selectedTopic  = syllabus.find(t => t.id === selectedTopicId)
  const topicSubTopics = useMemo(
    () => syllabusSubTopics
      .filter(s => s.topicId === selectedTopicId)
      .sort((a, b) => a.orderIndex - b.orderIndex),
    [syllabusSubTopics, selectedTopicId]
  )
  const selectedSubTopics      = topicSubTopics.filter(s => selectedSubTopicIds.has(s.id))
  const nextIncompleteSubTopic = topicSubTopics.find(s => !s.isCompleted)

  // Initialize fresh form: pre-fill all-present + suggest next topic.
  // Restore is handled by todaySession/todayAttMap useMemos — no effect needed for that.
  // hasInitialized prevents a late-arriving syllabus from re-running this and wiping the teacher's edits.
  useEffect(() => {
    if (isSaved || students.length === 0) return
    if (hasInitialized.current) return
    hasInitialized.current = true

    // Only reset statusMap if "Record Another Session" didn't already pre-fill from morning roll
    if (!inheritedFromMorning.current) {
      const initial: Record<string, Status> = {}
      students.forEach(s => { initial[s.id] = 'present' })
      setStatusMap(initial)
      setIsInheritedAttendance(false)
      setShowFullAttendance(false)
    }
    inheritedFromMorning.current = false

    if (!topicText) {
      // Prefer whatever topic/sub-topic was already prepped for this class today
      // via the Timetable's Prep Material popup, so the two stay in sync.
      const taught = getTaughtTopicToday(classId)
      const matchedTopic = taught ? syllabus.find(t => t.topic.toLowerCase() === taught.topic.toLowerCase()) : null

      if (taught) {
        setTopicText(taught.topic)
        setSyncedFromTimetable(true)
        if (matchedTopic) {
          setSelectedTopicId(matchedTopic.id)
          if (taught.subtopic) {
            const matchedSub = syllabusSubTopics.find(
              s => s.topicId === matchedTopic.id && s.name.toLowerCase() === taught.subtopic!.toLowerCase()
            )
            if (matchedSub) {
              setSelectedSubTopicIds(new Set([matchedSub.id]))
              skipNextSubtopicAutoPick.current = true
            }
          }
        }
      } else if (syllabus.length > 0) {
        const lastSession = classSessions[0]
        let suggested = null
        if (lastSession) {
          suggested = syllabus.find(t => t.id === lastSession.syllabusTopicId && !t.isCompleted) ?? null
        }
        if (!suggested) {
          const sorted = [...syllabus].sort((a, b) => {
            if (a.weekNumber != null && b.weekNumber != null) return a.weekNumber - b.weekNumber
            return a.orderIndex - b.orderIndex
          })
          suggested = sorted.find(t => !t.isCompleted) ?? null
        }
        if (suggested) {
          setTopicText(suggested.topic)
          setSelectedTopicId(suggested.id)
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSaved, students.length, syllabus.length, classSessions.length])

  // Auto-pick the first incomplete sub-topic the first time a topic is chosen.
  // Multi-select is preserved: once auto-picked for a topic, later data refreshes
  // never override the teacher's picks (including deselecting all).
  useEffect(() => {
    if (!selectedTopicId) return
    if (skipNextSubtopicAutoPick.current) { skipNextSubtopicAutoPick.current = false; autoPickedTopic.current = selectedTopicId; return }
    if (autoPickedTopic.current === selectedTopicId) return
    const subs = syllabusSubTopics
      .filter(s => s.topicId === selectedTopicId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
    if (subs.length === 0) return   // sub-topics not loaded yet — retry when they arrive
    const firstIncomplete = subs.find(s => !s.isCompleted)
    setSelectedSubTopicIds(firstIncomplete ? new Set([firstIncomplete.id]) : new Set())
    autoPickedTopic.current = selectedTopicId
  }, [selectedTopicId, syllabusSubTopics])

  const handleTopicTextChange = (val: string) => {
    setTopicText(val)
    const match = syllabus.find(t => t.topic.toLowerCase() === val.toLowerCase())
    setSelectedTopicId(match?.id ?? '')
    setSyncedFromTimetable(false)
  }

  const handlePickSyllabusTopic = (topicId: string, topicName: string) => {
    setSelectedTopicId(topicId)
    setTopicText(topicName)
    setShowSyllabusPicker(false)
    setSyncedFromTimetable(false)
  }

  const toggle = (studentId: string) => {
    setStatusMap(prev => {
      const cycle: Status[] = ['present', 'absent', 'late']
      const cur = prev[studentId] ?? 'present'
      return { ...prev, [studentId]: cycle[(cycle.indexOf(cur) + 1) % 3] }
    })
  }

  const setAll = (status: Status) => {
    const next: Record<string, Status> = {}
    students.forEach(s => { next[s.id] = status })
    setStatusMap(next)
  }

  const handleSave = async () => {
    if (!topicText.trim()) return
    // Guard: never save a session with an empty roster — that records the topic but
    // zero attendance (so students' absences never persist). Wait for students to load.
    if (students.length === 0) {
      alert('Student list is still loading — please wait a moment and try again.')
      return
    }
    setSaving(true)
    const topicId = selectedTopicId || ''
    const subtopicJoined = selectedSubTopics.map(s => s.name).join(', ') || undefined
    const sessionId = await recordSession(
      classId, today, topicId, topicText,
      students.map(s => ({ studentId: s.id, status: statusMap[s.id] ?? 'present' })),
      sessionNote.trim() || undefined,
    )
    // Keep the Timetable's "taught today" record in sync, even if the teacher
    // never opened the Prep Material popup for this class.
    saveTaughtTopic({ classId, topic: topicText.trim(), subtopic: subtopicJoined }).catch(() => {})

    // Feed the catchup-plan pipeline: if prep material exists for this topic, attach a
    // snapshot of it to the session so CatchupModal can open a missed lesson the same
    // way the class experienced it, instead of generating blind. Best-effort — a missing
    // or non-matching snapshot just means catchup plans fall back to their generic path.
    if (sessionId) {
      const material = getPrepMaterial(classId, topicText.trim(), subtopicJoined) ??
        [...prepMaterials]
          .filter(p => p.classId === classId && p.topic.trim().toLowerCase() === topicText.trim().toLowerCase() && isCurrentSmartLesson(p.lesson))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      if (material) {
        const hook = material.lesson.explore?.points?.[0]?.text
        const realLifeExamples = (material.lesson.levelSet?.points ?? []).map(p => p.text).filter(Boolean)
        if (hook) saveSessionSnapshot(sessionId, { hook, realLifeExamples }).catch(() => {})
      }
    }
    setSaving(false)
    setManuallyReset(false)   // let todaySession be found → isSaved becomes true
  }

  const handleMarkDone = async () => {
    if (!selectedTopic) return
    setMarkingDone(true)
    const toMark = selectedSubTopics.filter(s => !s.isCompleted)
    if (topicSubTopics.length > 0 && toMark.length > 0) {
      for (const sub of toMark) {
        await toggleSubTopicComplete(sub.id, true)
      }
    } else {
      await toggleTopicComplete(selectedTopic.id, true)
      if (selectedTopic.weekNumber != null) {
        const weekTopics = syllabus.filter(t => t.weekNumber === selectedTopic.weekNumber)
        const remaining  = weekTopics.filter(t => t.id !== selectedTopic.id && !t.isCompleted)
        if (remaining.length === 0 && weekTopics.length > 0) setWeekComplete(selectedTopic.weekNumber)
      }
    }
    setMarkingDone(false)
  }

  const handleMarkLate = async (studentId: string) => {
    if (!todaySession) return
    const current = effectiveMap[studentId]
    const next: Status = current === 'absent' ? 'late' : 'absent'
    setLateEdits(prev => ({ ...prev, [studentId]: next }))
    const { upsertAttendanceRecord } = await import('@/lib/supabase-queries')
    const rec = rawAttendance.find(a => a.sessionId === todaySession.id && a.studentId === studentId)
    if (rec) {
      upsertAttendanceRecord({ ...rec, status: next }).catch(console.error)
    }
  }

  const presentCount   = students.filter(s => effectiveMap[s.id] === 'present').length
  const absentCount    = students.filter(s => effectiveMap[s.id] === 'absent').length
  const lateCount      = students.filter(s => effectiveMap[s.id] === 'late').length
  const absentStudents = students.filter(s => effectiveMap[s.id] === 'absent')
  const lateStudents   = students.filter(s => effectiveMap[s.id] === 'late')

  const incompleteSelectedSubs = selectedSubTopics.filter(s => !s.isCompleted)
  const markDoneLabel = topicSubTopics.length > 0 && incompleteSelectedSubs.length > 0
    ? incompleteSelectedSubs.length === 1
      ? `Mark "${incompleteSelectedSubs[0].name}" as done`
      : `Mark ${incompleteSelectedSubs.length} sub-topics as done`
    : selectedTopic ? `Mark "${selectedTopic.topic}" as fully covered` : ''

  const markDoneVisible = isSaved && selectedTopicId && (
    topicSubTopics.length > 0
      ? incompleteSelectedSubs.length > 0
      : selectedTopic && !selectedTopic.isCompleted
  ) && weekComplete === null

  if (students.length === 0) {
    return (
      <div className="p-4">
        <div className="paper-card text-center py-14">
          <Users size={36} className="text-ink-faint mx-auto mb-3" />
          <p className="font-semibold text-ink">No students yet</p>
          <p className="text-sm text-ink-soft mt-1">Add students in the Students tab first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 pb-8">

      {/* ── Session header ── */}
      <div className="rounded-3xl p-5" style={{ background: isSaved ? '#AAD6A0' : '#AACDEA', border: '2px solid rgba(58,44,30,0.12)' }}>
        <div className="flex items-center gap-2 mb-3">
          {isSaved ? <Check size={12} style={{ color: '#234A1D' }} /> : <Sparkles size={12} style={{ color: '#1E3A55' }} />}
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: isSaved ? '#234A1D' : '#1E3A55', opacity: 0.75 }}>
            {new Date(today + 'T00:00:00').toLocaleDateString('en-IN', {
              weekday: 'long', day: 'numeric', month: 'short',
            })}
          </p>
        </div>

        <p className="text-xs font-semibold mb-1.5" style={{ color: isSaved ? '#234A1D' : '#1E3A55', opacity: 0.75 }}>
          {isSaved ? 'Taught today' : 'What are you teaching today?'}
        </p>

        {/* Topic — editable before save, summary after */}
        {isSaved ? (
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
            style={{ background: 'rgba(255,255,255,0.55)' }}>
            <p className="font-display font-bold text-sm" style={{ color: '#234A1D' }}>{displayTopic}</p>
            <p className="text-xs font-semibold" style={{ color: '#234A1D', opacity: 0.75 }}>
              {presentCount}P · {absentCount > 0 ? `${absentCount}A` : 'all present'}
            </p>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={topicText}
              onChange={e => handleTopicTextChange(e.target.value)}
              placeholder="e.g. Fractions, Photosynthesis, World War II…"
              className="w-full rounded-2xl px-4 py-3 text-sm font-semibold outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.55)', color: '#1E3A55' }}
            />
            {selectedTopic && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <CheckCircle2 size={16} style={{ color: '#1E3A55' }} />
              </div>
            )}
          </div>
        )}

        {/* Synced-from-Timetable indicator */}
        {syncedFromTimetable && !isSaved && (
          <div className="flex items-center gap-1.5 mt-2">
            <Link2 size={11} style={{ color: '#1E3A55', opacity: 0.7 }} />
            <span className="text-[11px] font-semibold" style={{ color: '#1E3A55', opacity: 0.7 }}>Synced from Timetable prep material</span>
          </div>
        )}

        {/* Syllabus quick-pick */}
        {syllabus.length > 0 && !isSaved && (
          <button
            type="button"
            onClick={() => setShowSyllabusPicker(p => !p)}
            className="mt-3 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.4)', color: '#1E3A55' }}
          >
            <BookOpen size={10} />
            {showSyllabusPicker ? 'Close syllabus' : 'Pick from syllabus'}
            {showSyllabusPicker ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        )}

        {/* Sub-topic badges (multi-select) */}
        {selectedTopicId && topicSubTopics.length > 0 && (
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className="text-xs font-medium" style={{ color: '#1E3A55', opacity: 0.7 }}>
              Sub-topic{selectedSubTopics.length !== 1 ? 's' : ''}:
            </span>
            {selectedSubTopics.length > 0 ? selectedSubTopics.map(s => (
              <span key={s.id} className="text-xs font-bold px-2.5 py-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.5)', color: '#1E3A55' }}>
                {s.name}
              </span>
            )) : (
              <span className="text-xs font-bold px-2.5 py-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.5)', color: '#1E3A55' }}>—</span>
            )}
          </div>
        )}
      </div>

      {/* ── Syllabus picker ── */}
      {showSyllabusPicker && (
        <div className="paper-card overflow-hidden">
          <div className="px-4 py-3 border-b border-black/5">
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Your Syllabus</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {syllabus.map((topic, idx) => {
              const subCount  = syllabusSubTopics.filter(s => s.topicId === topic.id).length
              const doneSubs  = syllabusSubTopics.filter(s => s.topicId === topic.id && s.isCompleted).length
              return (
                <button key={topic.id} type="button"
                  onClick={() => handlePickSyllabusTopic(topic.id, topic.topic)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-3 text-left border-b border-black/5 last:border-0 active:bg-black/[0.03] transition-colors',
                    topic.isCompleted && 'opacity-50',
                  )}>
                  <span className="w-6 h-6 bg-[#DCEBF8] text-[#1E3A55] rounded-full text-xs font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={clsx('font-semibold text-sm truncate', topic.isCompleted ? 'text-ink-soft line-through' : 'text-ink')}>
                      {topic.topic}
                    </p>
                    {subCount > 0 && (
                      <p className="text-xs text-ink-soft">{doneSubs}/{subCount} sub-topics done</p>
                    )}
                  </div>
                  {topic.isCompleted && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-1.5 py-0.5 rounded-full shrink-0">Done</span>
                  )}
                  {selectedTopicId === topic.id && !topic.isCompleted && (
                    <CheckCircle2 size={14} className="text-[#5B87AD] shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Sub-topic picker — multi-select (tap to toggle one or more) ── */}
      {selectedTopicId && topicSubTopics.length > 0 && !isSaved && (
        <div className="paper-card overflow-hidden">
          <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Sub-topics of &quot;{selectedTopic?.topic}&quot;</p>
            <span className="text-[10px] font-semibold text-ink-faint shrink-0">Tap to select one or more</span>
          </div>
          {topicSubTopics.map(sub => {
            const picked = selectedSubTopicIds.has(sub.id)
            return (
              <button key={sub.id} type="button"
                onClick={() => setSelectedSubTopicIds(prev => {
                  const next = new Set(prev)
                  if (next.has(sub.id)) next.delete(sub.id); else next.add(sub.id)
                  return next
                })}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-3 border-b border-black/5 last:border-0 text-left transition-all',
                  picked ? 'bg-[#DCEBF8]' : 'active:bg-black/[0.03]',
                )}>
                {picked
                  ? <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--ink)' }}><Check size={13} className="text-white" strokeWidth={3} /></div>
                  : sub.isCompleted
                    ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                    : <div className="w-5 h-5 rounded-md border-2 border-ink-faint shrink-0" />}
                <span className={clsx('flex-1 text-sm font-semibold', sub.isCompleted && !picked ? 'text-ink-soft line-through' : 'text-ink')}>
                  {sub.name}
                </span>
                {sub.isCompleted && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-1.5 py-0.5 rounded-full shrink-0">Done</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Session Note ── */}
      {displayTopic.trim() && !isSaved && (
        <div className="paper-card px-4 py-4">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-2">What did you cover today?</p>
          <textarea
            value={sessionNote}
            onChange={e => setSessionNote(e.target.value)}
            placeholder="e.g. Taught 3-digit × 1-digit with worked examples (optional)"
            rows={2}
            className="w-full text-sm text-ink placeholder-ink-faint bg-black/[0.03] rounded-2xl px-3 py-2.5 border border-black/5 resize-none focus:outline-none focus:ring-2 focus:ring-[#AACDEA]"
          />
        </div>
      )}

      {/* ── Attendance ── */}
      {displayTopic.trim() && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Attendance</p>
            <p className="text-xs text-ink-soft font-semibold">
              {presentCount}P · {absentCount}A{lateCount > 0 ? ` · ${lateCount}L` : ''}
            </p>
          </div>

          {/* ── Compact inherited view: morning roll already taken, just confirm ── */}
          {!isSaved && isInheritedAttendance && !showFullAttendance && (
            <div className="bg-[#DCEBF8] border border-[#AACDEA] rounded-2xl px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#5B87AD]" />
                  <p className="text-sm font-bold text-[#1E3A55]">Morning roll carried over</p>
                </div>
                <button type="button" onClick={() => setShowFullAttendance(true)}
                  className="text-xs font-bold text-[#5B87AD] underline">
                  Edit
                </button>
              </div>
              {absentCount === 0 && lateCount === 0 ? (
                <p className="text-xs text-[#5B87AD]">All {students.length} students present today</p>
              ) : (
                <>
                  <p className="text-xs text-[#5B87AD] mb-2">
                    {presentCount} present
                    {absentCount > 0 ? ` · ${absentCount} absent` : ''}
                    {lateCount > 0 ? ` · ${lateCount} late` : ''}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {absentStudents.map(s => (
                      <span key={s.id} className="text-xs font-semibold bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full">
                        {s.name}
                      </span>
                    ))}
                    {lateStudents.map(s => (
                      <span key={s.id} className="text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full">
                        {s.name} (late)
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Full attendance controls (first session, or teacher chose to edit) ── */}
          {!isSaved && (!isInheritedAttendance || showFullAttendance) && (
            <div className="space-y-2">
              {isInheritedAttendance && showFullAttendance && (
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs text-[#5B87AD] font-semibold">Editing morning roll — applies to this session only</p>
                  <button type="button" onClick={() => setShowFullAttendance(false)}
                    className="text-xs font-bold text-ink-soft underline">
                    ← Summary
                  </button>
                </div>
              )}
              <button type="button" onClick={() => setAll('present')}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 active:scale-95 transition-all">
                <Check size={14} /> Mark All Present
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAll('absent')}
                  className="flex-1 py-2 rounded-2xl text-xs font-bold bg-red-50 text-red-600 border border-red-200 active:scale-95 transition-all">
                  All Absent
                </button>
                <button type="button" onClick={() => setAll('late')}
                  className="flex-1 py-2 rounded-2xl text-xs font-bold bg-amber-50 text-amber-600 border border-amber-200 active:scale-95 transition-all">
                  All Late
                </button>
              </div>
              <button type="button" onClick={() => setScanOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-bold text-[#8069B0] bg-[#E9E1F6] border border-[#C7B7E8] active:scale-95 transition-all">
                <Camera size={14} /> Scan Attendance Sheet
              </button>
            </div>
          )}

          {/* ── Student list (full when saved or expanded; hidden in compact inherited mode) ── */}
          {(isSaved || !isInheritedAttendance || showFullAttendance) && (
            <div className="space-y-2">
              {students.map(student => {
                const status     = effectiveMap[student.id] ?? 'present'
                const cfg        = STATUS_CONFIG[status]
                const canToggle  = !isSaved || status === 'absent' || status === 'late'
                return (
                  <button key={student.id} type="button"
                    onClick={() => {
                      if (!isSaved) toggle(student.id)
                      else if (status === 'absent' || status === 'late') handleMarkLate(student.id)
                    }}
                    disabled={isSaved && status === 'present'}
                    className={clsx(
                      'w-full flex items-center gap-3 paper-card p-4 text-left',
                      canToggle && 'active:scale-[0.98] transition-transform',
                    )}>
                    <div className={clsx('w-10 h-10 rounded-full border-2 flex items-center justify-center font-extrabold text-sm shrink-0', cfg.bg, cfg.color)}>
                      {cfg.label}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-ink">{student.name}</p>
                      <p className="text-xs text-ink-soft">
                        Roll {student.rollNumber}
                        {student.interests?.length > 0 && <span className="ml-1 text-[#5B87AD]">· {student.interests[0]}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={clsx('px-3 py-1 rounded-full text-xs font-bold border', cfg.bg, cfg.color)}>{status}</span>
                      {isSaved && (status === 'absent' || status === 'late') && (
                        <span className="text-[10px] text-ink-soft font-semibold">
                          {status === 'absent' ? 'tap → Late' : 'tap → Absent'}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {!isSaved && (
            <button type="button" onClick={handleSave}
              disabled={saving || !topicText.trim()}
              className="paper-btn-primary w-full text-base disabled:opacity-50">
              {saving ? <span className="animate-pulse">Saving…</span> : <><Save size={18} /> Save Session</>}
            </button>
          )}
        </div>
      )}

      {/* ── Post-save ── */}
      {isSaved && (
        <div className="space-y-3">

          {/* Confirmation */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <Check size={20} className="text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">
                Saved — {presentCount}P
                {absentCount > 0 ? `, ${absentCount}A` : ''}
                {lateCount > 0 ? `, ${lateCount}L` : ''}
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">{displayTopic}</p>
              {todaySession?.sessionNote && (
                <p className="text-xs text-emerald-500 mt-0.5 italic">{todaySession.sessionNote}</p>
              )}
            </div>
          </div>

          {/* Caller-supplied next step (e.g. Classroom Mode's "Continue to Lesson") */}
          {postSaveAction && (
            <button type="button"
              onClick={postSaveAction.onClick}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm active:scale-[0.98] transition-all"
              style={{ background: 'var(--ink)' }}>
              {postSaveAction.label} {postSaveAction.icon}
            </button>
          )}

          {/* Absent students — with late-arrival toggle */}
          {(absentCount > 0 || lateCount > 0) && (
            <div className="rounded-3xl p-4 border border-red-100 bg-red-50/40">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                  <AlertTriangle size={14} className="text-red-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-900">
                    {absentCount > 0 ? `${absentCount} absent` : ''}{absentCount > 0 && lateCount > 0 ? ' · ' : ''}{lateCount > 0 ? `${lateCount} arrived late` : ''}
                  </p>
                  {absentCount > 0 && (
                    <p className="text-[11px] text-red-400 font-medium mt-0.5">Tap a student to mark as Late if they arrived</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                {absentStudents.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => handleMarkLate(s.id)}
                    className="w-full flex items-center gap-2.5 bg-white rounded-xl px-3 py-2 border border-red-100 active:bg-amber-50 active:border-amber-200 transition-colors">
                    <span className="w-7 h-7 bg-red-100 text-red-600 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0">
                      {s.name[0].toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-ink flex-1 text-left">{s.name}</span>
                    <span className="text-xs text-ink-soft">Roll #{s.rollNumber}</span>
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">→ Late</span>
                  </button>
                ))}
                {lateStudents.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => handleMarkLate(s.id)}
                    className="w-full flex items-center gap-2.5 bg-white rounded-xl px-3 py-2 border border-amber-200 active:bg-red-50 transition-colors">
                    <span className="w-7 h-7 bg-amber-100 text-amber-700 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0">
                      {s.name[0].toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-ink flex-1 text-left">{s.name}</span>
                    <span className="text-xs text-ink-soft">Roll #{s.rollNumber}</span>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">Late</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Next sub-topic suggestion */}
          {topicSubTopics.length > 0 && nextIncompleteSubTopic && !selectedSubTopicIds.has(nextIncompleteSubTopic.id) && (
            <div className="bg-[#DCEBF8] border border-[#AACDEA] rounded-2xl px-4 py-3">
              <p className="text-xs font-bold text-[#5B87AD] mb-1">Next sub-topic</p>
              <p className="text-sm font-semibold text-[#1E3A55]">{nextIncompleteSubTopic.name}</p>
              <button type="button" onClick={() => setSelectedSubTopicIds(prev => new Set(prev).add(nextIncompleteSubTopic.id))}
                className="mt-2 text-xs font-bold text-[#5B87AD] underline">
                Add this sub-topic
              </button>
            </div>
          )}

          {/* Mark as done (only visible for syllabus-linked topics) */}
          {markDoneVisible && (
            <button type="button" onClick={handleMarkDone} disabled={markingDone}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-600 text-white font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-60">
              <CheckCircle2 size={17} />
              {markingDone ? 'Saving…' : markDoneLabel}
            </button>
          )}

          {/* Week complete → create exam */}
          {weekComplete !== null && (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={20} className="text-amber-500" />
                <p className="font-display font-extrabold text-amber-900 text-lg">Week {weekComplete} complete!</p>
              </div>
              <p className="text-sm text-amber-800 mb-4 leading-relaxed">
                All Week {weekComplete} topics are done. A good time to run an exam.
              </p>
              <button type="button"
                onClick={() => router.push(`/classes/${classId}/marks?createTest=1`)}
                className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white font-extrabold py-3 rounded-2xl text-sm active:scale-[0.98] transition-transform">
                <GraduationCap size={16} /> Create Exam for Week {weekComplete}
              </button>
            </div>
          )}

          {/* Record another session */}
          <button type="button"
            onClick={() => {
              setManuallyReset(true)
              hasInitialized.current = false
              setWeekComplete(null)
              setTopicText('')
              setSelectedTopicId('')
              setSelectedSubTopicIds(new Set())
              autoPickedTopic.current = ''
              setSyncedFromTimetable(false)
              setSessionNote('')
              setLateEdits({})
              setShowFullAttendance(false)

              if (todayFirstAttMap) {
                // Inherit morning roll — subject teacher doesn't re-mark 40 students
                setStatusMap({ ...todayFirstAttMap })
                setIsInheritedAttendance(true)
                inheritedFromMorning.current = true
              } else {
                const initial: Record<string, Status> = {}
                students.forEach(s => { initial[s.id] = 'present' })
                setStatusMap(initial)
                setIsInheritedAttendance(false)
                inheritedFromMorning.current = false
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-ink text-sm font-bold active:scale-95 transition-transform"
            style={{ background: 'rgba(58,44,30,0.08)' }}>
            <Play size={13} fill="currentColor" /> Record Another Session
          </button>
        </div>
      )}

      <ScanAttendanceModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        students={students}
        className={cls?.name ?? ''}
        date={today}
        onApply={map => setStatusMap(prev => ({ ...prev, ...map }))}
      />
    </div>
  )
}
