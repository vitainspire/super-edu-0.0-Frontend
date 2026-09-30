'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import { backendFetch } from '@/lib/backend'
import Modal from '@/components/ui/Modal'
import { Sparkles, RotateCcw, AlertCircle, ClipboardList, Wand2, GameController } from '@/components/ui/icons'
import type { SmartLesson, AcademicEvent } from '@/lib/types'
import { isTeachingProfileComplete } from '@/lib/logic/teaching-profile'
import { nextTopicFor, nextTopicLabel } from '@/lib/logic/nextTopic'
import { getCurrentWeek } from '@/lib/logic/pacing'
import { simulationExists } from '@/lib/simulation-url'
import PrepSheetView from './PrepSheetView'

interface PrepMaterialModalProps {
  open: boolean
  onClose: () => void
  classId: string
  subject: string
  grade: string
  initialTopic?: string   // defaults the topic selection instead of "this week's first incomplete"
  autoGenerate?: boolean  // fire generation immediately once topic/subtopic settle
  // Which timetable period this open is for (today only — the timetable page
  // only allows opening today's own entries). Lets the default-topic pick be
  // pinned per (class, subject, today, periodNumber): reopening the SAME
  // period later today shows the same topic instead of "first incomplete"
  // silently having moved on, while a genuinely different period the same
  // day still advances. Omitted entirely by callers with no period context
  // (e.g. the Ask assistant's ad-hoc "generate this topic" action).
  periodNumber?: number
}

type GenState = 'idle' | 'loading' | 'done' | 'error'

