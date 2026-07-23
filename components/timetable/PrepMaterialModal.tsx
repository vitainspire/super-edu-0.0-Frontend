'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import Modal from '@/components/ui/Modal'
import { Sparkles, RotateCcw, AlertCircle, ClipboardList, Wand2 } from 'lucide-react'
import type { SmartLesson, AcademicEvent } from '@/lib/types'
import { isTeachingProfileComplete } from '@/lib/logic/teaching-profile'
import { getCurrentWeek } from '@/lib/logic/pacing'
import PrepSheetView from './PrepSheetView'

interface PrepMaterialModalProps {
  open: boolean
  onClose: () => void
  classId: string
  subject: string
  grade: string
  initialTopic?: string   // defaults the topic selection instead of "this week's first incomplete"
  autoGenerate?: boolean  // fire generation immediately once topic/subtopic settle
}

type GenState = 'idle' | 'loading' | 'done' | 'error'

export default function PrepMaterialModal({ open, onClose, classId, subject, grade, initialTopic, autoGenerate }: PrepMaterialModalProps) {
  const router = useRouter()
  const {
    teacher, getClassSyllabus, getTopicSubTopics, getPrepMaterial, savePrepMaterial, saveTaughtTopic,
    toggleSubTopicComplete, toggleTopicComplete,
  } = useApp()

  const [topic, setTopic] = useState('')
  const [topicMode, setTopicMode] = useState<'dropdown' | 'custom'>('dropdown')
  const [subtopic, setSubtopic] = useState('')
  const [subMode, setSubMode] = useState<'dropdown' | 'custom'>('dropdown')
  const [contextNote, setContextNote] = useState('')   // ephemeral "anything for today?" hint, not persisted
  const [state, setState] = useState<GenState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [lesson, setLesson] = useState<SmartLesson | null>(null)
  const [fromCache, setFromCache] = useState(false)
  // Whether the topic/subtopic/context picker is shown. Hidden once a result
  // is on screen so the prep sheet reads cleanly — the corner button on the
  // result card brings it back to let the teacher choose a different topic.
  const [formVisible, setFormVisible] = useState(!autoGenerate)
  const autoFiredRef = useRef<string | null>(null)

  // The admin's published "Academic Year" calendar entry — same source the
  // syllabus tab uses — so "this week's topics" means the same thing everywhere.
  const [academicEvents, setAcademicEvents] = useState<AcademicEvent[]>([])
  useEffect(() => {
    fetch('/api/teacher/academic-calendar')
      .then(r => r.json())
      .then(d => setAcademicEvents(d.events ?? []))
      .catch(() => {})
  }, [])
  const academicYearStart = academicEvents.find(e => e.category === 'term' && e.title === 'Academic Year')?.startDate
  const currentWeek = getCurrentWeek(academicYearStart)

  // Reset topic/subtopic whenever a different class's modal is opened.
  // Defaults to this week's first incomplete topic (falling back to the
  // syllabus-wide first incomplete topic if there's no week data), unless an
  // explicit initialTopic was passed in — plus that topic's own first
  // incomplete subtopic, if it has any.
  useEffect(() => {
    if (!open || !classId) return
    const syllabus = getClassSyllabus(classId)
    const weekTopics = currentWeek != null ? syllabus.filter(t => t.weekNumber === currentWeek) : []
    const next = initialTopic
      ?? weekTopics.find(t => !t.isCompleted)?.topic
      ?? syllabus.find(t => !t.isCompleted)?.topic
      ?? ''
    const nextEntry = syllabus.find(t => t.topic === next)
    const nextSub = nextEntry ? getTopicSubTopics(nextEntry.id).find(s => !s.isCompleted)?.name ?? '' : ''
    setTopic(next)
    setTopicMode('dropdown')
    setSubtopic(nextSub)
    setSubMode('dropdown')
    setContextNote('')
    setState('idle')
    setErrorMsg('')
    setLesson(null)
    setFormVisible(!autoGenerate)
    autoFiredRef.current = null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId, initialTopic])

  // Whenever the topic/subtopic selection settles, check for saved prep material
  useEffect(() => {
    if (!open || !classId || !topic.trim()) return
    const cached = getPrepMaterial(classId, topic, subtopic)
    if (cached) {
      setLesson(cached.lesson)
      setFromCache(true)
      setState('done')
      setFormVisible(false)
    } else {
      setLesson(null)
      setFromCache(false)
      setState('idle')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId, topic, subtopic])

  // Fire generation immediately once topic/subtopic settle, instead of waiting
  // for a manual click — used for the one-click "generate this week" flow.
  // Gated by a ref (not `state`) because the cache-check effect above sets
  // `state` for the *next* render, so this effect would still see the stale
  // value if it checked `state` in the same commit. generate() re-checks the
  // cache itself, so a redundant call here is harmless.
  useEffect(() => {
    if (!open || !autoGenerate || !topic.trim()) return
    const key = `${topic}|${subtopic}`
    if (autoFiredRef.current === key) return
    autoFiredRef.current = key
    void generate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoGenerate, topic, subtopic])

  // Recording that this topic/subtopic was covered today happens the moment
  // prep material becomes available — whether freshly generated or loaded from cache.
  // The same moment also checks it off the syllabus: the subtopic if one was
  // generated for, or the topic itself if that topic has no subtopics at all.
  useEffect(() => {
    if (!open || !classId || !lesson || !topic.trim()) return
    saveTaughtTopic({ classId, topic: topic.trim(), subtopic: subtopic.trim() || undefined }).catch(() => {})

    const entry = getClassSyllabus(classId).find(t => t.topic === topic)
    if (!entry) return
    const trimmedSub = subtopic.trim()
    const entrySubs = getTopicSubTopics(entry.id)
    if (trimmedSub) {
      const sub = entrySubs.find(s => s.name === trimmedSub)
      if (sub && !sub.isCompleted) void toggleSubTopicComplete(sub.id, true)
    } else if (entrySubs.length === 0 && !entry.isCompleted) {
      void toggleTopicComplete(entry.id, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson])

  const syllabus = getClassSyllabus(classId)
  const incomplete = syllabus.filter(t => !t.isCompleted)
  const completed = syllabus.filter(t => t.isCompleted)
  const hasSyllabus = syllabus.length > 0
  const isCustomTopic = topicMode === 'custom'

  const topicEntry = syllabus.find(t => t.topic === topic)
  const subs = topicEntry ? getTopicSubTopics(topicEntry.id) : []
  const isCustomSub = subMode === 'custom'
  const hasProfile = isTeachingProfileComplete(teacher?.teachingProfile)

  function pickTopic(val: string) {
    if (val === '__custom__') {
      setTopicMode('custom')
      setTopic('')
    } else {
      setTopicMode('dropdown')
      setTopic(val)
    }
    setSubtopic('')
    setSubMode('dropdown')
  }

  async function generate(force = false) {
    if (!topic.trim() || !classId) return
    if (!force) {
      const cached = getPrepMaterial(classId, topic, subtopic)
      if (cached) {
        setLesson(cached.lesson)
        setFromCache(true)
        setState('done')
        setFormVisible(false)
        return
      }
    }
    setState('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/smart-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          topic: topic.trim(),
          subtopic: subtopic.trim() || undefined,
          subject,
          grade,
          teacherId: teacher?.id ?? '',
          topicDefinitionId: topicEntry?.definitionId,
          contextNote: contextNote.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || `Server returned ${res.status}`)
      }
      const data = await res.json() as { lesson: SmartLesson }
      const saved = await savePrepMaterial({
        classId, subject, grade,
        topic: topic.trim(),
        subtopic: subtopic.trim() || undefined,
        lesson: data.lesson,
      })
      setLesson(saved.lesson)
      setFromCache(false)
      setState('done')
      setFormVisible(false)
    } catch (err) {
      console.error('[PrepMaterialModal] generate failed:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate. Try again.')
      setState('error')
      setFormVisible(true)
    }
  }

  const isLoading = state === 'loading'
  const isDone = state === 'done' && lesson

  return (
    <Modal open={open} onClose={onClose} title="Prep Material">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-ink-soft font-medium">
          <ClipboardList size={14} style={{ color: '#31215C' }} className="shrink-0" />
          <span>{subject}{grade ? ` · Grade ${grade}` : ''}</span>
        </div>

        {/* Teaching Profile nudge — only shown until the teacher sets it up once */}
        {formVisible && !hasProfile && (
          <button
            type="button"
            onClick={() => { onClose(); router.push('/profile/teaching') }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left"
            style={{ background: '#E9E1F6', border: '1px solid #C7B7E8' }}
          >
            <Wand2 size={16} style={{ color: '#31215C' }} className="shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-bold" style={{ color: '#31215C' }}>Set up your Teaching Profile</span>
              <span className="block text-[11px]" style={{ color: '#6B5D8F' }}>Unlock lessons personalized to how you teach →</span>
            </span>
          </button>
        )}

        {/* Topic selector */}
        {formVisible && (
        <>
        <div>
          <label className="text-[11px] font-bold text-ink-soft uppercase tracking-wide mb-1.5 flex items-center justify-between">
            <span>Today&apos;s Topic</span>
            {isCustomTopic && hasSyllabus && (
              <button
                type="button"
                onClick={() => pickTopic(incomplete[0]?.topic ?? completed[0]?.topic ?? '')}
                className="text-[10px] font-bold normal-case tracking-normal"
                style={{ color: '#7A5FB8' }}
              >
                ← Back to syllabus
              </button>
            )}
          </label>

          {hasSyllabus && !isCustomTopic ? (
            <div className="relative">
              <select
                value={topic}
                onChange={e => pickTopic(e.target.value)}
                className="w-full appearance-none px-4 py-2.5 pr-9 rounded-2xl text-sm font-medium text-ink focus:outline-none transition-all"
                style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.1)' }}
              >
                <option value="" disabled>— pick a topic —</option>
                {incomplete.length > 0 && (
                  <optgroup label="Pending">
                    {incomplete.map(t => <option key={t.id} value={t.topic}>{t.topic}</option>)}
                  </optgroup>
                )}
                {completed.length > 0 && (
                  <optgroup label="Completed">
                    {completed.map(t => <option key={t.id} value={t.topic}>{t.topic}</option>)}
                  </optgroup>
                )}
                <option value="__custom__">Custom topic…</option>
              </select>
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </div>
          ) : (
            <input
              autoFocus={isCustomTopic}
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="What are you teaching today?"
              className="w-full px-4 py-2.5 rounded-2xl text-sm font-medium text-ink focus:outline-none transition-all"
              style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.1)' }}
            />
          )}

          {!topic && !hasSyllabus && (
            <p className="text-[11px] font-medium mt-1 ml-1" style={{ color: '#8A6A1E' }}>
              No syllabus added yet — type a topic above
            </p>
          )}
        </div>

        {/* Subtopic selector */}
        <div>
          <label className="text-[11px] font-bold text-ink-soft uppercase tracking-wide mb-1.5 flex items-center justify-between">
            <span>Subtopic <span className="font-medium normal-case text-ink-faint">(optional)</span></span>
            {isCustomSub && subs.length > 0 && (
              <button
                type="button"
                onClick={() => { setSubMode('dropdown'); setSubtopic('') }}
                className="text-[10px] font-bold normal-case tracking-normal"
                style={{ color: '#7A5FB8' }}
              >
                ← Back to list
              </button>
            )}
          </label>

          {subs.length > 0 && !isCustomSub ? (
            <div className="relative">
              <select
                value={subtopic}
                onChange={e => {
                  if (e.target.value === '__custom__') { setSubMode('custom'); setSubtopic('') }
                  else setSubtopic(e.target.value)
                }}
                className="w-full appearance-none px-4 py-2.5 pr-9 rounded-2xl text-sm font-medium text-ink focus:outline-none transition-all"
                style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.1)' }}
              >
                <option value="">— pick a subtopic (optional) —</option>
                {subs.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                <option value="__custom__">Custom subtopic…</option>
              </select>
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </div>
          ) : (
            <input
              autoFocus={isCustomSub}
              type="text"
              value={subtopic}
              onChange={e => setSubtopic(e.target.value)}
              placeholder={isCustomSub ? 'Type your subtopic…' : 'e.g. "line symmetry"…'}
              className="w-full px-4 py-2.5 rounded-2xl text-sm font-medium text-ink focus:outline-none transition-all"
              style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.1)' }}
            />
          )}
        </div>

        {/* Optional per-generation context — not persisted */}
        <div>
          <label className="text-[11px] font-bold text-ink-soft uppercase tracking-wide mb-1.5 block">
            Anything for today? <span className="font-medium normal-case text-ink-faint">(optional)</span>
          </label>
          <input
            type="text"
            value={contextNote}
            onChange={e => setContextNote(e.target.value)}
            placeholder="e.g. only have chalk today, class is restless, focus on confidence…"
            className="w-full px-4 py-2.5 rounded-2xl text-sm font-medium text-ink focus:outline-none transition-all"
            style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.1)' }}
          />
        </div>

        {/* Generate / regenerate button */}
        <button
          onClick={() => generate(isDone ? true : false)}
          disabled={!topic.trim() || isLoading}
          className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
          style={{ background: '#C7B7E8', color: '#31215C' }}
        >
          {isLoading ? (
            <><span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#31215C', borderTopColor: 'transparent' }} /> Generating Prep Material…</>
          ) : isDone ? (
            <><RotateCcw size={14} /> Regenerate</>
          ) : (
            <><Sparkles size={14} /> Generate Prep Material</>
          )}
        </button>

        {state === 'error' && (
          <div className="flex items-center gap-2 text-red-500 text-xs font-medium">
            <AlertCircle size={12} className="shrink-0" /> {errorMsg || 'Failed to generate. Try again.'}
          </div>
        )}
        </>
        )}

        {/* Compact status while auto-generating with the picker tucked away */}
        {!formVisible && isLoading && (
          <div className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2" style={{ background: '#C7B7E8', color: '#31215C' }}>
            <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#31215C', borderTopColor: 'transparent' }} /> Generating Prep Material…
          </div>
        )}

        {/* Result — rendered by the shared PrepSheetView (also used by the Preview modal / Classroom Mode) */}
        {isDone && lesson && (
          <PrepSheetView
            key={`${topic}-${subtopic}`}
            lesson={lesson}
            topic={topic}
            subtopic={subtopic}
            fromCache={fromCache}
            headerAction={
              <button
                type="button"
                onClick={() => setFormVisible(true)}
                aria-label="Choose a different topic"
                title="Choose a different topic"
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#C7B7E8' }}
              >
                <RotateCcw size={11} />
              </button>
            }
          />
        )}

        {classId && (
          <button
            type="button"
            onClick={() => { onClose(); router.push(`/classes/${classId}/attendance`) }}
            className="w-full py-2.5 rounded-2xl text-xs font-bold text-ink-soft transition-colors"
            style={{ border: '1.5px solid rgba(58,44,30,0.12)' }}
          >
            Take attendance for this class →
          </button>
        )}
      </div>
    </Modal>
  )
}
