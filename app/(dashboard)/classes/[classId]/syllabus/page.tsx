'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import {
  Plus, BookOpen, Users, Sparkles, ChevronDown, ChevronUp,
  X, CalendarDays,
} from '@/components/ui/icons'
import {
  CheckCircle2, Circle, Calendar, RefreshCw, PlayCircle, List,
} from 'lucide-react'
import { useApp } from '@/lib/context'
import { computePacing } from '@/lib/logic/pacing'
import { buildWeekTabs, topicsForWeek, defaultSelectedWeek, type WeekKey } from '@/lib/logic/weeklyPlan'
import type { AcademicEvent } from '@/lib/types'
import clsx from 'clsx'

interface WeekPlan { week: number; topics: string[]; tip: string; activity: string }

// Would setting `current`'s prerequisite to `candidateDefId` eventually loop
// back to `current`? Walks the candidate's own prerequisite chain (bounded,
// in case of already-bad data) rather than trusting it can't cycle.
function createsCycle(candidateDefId: string, currentDefId: string, allTopics: { definitionId?: string; prerequisiteDefinitionId?: string }[]): boolean {
  let cursor: string | undefined = candidateDefId
  const seen = new Set<string>()
  for (let i = 0; i < 20 && cursor; i++) {
    if (cursor === currentDefId) return true
    if (seen.has(cursor)) break
    seen.add(cursor)
    cursor = allTopics.find(t => t.definitionId === cursor)?.prerequisiteDefinitionId
  }
  return false
}