export default function PrepMaterialModal({ open, onClose, classId, subject, grade, initialTopic, autoGenerate, periodNumber }: PrepMaterialModalProps) {
  const router = useRouter()
  const {
    teacher, syllabusTopics, getClassSyllabus, getTopicSubTopics, getPrepMaterial, savePrepMaterial, saveTaughtTopic,
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
  // Simulation generation — a separate, optional step on top of the prep
  // material itself. Only ever VIEWED in Classroom Mode; this modal just
  // triggers the build and shows a small confirmation. Keyed off the saved
  // PrepMaterial's id, so it lines up 1:1 with the lesson shown above.
  const [prepMaterialId, setPrepMaterialId] = useState<string | null>(null)
  const [simState, setSimState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [simErrorMsg, setSimErrorMsg] = useState('')
  // Whether the topic/subtopic/context picker is shown. Hidden once a result
  // is on screen so the prep sheet reads cleanly — the corner button on the
  // result card brings it back to let the teacher choose a different topic.
  const [formVisible, setFormVisible] = useState(!autoGenerate)
  const autoFiredRef = useRef<string | null>(null)

  // Whether this class's grade+subject is currently in the cheap shared-batch
  // default ("opt_in" — a teacher can still personalize one topic on demand)
  // or always generates fresh per-teacher lessons ("full_personalization").
  // Read-only here — only the admin's own similarity check or explicit choice
  // ever changes this; a teacher's fetch must never trigger a recompute.
  const [generationMode, setGenerationMode] = useState<'opt_in' | 'full_personalization'>('opt_in')
  useEffect(() => {
    if (!open || !classId || !subject) return
    backendFetch(`/api/teacher/prep-materials/generation-mode?classId=${encodeURIComponent(classId)}&subject=${encodeURIComponent(subject)}`)
      .then(r => r.json())
      .then(d => setGenerationMode(d.mode === 'full_personalization' ? 'full_personalization' : 'opt_in'))
      .catch(() => setGenerationMode('opt_in'))
  }, [open, classId, subject])

  // The admin's published "Academic Year" calendar entry — same source the
  // syllabus tab uses — so "this week's topics" means the same thing everywhere.
  const [academicEvents, setAcademicEvents] = useState<AcademicEvent[]>([])
  useEffect(() => {
    backendFetch('/api/teacher/academic-calendar')
      .then(r => r.json())
      .then(d => setAcademicEvents(d.events ?? []))
      .catch(() => {})
  }, [])
  const academicYearStart = academicEvents.find(e => e.category === 'term' && e.title === 'Academic Year')?.startDate
  const currentWeek = getCurrentWeek(academicYearStart)

  // The admin's planned next topic, kept at render so the badge can say whether
  // what is on screen is the plan or the teacher's own pick.
  const planned = useMemo(
    () => (open && classId ? nextTopicFor(getClassSyllabus(classId, subject), currentWeek) : null),
    // syllabusTopics is the underlying data getClassSyllabus reads, so it is
    // what actually changes when a topic is completed or the admin reorders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, classId, subject, currentWeek, syllabusTopics],
  )
  const plannedTopic = planned && planned.reason !== 'all-done' ? planned.topic.topic : null
  const onPlan = !!plannedTopic && plannedTopic === topic.trim()

  // Reset topic/subtopic whenever a different class's modal is opened.
  // Defaults to this week's first incomplete topic (falling back to the
  // syllabus-wide first incomplete topic if there's no week data), unless an
  // explicit initialTopic was passed in — plus that topic's own first
  // incomplete subtopic, if it has any.
  useEffect(() => {
    if (!open || !classId) return
    let cancelled = false

    async function resolveDefaultTopic() {
      // Scoped to this period's subject — a class's syllabus rows cover every
      // subject it's taught, so an unscoped read defaults a Maths period to
      // whatever incomplete topic comes first, EVS included.
      const syllabus = getClassSyllabus(classId, subject)
      // One shared rule, so the schedule card and this modal cannot disagree
      // about what comes next. See lib/logic/nextTopic.
      const planned = nextTopicFor(syllabus, currentWeek)
      let next = initialTopic
        ?? (planned && planned.reason !== 'all-done' ? planned.topic.topic : undefined)
        ?? ''
      let pinnedSub: string | null = null

      // Session pin: only when this open is for a real timetable period and
      // nothing already forced a specific topic. Reopening the SAME period
      // later today should show the SAME topic even though generating it the
      // first time already marked it complete (which would otherwise make
      // "first incomplete" silently skip to the next one) — while a genuinely
      // different period the same day has no pin yet and falls through to
      // "first incomplete" above, correctly advancing.
      if (!initialTopic && periodNumber != null) {
        try {
          const todayIso = new Date().toISOString().split('T')[0]
          const params = new URLSearchParams({ classId, subject, date: todayIso, periodNumber: String(periodNumber) })
          const res = await backendFetch(`/api/teacher/prep-materials/session-topic?${params}`)
          if (res.ok) {
            const pinned = await res.json() as { topic: string | null; subtopic: string | null }
            if (pinned.topic) { next = pinned.topic; pinnedSub = pinned.subtopic ?? '' }
          }
        } catch {
          // Pinning is a nicety, not a hard requirement — fall back to the plan silently.
        }
      }
      if (cancelled) return

      const nextEntry = syllabus.find(t => t.topic === next)
      const nextSub = pinnedSub !== null
        ? pinnedSub
        : (nextEntry ? getTopicSubTopics(nextEntry.id).find(s => !s.isCompleted)?.name ?? '' : '')
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
      setPrepMaterialId(null)
      setSimState('idle')
    }

    void resolveDefaultTopic()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId, initialTopic, periodNumber])

  // Whenever the topic/subtopic selection settles, check for saved prep material
  useEffect(() => {
    if (!open || !classId || !topic.trim()) return
    const cached = getPrepMaterial(classId, topic, subtopic)
    if (cached) {
      setLesson(cached.lesson)
      setFromCache(true)
      setState('done')
      setFormVisible(false)
      setPrepMaterialId(cached.id)
    } else {
      setLesson(null)
      setFromCache(false)
      setState('idle')
      setPrepMaterialId(null)
      setSimState('idle')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId, topic, subtopic])

  // Whenever the active prep material changes, check whether a simulation was
  // already built for it, so the button reads "Regenerate" instead of
  // "Generate" and a teacher isn't left guessing whether one exists.
  useEffect(() => {
    if (!prepMaterialId || !classId) return
    let cancelled = false
    simulationExists(classId, prepMaterialId).then(exists => {
      if (!cancelled) setSimState(exists ? 'done' : 'idle')
    })
    return () => { cancelled = true }
  }, [prepMaterialId, classId])

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

    // Pin this exact session's topic (see the default-topic effect above) so
    // reopening THIS period later today reads back the same topic instead of
    // recomputing "first incomplete" against syllabus state this same effect
    // is about to advance a few lines down.
    if (periodNumber != null) {
      const todayIso = new Date().toISOString().split('T')[0]
      backendFetch('/api/teacher/prep-materials/session-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId, subject, date: todayIso, periodNumber,
          topic: topic.trim(), subtopic: subtopic.trim() || undefined,
        }),
      }).catch(() => {})
    }

    const entry = getClassSyllabus(classId, subject).find(t => t.topic === topic)
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

  const syllabus = getClassSyllabus(classId, subject)
  const incomplete = syllabus.filter(t => !t.isCompleted)
  const completed = syllabus.filter(t => t.isCompleted)
  const hasSyllabus = syllabus.length > 0
  const isCustomTopic = topicMode === 'custom'

  const topicEntry = syllabus.find(t => t.topic === topic)
  const subs = topicEntry ? getTopicSubTopics(topicEntry.id) : []
  const isCustomSub = subMode === 'custom'
  const hasProfile = isTeachingProfileComplete(teacher?.teachingProfile)
  // Whichever lesson is currently on screen — drives whether "Make this
  // mine" makes sense to offer (never for a lesson that's already personal).
  const currentSource = getPrepMaterial(classId, topic, subtopic)?.source

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

  // Fire-and-forget: this class's (grade, subject) just consumed a topic from
  // its shared stock (or fell back to a live generation) — check whether it's
  // running low on upcoming batch-generated material and top up if so.
  // Idempotent server-side; never awaited, never blocks the teacher.
  function kickEnsureStock() {
    backendFetch('/api/teacher/prep-materials/ensure-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, subject, grade, topicDefinitionId: topicEntry?.definitionId }),
    }).catch(() => {})
  }

  // asPersonal: an explicit "make this mine" request — always skips the
  // shared pool and saves the result marked as this teacher's own override,
  // which future fetches for this exact topic will prefer over the shared
  // lesson (see savePrepMaterial's dedup-by-key overwrite in context.tsx).
  async function generate(force = false, asPersonal = false) {
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

    // Full-personalization grade+subjects have no shared pool to check at
    // all — every generation goes straight to the live path below, built
    // from this specific teacher's own profile.
    const skipShared = asPersonal || generationMode === 'full_personalization'

    // The syllabus (and now the lesson content) is shared across every
    // section teaching this grade+subject — check the batch-generated stock
    // before ever falling back to a live, wait-for-it generation.
    if (!force && !skipShared) {
      try {
        const params = new URLSearchParams({ classId, subject, grade, topic: topic.trim() })
        if (subtopic.trim()) params.set('subtopic', subtopic.trim())
        if (topicEntry?.definitionId) params.set('topicDefinitionId', topicEntry.definitionId)
        const sharedRes = await backendFetch(`/api/teacher/prep-materials/shared?${params}`)
        if (sharedRes.ok) {
          const sharedData = await sharedRes.json() as { lesson: SmartLesson | null }
          if (sharedData.lesson) {
            const saved = await savePrepMaterial({
              classId, subject, grade,
              topic: topic.trim(),
              subtopic: subtopic.trim() || undefined,
              lesson: sharedData.lesson,
              source: 'shared',
            })
            setLesson(saved.lesson)
            setFromCache(true)
            setState('done')
            setFormVisible(false)
            setPrepMaterialId(saved.id)
            setSimState('idle')
            kickEnsureStock()
            return
          }
        }
      } catch (err) {
        console.error('[PrepMaterialModal] shared-stock fetch failed, falling back to live generation:', err)
      }
    }

    try {
      const res = await backendFetch('/api/smart-lesson', {
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
        source: skipShared ? 'personal' : 'live_fallback',
      })
      setLesson(saved.lesson)
      setFromCache(false)
      setState('done')
      setFormVisible(false)
      setPrepMaterialId(saved.id)
      setSimState('idle')
      kickEnsureStock()
    } catch (err) {
      console.error('[PrepMaterialModal] generate failed:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate. Try again.')
      setState('error')
      setFormVisible(true)
    }
  }

  async function generateSimulation() {
    if (!prepMaterialId || !lesson || simState === 'loading') return
    setSimState('loading')
    setSimErrorMsg('')
    try {
      const res = await backendFetch('/api/generate-simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sent directly rather than looked up server-side by prepMaterialId —
        // the Supabase save of the prep material is best-effort/fire-and-forget,
        // so requiring that row to already exist was a source of spurious
        // "not found" failures right after a fresh generation.
        body: JSON.stringify({ prepMaterialId, classId, subject, grade, topic, subtopic, lesson }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(errBody?.error || `Server returned ${res.status}`)
      }
      setSimState('done')
    } catch (err) {
      console.error('[PrepMaterialModal] generateSimulation failed:', err)
      setSimErrorMsg(err instanceof Error ? err.message : 'Failed to build. Try again.')
      setSimState('error')
    }
  }

  const isLoading = state === 'loading'
  const isDone = state === 'done' && lesson

  return (
    <Modal open={open} onClose={onClose} title="Prep Material" fullscreen>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-ink-soft font-medium min-w-0">
            <ClipboardList size={14} style={{ color: '#1F3D2C' }} className="shrink-0" />
            <span className="truncate">{subject}{grade ? ` · Grade ${grade}` : ''}</span>
          </div>
          {prepMaterialId && (
            <button
              type="button"
              onClick={generateSimulation}
              disabled={simState === 'loading'}
              title="Build a small interactive simulation for Classroom Mode"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 disabled:opacity-60 active:scale-[0.98] transition-all"
              style={{
                background: simState === 'done' ? 'rgba(31,61,44,0.08)' : 'var(--forest)',
                color: simState === 'done' ? 'var(--forest)' : '#fff',
              }}
            >
              {simState === 'loading' ? (
                <><span className="w-3 h-3 border-2 rounded-full animate-spin shrink-0" style={{ borderColor: 'currentColor', borderTopColor: 'transparent' }} /> Building…</>
              ) : simState === 'done' ? (
                <><GameController size={13} /> Regenerate Simulation</>
              ) : (
                <><GameController size={13} /> Generate Simulation</>
              )}
            </button>
          )}
        </div>

        {/* What this sheet is actually for. The header above names the subject
            and grade but never the topic, so once the picker collapses behind a
            generated sheet there was nothing on screen saying which topic it
            teaches — and a teacher scrolling a lesson should never have to
            guess. Says whether it is the planned topic or their own pick. */}
        {topic.trim() && (
          <div className="flex items-center gap-1.5 flex-wrap -mt-1">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
              style={{ background: 'rgba(31,61,44,0.08)', color: 'var(--forest)' }}
            >
              {topic.trim()}
              {subtopic.trim() && (
                <span className="font-semibold" style={{ opacity: 0.75 }}>· {subtopic.trim()}</span>
              )}
            </span>
            {onPlan && planned ? (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={planned.reason === 'overdue'
                  ? { background: 'rgba(196,107,84,0.14)', color: '#7A2E17' }
                  : { background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}
              >
                {nextTopicLabel(planned)}
              </span>
            ) : plannedTopic ? (
              // Deviating is allowed — this just keeps the plan in view rather
              // than silently letting the class drift off it.
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md truncate max-w-[180px]"
                style={{ background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}
                title={`The plan for this class is "${plannedTopic}"`}
              >
                Plan: {plannedTopic}
              </span>
            ) : null}
          </div>
        )}

        {simState === 'done' && (
          <p className="text-[11px] font-medium text-ink-faint -mt-2.5">✓ Saved — open Classroom Mode to show it to the class.</p>
        )}
        {simState === 'error' && (
          <p className="text-[11px] font-medium -mt-2.5" style={{ color: '#B0771E' }}>
            Couldn&apos;t build the simulation{simErrorMsg ? `: ${simErrorMsg}` : ' — try again.'}
          </p>
        )}

        {/* Teaching Profile nudge — only shown until the teacher sets it up once */}
        {formVisible && !hasProfile && (
          <button
            type="button"
            onClick={() => { onClose(); router.push('/profile/teaching') }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left"
            style={{ background: '#fff', border: '2px solid var(--card-border)' }}
          >
            <Wand2 size={16} style={{ color: '#1F3D2C' }} className="shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-bold" style={{ color: '#1F3D2C' }}>Set up your Teaching Profile</span>
              <span className="block text-[11px]" style={{ color: '#4A4740' }}>Unlock lessons personalized to how you teach →</span>
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
                style={{ background: '#fff', border: '2px solid var(--card-border)' }}
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
              style={{ background: '#fff', border: '2px solid var(--card-border)' }}
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
                style={{ background: '#fff', border: '2px solid var(--card-border)' }}
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
              style={{ background: '#fff', border: '2px solid var(--card-border)' }}
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
            style={{ background: '#fff', border: '2px solid var(--card-border)' }}
          />
        </div>

        {/* Generate / regenerate button */}
        <button
          onClick={() => generate(isDone ? true : false)}
          disabled={!topic.trim() || isLoading}
          className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
          style={{ background: 'var(--forest)', color: '#fff' }}
        >
          {isLoading ? (
            <><span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} /> Generating Prep Material…</>
          ) : isDone ? (
            <><RotateCcw size={14} /> Regenerate</>
          ) : (
            <><Sparkles size={14} /> Generate Prep Material</>
          )}
        </button>

        {/* Only meaningful in opt_in mode, on a lesson that's still the
            shared/generic version — in full_personalization mode every
            lesson is already this teacher's own, and once a lesson is
            already marked 'personal' there's nothing further to opt into. */}
        {isDone && generationMode === 'opt_in' && currentSource !== 'personal' && (
          <button
            onClick={() => generate(true, true)}
            disabled={isLoading}
            className="w-full py-2.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
            style={{ background: 'rgba(122,95,184,0.1)', color: '#7A5FB8' }}
            title="Generate a version built from your own Teaching Profile instead of the shared lesson"
          >
            <Wand2 size={14} /> Make this mine
          </button>
        )}

        {state === 'error' && (
          <div className="flex items-center gap-2 text-red-500 text-xs font-medium">
            <AlertCircle size={12} className="shrink-0" /> {errorMsg || 'Failed to generate. Try again.'}
          </div>
        )}
        </>
        )}

        {/* Compact status while auto-generating with the picker tucked away */}
        {!formVisible && isLoading && (
          <div className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2" style={{ background: 'var(--forest)', color: '#fff' }}>
            <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} /> Generating Prep Material…
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
                style={{ background: 'rgba(255,255,255,0.12)', color: '#A9C4A2' }}
              >
                <RotateCcw size={11} />
              </button>
            }
          />
        )}

        {/* No "Take attendance" here. Classroom Mode opens on an attendance
            step (ClassroomModeModal), so the teacher is asked for it on the way
            into the lesson regardless — and offering it from the prep sheet
            meant leaving the sheet mid-preparation to do something the next
            screen was about to ask for anyway. Attendance is still reachable
            from the class page and the timetable. */}
      </div>
    </Modal>
  )
}
