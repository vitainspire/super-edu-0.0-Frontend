'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import Modal from '@/components/ui/Modal'
import {
  Sparkles, RotateCcw, AlertCircle, CheckCircle2, Database, ClipboardList,
  Target, ListChecks, MessageCircle, AlertTriangle, LifeBuoy, ArrowUpCircle,
  ChevronLeft, ChevronRight, Wand2, Plus,
} from 'lucide-react'
import type { SmartLesson } from '@/lib/types'
import { isTeachingProfileComplete } from '@/lib/logic/teaching-profile'

interface PrepMaterialModalProps {
  open: boolean
  onClose: () => void
  classId: string
  subject: string
  grade: string
}

type GenState = 'idle' | 'loading' | 'done' | 'error'

function SectionLabel({ icon, color, text }: { icon: ReactNode; color: string; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex items-center justify-center shrink-0" style={{ width: 16, height: 16, borderRadius: 999, background: `${color}1A`, color }}>
        {icon}
      </span>
      <p style={{ fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '.1em' }}>{text}</p>
    </div>
  )
}

export default function PrepMaterialModal({ open, onClose, classId, subject, grade }: PrepMaterialModalProps) {
  const router = useRouter()
  const {
    teacher, getClassSyllabus, getTopicSubTopics, getPrepMaterial, savePrepMaterial, saveTaughtTopic,
  } = useApp()

  const [topic, setTopic] = useState('')
  const [topicMode, setTopicMode] = useState<'dropdown' | 'custom'>('dropdown')
  const [subtopic, setSubtopic] = useState('')
  const [subMode, setSubMode] = useState<'dropdown' | 'custom'>('dropdown')
  const [contextNote, setContextNote] = useState('')   // ephemeral "anything for today?" hint, not persisted
  const [state, setState] = useState<GenState>('idle')
  const [lesson, setLesson] = useState<SmartLesson | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [expandedBullet, setExpandedBullet] = useState<number | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [slideDir, setSlideDir] = useState(1)

  // Reset topic/subtopic whenever a different class's modal is opened
  useEffect(() => {
    if (!open || !classId) return
    const syllabus = getClassSyllabus(classId)
    const next = syllabus.find(t => !t.isCompleted)?.topic ?? ''
    setTopic(next)
    setTopicMode('dropdown')
    setSubtopic('')
    setSubMode('dropdown')
    setContextNote('')
    setState('idle')
    setLesson(null)
    setExpandedBullet(null)
    setSlideIndex(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId])

  // Whenever the topic/subtopic selection settles, check for saved prep material
  useEffect(() => {
    if (!open || !classId || !topic.trim()) return
    const cached = getPrepMaterial(classId, topic, subtopic)
    if (cached) {
      setLesson(cached.lesson)
      setFromCache(true)
      setState('done')
    } else {
      setLesson(null)
      setFromCache(false)
      setState('idle')
    }
    setExpandedBullet(null)
    setSlideIndex(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId, topic, subtopic])

  // Recording that this topic/subtopic was covered today happens the moment
  // prep material becomes available — whether freshly generated or loaded from cache.
  useEffect(() => {
    if (!open || !classId || !lesson || !topic.trim()) return
    saveTaughtTopic({ classId, topic: topic.trim(), subtopic: subtopic.trim() || undefined }).catch(() => {})
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
        return
      }
    }
    setState('loading')
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
      if (!res.ok) throw new Error('bad')
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
      setExpandedBullet(null)
      setSlideIndex(0)
    } catch {
      setState('error')
    }
  }

  const isLoading = state === 'loading'
  const isDone = state === 'done' && lesson

  const SLIDES = [
    { key: 'overview', label: '1 · Overview', color: '#31215C' },
    { key: 'concept', label: '2 · Concept', color: '#1E3A55' },
    { key: 'flow', label: '3 · Flow', color: '#8A6A1E' },
    { key: 'support', label: '4 · Support', color: '#234A1D' },
  ] as const

  function goSlide(i: number) {
    setSlideDir(i > slideIndex ? 1 : -1)
    setSlideIndex(Math.max(0, Math.min(SLIDES.length - 1, i)))
  }

  return (
    <Modal open={open} onClose={onClose} title="Prep Material">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-ink-soft font-medium">
          <ClipboardList size={14} style={{ color: '#31215C' }} className="shrink-0" />
          <span>{subject}{grade ? ` · Grade ${grade}` : ''}</span>
        </div>

        {/* Teaching Profile nudge — only shown until the teacher sets it up once */}
        {!hasProfile && (
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
            <AlertCircle size={12} /> Failed to generate. Try again.
          </div>
        )}

        {/* Result — a paginated slider, one part of the prep sheet per slide */}
        {isDone && lesson && (
          <div className="rounded-3xl overflow-hidden -mx-1" style={{ border: '1.5px solid rgba(58,44,30,0.08)' }}>
            <style>{`
              @keyframes prepSlideR { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
              @keyframes prepSlideL { from { transform: translateX(-24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
            `}</style>

            {/* Doc header */}
            <div style={{ background: 'var(--ink)', padding: '16px 20px' }}>
              <div className="flex items-center justify-between">
                <p style={{ fontSize: 10, fontWeight: 800, color: '#C7B7E8', textTransform: 'uppercase', letterSpacing: '.12em' }}>
                  Prep Sheet
                </p>
                {fromCache && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: '#AAD6A0', background: 'rgba(170,214,160,.15)' }}>
                    <Database size={10} /> Saved
                  </span>
                )}
              </div>
              <p style={{ fontSize: 17, fontWeight: 900, color: '#fff', lineHeight: 1.2, marginTop: 2 }}>
                {topic}{subtopic ? ` — ${subtopic}` : ''}
              </p>
            </div>

            {/* Slide viewport — one part at a time */}
            <div
              key={slideIndex}
              style={{
                background: '#fff', padding: '18px 20px', minHeight: 260,
                animation: `${slideDir >= 0 ? 'prepSlideR' : 'prepSlideL'} .28s ease`,
                display: 'flex', flexDirection: 'column', gap: 18,
              }}
            >
              <p style={{ fontSize: 10, fontWeight: 800, color: SLIDES[slideIndex].color, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                {SLIDES[slideIndex].label}
              </p>

              {SLIDES[slideIndex].key === 'overview' && (
                <>
                  <section>
                    <SectionLabel icon={<Target size={11} />} color="#31215C" text="Today's Goal" />
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.5, marginTop: 6 }}>{lesson.goal}</p>
                  </section>

                  {lesson.materials?.length > 0 && (
                    <section>
                      <SectionLabel icon={<ListChecks size={11} />} color="#1E3A55" text="Materials" />
                      <div className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
                        {lesson.materials.map((m, i) => (
                          <span key={i} className="flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-full" style={{ color: '#1E3A55', background: 'rgba(30,58,85,0.08)' }}>
                            <CheckCircle2 size={10} /> {m}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}

              {SLIDES[slideIndex].key === 'concept' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lesson.concept.map((bullet, i) => {
                    const hasDetail = bullet.deeperExplanation || bullet.misconception || bullet.realLifeExample || bullet.visualDemo
                    const expanded = expandedBullet === i
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ width: 5, height: 5, borderRadius: 999, background: '#7A5FB8', marginTop: 7, flexShrink: 0 }} />
                          <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6, flex: 1 }}>{bullet.text}</p>
                          <button
                            type="button"
                            onClick={() => hasDetail && setExpandedBullet(expanded ? null : i)}
                            disabled={!hasDetail}
                            aria-label={expanded ? 'Collapse' : 'Expand'}
                            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-transform disabled:opacity-30"
                            style={{
                              background: expanded ? '#7A5FB8' : 'rgba(122,95,184,0.12)',
                              color: expanded ? '#fff' : '#7A5FB8',
                              transform: expanded ? 'rotate(45deg)' : 'none',
                            }}
                          >
                            <Plus size={12} strokeWidth={3} />
                          </button>
                        </div>
                        {expanded && hasDetail && (
                          <div style={{ marginLeft: 13, marginTop: 6, padding: '10px 12px', borderRadius: 10, background: 'rgba(58,44,30,0.03)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {bullet.image?.url && (
                              <div style={{ marginBottom: 2 }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={bullet.image.url}
                                  alt="Board reference sketch"
                                  style={{ width: '100%', maxWidth: 260, borderRadius: 8, border: '1px solid rgba(58,44,30,0.15)', background: '#fff', display: 'block' }}
                                />
                                <p style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 4, fontWeight: 600 }}>Reference — copy this onto the board</p>
                              </div>
                            )}
                            {bullet.deeperExplanation && (
                              <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}><b style={{ color: 'var(--ink)' }}>Deeper: </b>{bullet.deeperExplanation}</p>
                            )}
                            {bullet.misconception && (
                              <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}><b style={{ color: '#8A6A1E' }}>Watch for: </b>{bullet.misconception}</p>
                            )}
                            {bullet.realLifeExample && (
                              <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}><b style={{ color: '#234A1D' }}>Example: </b>{bullet.realLifeExample}</p>
                            )}
                            {bullet.visualDemo && (
                              <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}><b style={{ color: '#1E3A55' }}>Show: </b>{bullet.visualDemo}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Flow — the actual minute-by-minute plan, stage names/count vary per lesson */}
              {SLIDES[slideIndex].key === 'flow' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {lesson.flow.map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span className="flex items-center justify-center shrink-0" style={{ width: 20, height: 20, borderRadius: 999, background: 'rgba(138,106,30,0.12)', color: '#8A6A1E', fontSize: 10, fontWeight: 800, marginTop: 1 }}>
                        {i + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#8A6A1E' }}>
                          {step.label}{step.minutes ? <span style={{ fontWeight: 600, color: 'var(--ink-faint)' }}> · {step.minutes} min</span> : null}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, marginTop: 2 }}>{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {SLIDES[slideIndex].key === 'support' && (
                <>
                  {/* Talking Points — wonder-aloud moments, not a quiz round */}
                  {lesson.talkingPoints?.length > 0 && (
                    <section>
                      <SectionLabel icon={<MessageCircle size={11} />} color="#5B87AD" text="Talking Points" />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                        {lesson.talkingPoints.map((tp, i) => (
                          <div key={i}>
                            <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>&ldquo;{tp.say}&rdquo;</p>
                            {tp.keepGoing && (
                              <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5, marginTop: 2 }}>
                                <b style={{ color: '#5B87AD' }}>Keep it going: </b>{tp.keepGoing}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Watch Out */}
                  {lesson.watchFor && (
                    <section className="flex items-start gap-2">
                      <AlertTriangle size={14} style={{ color: '#8A6A1E', flexShrink: 0, marginTop: 2 }} />
                      <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                        <b style={{ color: '#8A6A1E' }}>Watch out: </b>{lesson.watchFor}
                      </p>
                    </section>
                  )}

                  {/* Differentiation */}
                  {lesson.differentiation && (lesson.differentiation.ifStruggling || lesson.differentiation.ifAhead) && (
                    <section style={{ paddingTop: 14, borderTop: '1px dashed rgba(58,44,30,0.15)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {lesson.differentiation.ifStruggling && (
                        <div className="flex items-start gap-2">
                          <LifeBuoy size={13} style={{ color: '#234A1D', flexShrink: 0, marginTop: 1 }} />
                          <p style={{ fontSize: 12.5, color: '#234A1D', lineHeight: 1.6 }}>
                            <b>If they&apos;re stuck: </b><span style={{ color: 'var(--ink-soft)' }}>{lesson.differentiation.ifStruggling}</span>
                          </p>
                        </div>
                      )}
                      {lesson.differentiation.ifAhead && (
                        <div className="flex items-start gap-2">
                          <ArrowUpCircle size={13} style={{ color: '#5C8F52', flexShrink: 0, marginTop: 1 }} />
                          <p style={{ fontSize: 12.5, color: '#5C8F52', lineHeight: 1.6 }}>
                            <b>Extension: </b><span style={{ color: 'var(--ink-soft)' }}>{lesson.differentiation.ifAhead}</span>
                          </p>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>

            {/* Slide navigation */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(58,44,30,0.08)' }}>
              <button
                type="button"
                onClick={() => goSlide(slideIndex - 1)}
                disabled={slideIndex === 0}
                className="w-9 h-9 flex items-center justify-center rounded-full text-ink-soft disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-1.5">
                {SLIDES.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => goSlide(i)}
                    aria-label={`Go to ${s.label}`}
                    style={{
                      width: i === slideIndex ? 18 : 6, height: 6, borderRadius: 999,
                      background: i === slideIndex ? 'var(--ink)' : 'rgba(58,44,30,0.15)',
                      transition: 'all .15s',
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => goSlide(slideIndex + 1)}
                disabled={slideIndex === SLIDES.length - 1}
                className="w-9 h-9 flex items-center justify-center rounded-full text-ink-soft disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
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