export default function ClassSyllabusPage() {
  const { classId } = useParams<{ classId: string }>()
  const {
    teacher, classes, getClassSyllabus, getClassSubjects,
    updateSyllabusTopicPrerequisite, getTopicSessions, getClassStudents, getClassAttendance,
    syllabusSubTopics, addSubTopic, deleteSubTopic, toggleSubTopicComplete, toggleTopicComplete,
    ensureClassSyllabus,
  } = useApp()

  // Backfill this section with any grade-level topics it's missing (e.g. a
  // section created after the syllabus was built). Runs once per class.
  useEffect(() => {
    void ensureClassSyllabus(classId)
  }, [classId, ensureClassSyllabus])

  // The admin's published "Academic Year" calendar entry is the real source
  // of truth for week numbering — teacher.academicYearStart is a separate,
  // never-set field and must not be used for this.
  const [academicEvents, setAcademicEvents] = useState<AcademicEvent[]>([])
  useEffect(() => {
    fetch('/api/teacher/academic-calendar')
      .then(r => r.json())
      .then(d => setAcademicEvents(d.events ?? []))
      .catch(() => {})
  }, [])
  const academicYearStart = academicEvents.find(e => e.category === 'term' && e.title === 'Academic Year')?.startDate

  const currentClass = classes.find(c => c.id === classId)
  const grade = currentClass?.grade ?? ''
  const gradeSectionCount = classes.filter(c => (c.grade ?? '') === grade).length

  // ── Sub-topic UI state ─────────────────────────────────
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null)
  const [addingSubFor, setAddingSubFor]       = useState<string | null>(null)
  const [newSubName, setNewSubName]           = useState('')
  const [savingSub, setSavingSub]             = useState(false)

  // ── AI Lesson Plan ─────────────────────────────────────
  const [planOpen, setPlanOpen]       = useState(false)
  const [planLoading, setPlanLoading] = useState(false)
  const [planWeeks, setPlanWeeks]     = useState<WeekPlan[]>([])
  const [planError, setPlanError]     = useState('')

  // ── Subject scope ────────────────────────────────────────
  // A class is graded+sectioned, never per-subject: its syllabus rows cover
  // every subject taught to it. Show one subject at a time, defaulting to the
  // first this teacher holds for the class, so Maths never lists EVS topics.
  const classSubjects = getClassSubjects(classId)
  const [pickedSubject, setPickedSubject] = useState<string | null>(null)
  const activeSubject = pickedSubject ?? classSubjects[0] ?? null

  // ── Weekly tabs ──────────────────────────────────────────
  const [selectedWeek, setSelectedWeek] = useState<WeekKey | null>(null)

  // ── Today's Topic (sequential, no manual picking) ───────
  const [focusMode, setFocusMode] = useState(false)

  const topics   = getClassSyllabus(classId, activeSubject)
  const students = getClassStudents(classId)
  const completed = topics.filter(t => t.isCompleted).length
  const pct       = topics.length ? Math.round((completed / topics.length) * 100) : 0
  const pacing    = computePacing(academicYearStart, topics)

  const weekTabs = buildWeekTabs(topics, academicYearStart)
  const visibleTopics = selectedWeek != null ? topicsForWeek(topics, selectedWeek) : topics

  // Switching subject switches syllabus, so the week tabs have to be re-picked
  // for the new one rather than keeping a week that may not exist in it.
  useEffect(() => { setSelectedWeek(null) }, [activeSubject])

  // Default to the current week once topics load, without overriding a manual tab click
  useEffect(() => {
    if (selectedWeek !== null || weekTabs.length === 0) return
    setSelectedWeek(defaultSelectedWeek(weekTabs))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekTabs.length, selectedWeek])

  const weekDoneCount  = visibleTopics.filter(t => t.isCompleted).length

  // Walks the whole ordered syllabus (topics, then each one's sub-topics) and stops at
  // the first incomplete unit — that's "today's topic". Marking it done recomputes this
  // on next render, so the view auto-advances without the teacher picking anything.
  let currentTopic: typeof topics[number] | null = null
  let currentSub: (typeof syllabusSubTopics)[number] | null = null
  let totalUnits = 0
  let doneUnits = 0
  for (const t of topics) {
    const subs = syllabusSubTopics.filter(s => s.topicId === t.id).sort((a, b) => a.orderIndex - b.orderIndex)
    if (subs.length > 0) {
      totalUnits += subs.length
      doneUnits += subs.filter(s => s.isCompleted).length
      if (!currentTopic) {
        const nextSub = subs.find(s => !s.isCompleted)
        if (nextSub) { currentTopic = t; currentSub = nextSub }
        else if (!t.isCompleted) { currentTopic = t }   // every sub-topic done, but topic itself not closed out yet
      }
    } else {
      totalUnits += 1
      if (t.isCompleted) doneUnits += 1
      else if (!currentTopic) currentTopic = t
    }
  }

  const markCurrentDone = async () => {
    if (currentSub) await toggleSubTopicComplete(currentSub.id, true)
    else if (currentTopic) await toggleTopicComplete(currentTopic.id, true)
  }

  const interestCount: Record<string, number> = {}
  students.forEach(s => s.interests.forEach(i => { interestCount[i] = (interestCount[i] ?? 0) + 1 }))
  const topInterests = Object.entries(interestCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([i]) => i)

  // ── Lesson plan ─────────────────────────────────────────
  const generatePlan = async () => {
    setPlanLoading(true); setPlanError('')
    try {
      const res = await fetch('/api/lesson-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topics: topics.map(t => ({ topic: t.topic, description: t.description, weekNumber: t.weekNumber, isCompleted: t.isCompleted })),
          className: classId,
          subject: activeSubject ?? teacher?.subject ?? '',
          studentInterests: topInterests,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const { weeks } = await res.json()
      setPlanWeeks(weeks ?? [])
      if (!weeks?.length) setPlanError('No pending topics to plan.')
    } catch { setPlanError('Could not generate plan.') }
    finally { setPlanLoading(false) }
  }

  return (
    <div className="px-4 pt-4 pb-6">

      {/* ── Subject switcher — only when this teacher holds more than one ──── */}
      {classSubjects.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 -mx-1 px-1">
          {classSubjects.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setPickedSubject(s)}
              className="shrink-0 px-3.5 py-2 rounded-2xl text-xs font-bold active:scale-95 transition-all"
              style={s === activeSubject
                ? { background: 'var(--ink)', color: '#fff' }
                : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* ── Shared-across-grade note ──────────────────────── */}
      {gradeSectionCount > 1 && (
        <div className="rounded-2xl px-4 py-3 mb-4 flex items-start gap-3 bg-[#DCEEE1]" style={{ border: '2px solid var(--card-border)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(31,61,44,0.12)' }}>
            <Users size={15} style={{ color: 'var(--forest)' }} />
          </div>
          <p className="text-xs text-ink-soft font-medium leading-relaxed">
            This syllabus is shared across all <span className="font-bold" style={{ color: 'var(--forest)' }}>{gradeSectionCount} Grade {grade} sections</span>.
            Adding or removing topics updates every section. Ticking a topic complete only affects <span className="font-bold">this section</span>.
          </p>
        </div>
      )}

      {/* ── Progress card ─────────────────────────────────── */}
      {topics.length > 0 && (
        <div className="paper-card p-4 mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="font-bold text-ink">Syllabus Progress</span>
            <span className="text-sm font-black" style={{ color: 'var(--forest)' }}>{pct}% done</span>
          </div>
          <div className="w-full rounded-full h-3" style={{ background: 'rgba(58,44,30,0.08)' }}>
            <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'var(--forest)' }} />
          </div>
          <p className="text-xs text-ink-soft mt-2 font-medium">{completed} of {topics.length} topics completed</p>
        </div>
      )}

      {/* ── Today's Topic toggle ─────────────────────────────── */}
      {topics.length > 0 && (
        <button
          type="button"
          onClick={() => setFocusMode(f => !f)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold mb-4 active:scale-[0.98] transition-all"
          style={{
            background: focusMode ? 'var(--ink)' : 'rgba(58,44,30,0.06)',
            color: focusMode ? '#fff' : 'var(--ink-soft)',
          }}
        >
          {focusMode ? <><List size={14} /> Show All Topics</> : <><PlayCircle size={14} /> Today&apos;s Topic</>}
        </button>
      )}

      {/* ── Pacing indicator ───────────────────────────────── */}
      {pacing && pacing.status !== 'not-started' && (
        <div className={clsx(
          'rounded-2xl px-4 py-3 mb-4 flex items-start gap-3',
          pacing.status === 'behind'   && 'bg-red-50 border border-red-200',
          pacing.status === 'ahead'    && 'bg-emerald-50 border border-emerald-200',
          pacing.status === 'on-track' && 'bg-[#DCEEE1] border-2 border-[color:var(--card-border)]',
        )}>
          <div className={clsx(
            'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
            pacing.status === 'behind'   && 'bg-red-100',
            pacing.status === 'ahead'    && 'bg-emerald-100',
            pacing.status === 'on-track' && 'bg-[#1F3D2C]/15',
          )}>
            <CalendarDays size={15} className={clsx(
              pacing.status === 'behind'   && 'text-red-500',
              pacing.status === 'ahead'    && 'text-emerald-600',
              pacing.status === 'on-track' && 'text-[#1F3D2C]',
            )} />
          </div>
          <div className="flex-1">
            <p className={clsx(
              'text-sm font-bold',
              pacing.status === 'behind'   && 'text-red-800',
              pacing.status === 'ahead'    && 'text-emerald-800',
              pacing.status === 'on-track' && 'text-[#1F3D2C]',
            )}>
              Week {pacing.currentWeek} · {
                pacing.status === 'on-track' ? 'On track' :
                pacing.status === 'ahead'    ? `${pacing.weeksAhead} topic${pacing.weeksAhead !== 1 ? 's' : ''} ahead` :
                `${Math.abs(pacing.weeksAhead)} topic${Math.abs(pacing.weeksAhead) !== 1 ? 's' : ''} behind`
              }
            </p>
            <p className={clsx(
              'text-xs mt-0.5',
              pacing.status === 'behind'   && 'text-red-600',
              pacing.status === 'ahead'    && 'text-emerald-600',
              pacing.status === 'on-track' && 'text-[#2C5540]',
            )}>
              {pacing.status === 'behind'
                ? `Should be on "${pacing.expectedTopicName}" by now`
                : pacing.status === 'ahead' && pacing.actualTopicName
                ? `Last completed: "${pacing.actualTopicName}"`
                : `On schedule — ${pacing.completedCount}/${pacing.totalCount} topics done`}
            </p>
          </div>
        </div>
      )}

      {/* ── Today's Topic — one at a time, no manual picking ──── */}
      {focusMode && (
        currentTopic ? (
          <div className="paper-card p-6 text-center space-y-4 mb-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">{doneUnits} of {totalUnits} done</p>
            <div>
              <p className="font-display font-black text-xl text-ink">{currentTopic.topic}</p>
              {currentSub ? (
                <p className="text-sm font-semibold text-[#2C5540] mt-1">{currentSub.name}</p>
              ) : currentTopic.description ? (
                <p className="text-sm text-ink-soft mt-2 leading-relaxed">{currentTopic.description}</p>
              ) : null}
              {currentTopic.weekNumber != null && (
                <p className="text-xs text-ink-soft mt-2 font-medium">Week {currentTopic.weekNumber}</p>
              )}
            </div>
            <button
              type="button"
              onClick={markCurrentDone}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm active:scale-[0.98] transition-all"
              style={{ background: 'var(--ink)' }}
            >
              <CheckCircle2 size={18} /> Mark Complete
            </button>
          </div>
        ) : (
          <div className="text-center py-14 paper-card mb-4 space-y-2">
            <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
            <p className="font-semibold text-ink">All topics completed!</p>
          </div>
        )
      )}

      {!focusMode && (
      <>
      {/* ── Weekly tabs ─────────────────────────────────────── */}
      {weekTabs.length > 0 && (
        <>
          <div className="flex overflow-x-auto no-scrollbar gap-2 mb-2 -mx-1 px-1">
            {weekTabs.map(tab => {
              const isSelected = selectedWeek === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSelectedWeek(tab.key)}
                  className={clsx(
                    'shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold transition-colors',
                    tab.isCurrent ? 'bg-[#1F3D2C] text-white' : 'bg-black/[0.04] text-ink-soft opacity-60',
                    isSelected && (tab.isCurrent ? 'ring-2 ring-[#2C5540]' : 'ring-2 ring-black/20 opacity-100'),
                  )}
                >
                  {tab.label}
                  <span className={clsx('text-[10px] font-black', tab.isCurrent ? 'text-white/80' : 'text-ink-faint')}>
                    {tab.completedCount}/{tab.totalCount}
                  </span>
                </button>
              )
            })}
          </div>

          {selectedWeek != null && (
            <div className="mb-4">
              <p className="text-xs text-ink-soft font-medium">
                {weekDoneCount}/{visibleTopics.length} done this week
              </p>
            </div>
          )}
        </>
      )}

      {/* ── AI Lesson Plan ──────────────────────────────────── */}
      {topics.length > 0 && (
        <button
          type="button"
          onClick={() => { setPlanOpen(p => !p); if (!planOpen && !planWeeks.length) generatePlan() }}
          className="w-full flex items-center justify-between gap-2 bg-[#DCEEE1] rounded-2xl px-4 py-3 mb-4 active:scale-[0.98] transition-transform"
          style={{ border: '2px solid var(--card-border)' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(31,61,44,0.12)' }}>
              <Sparkles size={15} style={{ color: 'var(--forest)' }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold" style={{ color: 'var(--forest)' }}>AI Lesson Plan</p>
              <p className="text-xs text-[#2C5540]">4-week plan based on your syllabus</p>
            </div>
          </div>
          {planOpen ? <ChevronUp size={16} style={{ color: 'var(--forest)' }} /> : <ChevronDown size={16} style={{ color: 'var(--forest)' }} />}
        </button>
      )}

      {planOpen && (
        <div className="rounded-3xl p-4 mb-4 bg-[#DCEEE1]/40 space-y-3" style={{ border: '2px solid var(--card-border)' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold" style={{ color: 'var(--forest)' }}>4-Week Plan</p>
            <button type="button" onClick={generatePlan} disabled={planLoading}
              className="flex items-center gap-1 text-xs text-[#2C5540] font-semibold px-2 py-1 rounded-lg hover:bg-[#DCEEE1] transition-colors">
              <RefreshCw size={12} className={planLoading ? 'animate-spin' : ''} /> Regenerate
            </button>
          </div>
          {planLoading && [1,2,3,4].map(i => <div key={i} className="h-16 bg-[#DCEEE1] rounded-2xl animate-pulse" />)}
          {!planLoading && planError && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{planError}</p>}
          {!planLoading && planWeeks.map(w => (
            <div key={w.week} className="bg-white rounded-2xl p-4" style={{ border: '2px solid var(--card-border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 text-white rounded-full text-xs font-black flex items-center justify-center shrink-0" style={{ background: 'var(--forest)' }}>{w.week}</span>
                <p className="font-bold text-ink text-sm">{w.topics.join(', ')}</p>
              </div>
              <p className="text-xs text-[#2C5540] font-semibold mb-1">Teaching hook</p>
              <p className="text-sm text-ink-soft mb-2">{w.tip}</p>
              <p className="text-xs text-emerald-700 font-semibold mb-1">Activity</p>
              <p className="text-sm text-ink-soft">{w.activity}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────── */}
      {topics.length === 0 && (
        <div className="text-center py-14 paper-card">
          <div className="w-14 h-14 bg-[#DCEEE1] rounded-full flex items-center justify-center mx-auto mb-4" style={{ border: '2px solid var(--card-border)' }}>
            <BookOpen size={22} style={{ color: 'var(--forest)' }} />
          </div>
          <p className="font-semibold text-ink">
            No {activeSubject ? `${activeSubject} ` : ''}syllabus set up yet
          </p>
          <p className="text-sm text-ink-soft mt-1 max-w-xs mx-auto leading-relaxed">
            Your school admin sets up the syllabus for this grade{activeSubject ? ' and subject' : ''} — check back once it&apos;s ready.
          </p>
        </div>
      )}

      {/* ── Topic list ──────────────────────────────────────── */}
      <div className="space-y-2">
        {visibleTopics.map((topic) => {
          const topicSessions  = getTopicSessions(topic.id)
          const sessionCount   = topicSessions.length
          const latestDate     = topicSessions[0]?.date
          const subTopics      = syllabusSubTopics.filter(s => s.topicId === topic.id)
            .sort((a, b) => a.orderIndex - b.orderIndex)
          const doneSubTopics  = subTopics.filter(s => s.isCompleted).length
          const isExpanded     = expandedTopicId === topic.id
          const isAddingHere   = addingSubFor === topic.id

          let attendancePct: number | null = null
          if (sessionCount > 0 && students.length > 0) {
            const sessionIds = new Set(topicSessions.map(s => s.id))
            const allAtt = getClassAttendance(classId).filter(a => sessionIds.has(a.sessionId))
            const present = allAtt.filter(a => a.status !== 'absent').length
            const total   = allAtt.length
            attendancePct = total > 0 ? Math.round((present / total) * 100) : null
          }

          return (
            <div
              key={topic.id}
              className={clsx(
                'rounded-3xl p-4 transition-colors',
                topic.isCompleted ? 'bg-emerald-50/50' : 'bg-white',
              )}
              style={{ border: topic.isCompleted ? '2px solid #6ee7b7' : '2px solid var(--card-border)' }}
                         >
              {/* ── Topic header row ── */}
              <div className="flex items-start gap-3">
                {/* Status indicator */}
                <div className="shrink-0 mt-0.5">
                  {subTopics.length > 0 ? (
                    topic.isCompleted ? (
                      <CheckCircle2 size={22} className="text-emerald-500" />
                    ) : doneSubTopics > 0 ? (
                      <div className="w-[22px] h-[22px] rounded-full bg-[#DCEEE1] border-2 border-[#1F3D2C] flex items-center justify-center">
                        <span className="text-[8px] font-black text-[#1F3D2C] leading-none">{doneSubTopics}/{subTopics.length}</span>
                      </div>
                    ) : (
                      <Circle size={22} className="text-ink-faint" />
                    )
                  ) : (
                    topic.isCompleted ? (
                      <CheckCircle2 size={22} className="text-emerald-500" />
                    ) : sessionCount > 0 ? (
                      <div className="w-[22px] h-[22px] rounded-full bg-[#DCEEE1] border-2 border-[#1F3D2C] flex items-center justify-center">
                        <span className="text-[9px] font-black text-[#1F3D2C]">{sessionCount}</span>
                      </div>
                    ) : (
                      <Circle size={22} className="text-ink-faint" />
                    )
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={clsx('font-semibold text-sm', topic.isCompleted ? 'text-ink-soft line-through' : 'text-ink')}>
                    {topic.topic}
                  </p>
                  {topic.description && (
                    <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{topic.description}</p>
                  )}
                  {topic.weekNumber != null && (
                    <p className="text-xs text-ink-soft mt-0.5 font-medium">Week {topic.weekNumber}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {subTopics.length > 0 ? (
                      <span className={clsx(
                        'text-xs px-2 py-0.5 rounded-full font-semibold',
                        topic.isCompleted ? 'bg-emerald-50 text-emerald-700' : 'bg-[#DCEEE1] text-[#1F3D2C]',
                      )}>
                        {doneSubTopics}/{subTopics.length} sub-topics done
                      </span>
                    ) : sessionCount > 0 ? (
                      <span className="flex items-center gap-1 text-xs text-[#1F3D2C] bg-[#DCEEE1] px-2 py-0.5 rounded-full font-semibold">
                        <Calendar size={10} />
                        {sessionCount} session{sessionCount !== 1 ? 's' : ''}
                        {latestDate && ` · ${new Date(latestDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                      </span>
                    ) : topic.estimatedSessions ? (
                      <span className="flex items-center gap-1 text-xs text-ink-soft bg-black/[0.04] px-2 py-0.5 rounded-full font-semibold">
                        <Calendar size={10} /> ~{topic.estimatedSessions} sessions planned
                      </span>
                    ) : (
                      <span className="text-xs text-ink-soft">No sub-topics yet</span>
                    )}
                    {attendancePct !== null && (
                      <span className={clsx(
                        'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold',
                        attendancePct >= 75 ? 'bg-emerald-50 text-emerald-700'
                          : attendancePct >= 50 ? 'bg-amber-50 text-amber-700'
                          : 'bg-red-50 text-red-700',
                      )}>
                        <Users size={10} /> {attendancePct}% attendance
                      </span>
                    )}
                  </div>
                </div>

                {/* Expand sub-topics */}
                <button type="button"
                  onClick={() => setExpandedTopicId(isExpanded ? null : topic.id)}
                  className="p-2 text-ink-soft hover:text-[#2C5540] transition-colors rounded-xl shrink-0">
                  {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              </div>

              {/* ── Sub-topics panel (expanded) ── */}
              {isExpanded && (
                <div className="mt-3 ml-8 space-y-1.5">
                  {/* ── Prerequisite selector ── */}
                  <div className="flex items-center gap-2 pb-2 mb-1 border-b border-black/[0.06]">
                    <label className="text-xs font-semibold text-ink-soft shrink-0">Requires first</label>
                    <select
                      value={topic.prerequisiteDefinitionId ?? ''}
                      onChange={e => updateSyllabusTopicPrerequisite(topic.id, e.target.value || null)}
                      className="flex-1 text-xs rounded-lg px-2 py-1.5 bg-white text-ink"
                      style={{ border: '2px solid var(--card-border)' }}
                    >
                      <option value="">None</option>
                      {topics
                        .filter(t => t.definitionId && t.definitionId !== topic.definitionId)
                        .filter(t => !topic.definitionId || !createsCycle(t.definitionId!, topic.definitionId, topics))
                        .map(t => (
                          <option key={t.definitionId} value={t.definitionId}>{t.topic}</option>
                        ))}
                    </select>
                  </div>

                  {subTopics.length === 0 && !isAddingHere && (
                    <p className="text-xs text-ink-soft italic py-1">
                      No sub-topics yet. Add the specific parts/sections of this topic below.
                    </p>
                  )}

                  {subTopics.map(sub => (
                    <div key={sub.id} className="flex items-center gap-2 bg-black/[0.03] rounded-xl px-3 py-2 border border-black/10">
                      <button
                        type="button"
                        onClick={() => toggleSubTopicComplete(sub.id, !sub.isCompleted)}
                        className="shrink-0"
                      >
                        {sub.isCompleted
                          ? <CheckCircle2 size={17} className="text-emerald-500" />
                          : <Circle size={17} className="text-ink-faint" />}
                      </button>
                      <span className={clsx(
                        'flex-1 text-sm font-medium',
                        sub.isCompleted ? 'text-ink-soft line-through' : 'text-ink',
                      )}>
                        {sub.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteSubTopic(sub.id)}
                        className="p-1 text-ink-faint hover:text-red-400 transition-colors shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}

                  {/* Add sub-topic inline form */}
                  {isAddingHere ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        autoFocus
                        type="text"
                        value={newSubName}
                        onChange={e => setNewSubName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newSubName.trim()) {
                            setSavingSub(true)
                            addSubTopic(topic.id, classId, { name: newSubName.trim() })
                              .then(() => { setNewSubName(''); setAddingSubFor(null); setSavingSub(false) })
                          }
                          if (e.key === 'Escape') { setAddingSubFor(null); setNewSubName('') }
                        }}
                        placeholder="Sub-topic name (e.g. Natural Numbers)"
                        className="flex-1 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#2C5540] bg-white"
                        style={{ border: '2px solid var(--card-border)' }}
                      />
                      <button
                        type="button"
                        disabled={!newSubName.trim() || savingSub}
                        onClick={() => {
                          setSavingSub(true)
                          addSubTopic(topic.id, classId, { name: newSubName.trim() })
                            .then(() => { setNewSubName(''); setAddingSubFor(null); setSavingSub(false) })
                        }}
                        className="px-3 py-2 text-white text-xs font-bold rounded-xl disabled:opacity-40 active:scale-95 transition-all"
                        style={{ background: 'var(--forest)' }}
                      >
                        {savingSub ? '…' : 'Add'}
                      </button>
                      <button type="button" onClick={() => { setAddingSubFor(null); setNewSubName('') }}
                        className="p-2 text-ink-soft hover:text-ink rounded-xl">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingSubFor(topic.id)}
                      className="flex items-center gap-1.5 text-xs text-[#2C5540] font-semibold py-1.5 px-2 rounded-xl hover:bg-[#DCEEE1] transition-colors active:scale-95"
                    >
                      <Plus size={13} strokeWidth={2.5} /> Add sub-topic
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      </>
      )}
    </div>
  )
}
