'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Flag, Sparkles, Clock, GameController, Check, ClipboardList } from '@/components/ui/icons'
import { Mic, MicOff } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useApp } from '@/lib/context'
import { isCurrentSmartLesson } from '@/lib/types'
import type { FeedbackAnswer } from '@/lib/types'
import { simulationUrl, simulationExists } from '@/lib/simulation-url'
import { blackboardImageUrl, blackboardImageExists } from '@/lib/blackboard-image-url'
import AttendanceForm from '@/components/attendance/AttendanceForm'
import PrepSheetView from './PrepSheetView'

interface ClassroomModeModalProps {
  open: boolean
  onClose: () => void
  classId: string
  subject: string
  grade: string
  endTime?: string   // this period's end time, e.g. "14:30" — drives the lesson countdown
}

type Step = 'attendance' | 'lesson' | 'feedback'

function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const FEEDBACK_QUESTIONS: { key: keyof Omit<FeedbackRecord, 'otherFeedback'>; text: string }[] = [
  { key: 'engagement', text: 'Did students engage with the lesson?' },
  { key: 'comprehension', text: 'Did students across all levels grasp the topic?' },
  { key: 'pacing', text: 'Was the pacing right for this class?' },
]
const FEEDBACK_OPTIONS: { value: FeedbackAnswer; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'somewhat', label: 'Somewhat' },
  { value: 'no', label: 'No' },
]
interface FeedbackRecord {
  engagement?: FeedbackAnswer
  comprehension?: FeedbackAnswer
  pacing?: FeedbackAnswer
  otherFeedback: string
}

// Classroom Mode as a modal, mirroring PrepMaterialModal's shape rather than a
// standalone route: attendance -> lesson -> quick reflection, all as steps
// inside one modal instead of three page navigations. The three legacy pages
// under app/(dashboard)/classroom-mode/ still exist (harmless if anything else
// links to them) but this is now the only way the app opens the flow.
export default function ClassroomModeModal({ open, onClose, classId, subject, grade, endTime }: ClassroomModeModalProps) {
  const { classes, prepMaterials, getTaughtTopicToday, getPrepMaterial, saveLessonFeedback } = useApp()

  const [step, setStep] = useState<Step>('attendance')
  useEffect(() => {
    if (open) setStep('attendance')
  }, [open, classId])

  const cls = classes.find(c => c.id === classId)
  const taught = classId ? getTaughtTopicToday(classId) : null
  const material = taught
    ? getPrepMaterial(classId, taught.topic, taught.subtopic) ??
      [...prepMaterials]
        .filter(p => p.classId === classId && p.topic.trim().toLowerCase() === taught.topic.trim().toLowerCase() && isCurrentSmartLesson(p.lesson))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
      null
    : null

  // ── Lesson step: countdown + simulation toggle (same behavior as the old
  // classroom-mode/[classId]/lesson page, just driven by props instead of
  // searchParams/useParams) ──────────────────────────────────────────────────
  const materialId = material?.id ?? null
  const [simUrl, setSimUrl] = useState<string | null>(null)
  const [boardUrl, setBoardUrl] = useState<string | null>(null)
  const [view, setView] = useState<'sheet' | 'sim' | 'board'>('sheet')
  useEffect(() => {
    if (!materialId || !classId) { setSimUrl(null); setBoardUrl(null); setView('sheet'); return }
    let cancelled = false
    simulationExists(classId, materialId).then(exists => {
      if (!cancelled) setSimUrl(exists ? simulationUrl(classId, materialId) : null)
    })
    blackboardImageExists(classId, materialId).then(exists => {
      if (!cancelled) setBoardUrl(exists ? blackboardImageUrl(classId, materialId) : null)
    })
    return () => { cancelled = true }
  }, [materialId, classId])

  const endMins = endTime ? timeToMins(endTime) : null
  const [minsLeft, setMinsLeft] = useState<number | null>(null)
  const [timeUp, setTimeUp] = useState(false)
  useEffect(() => {
    if (step !== 'lesson' || endMins == null) { setTimeUp(false); return }
    const tick = () => {
      const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
      setMinsLeft(Math.max(0, endMins - nowMins))
      if (nowMins >= endMins) setTimeUp(true)
    }
    tick()
    const interval = setInterval(tick, 15_000)
    return () => clearInterval(interval)
  }, [step, endMins])
  useEffect(() => {
    if (!timeUp) return
    const t = setTimeout(() => setStep('feedback'), 4_000)
    return () => clearTimeout(t)
  }, [timeUp])
  const countdownLabel = useMemo(() => {
    if (minsLeft == null) return null
    return minsLeft === 0 ? 'Ending now' : `${minsLeft} min left`
  }, [minsLeft])

  // ── Feedback step ───────────────────────────────────────────────────────────
  const [answers, setAnswers] = useState<FeedbackRecord>({ otherFeedback: '' })
  const [saving, setSaving] = useState(false)
  const [listening, setListening] = useState(false)
  const recogRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    if (step === 'feedback') setAnswers({ otherFeedback: '' })
  }, [step])

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const recog = new SR()
    recog.lang = 'en-IN'
    recog.continuous = false
    recog.interimResults = false
    recog.onstart = () => setListening(true)
    recog.onend = () => setListening(false)
    recog.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript
      setAnswers(prev => ({ ...prev, otherFeedback: prev.otherFeedback.trim() ? `${prev.otherFeedback.trim()} ${text}` : text }))
    }
    recog.start()
    recogRef.current = recog
  }, [])
  const stopListening = () => { recogRef.current?.stop(); setListening(false) }

  const allAnswered = FEEDBACK_QUESTIONS.every(q => answers[q.key])

  const finish = async () => {
    if (allAnswered && taught) {
      setSaving(true)
      try {
        await saveLessonFeedback({
          classId, topic: taught.topic, subtopic: taught.subtopic,
          engagement: answers.engagement!, comprehension: answers.comprehension!, pacing: answers.pacing!,
          otherFeedback: answers.otherFeedback.trim() || undefined,
        })
      } catch { /* best-effort — teacher shouldn't be blocked from finishing */ }
    }
    setSaving(false)
    onClose()
  }

  const titles: Record<Step, string> = {
    attendance: 'Take Attendance',
    lesson: 'Classroom Mode',
    feedback: 'Quick Reflection',
  }

  return (
    <Modal open={open} onClose={onClose} title={titles[step]} fullscreen>
      {step === 'attendance' && (
        <div className="-m-5">
          <AttendanceForm
            classId={classId}
            postSaveAction={{ label: 'Continue to Lesson', icon: <ArrowRight size={16} />, onClick: () => setStep('lesson') }}
          />
        </div>
      )}

      {step === 'lesson' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display font-bold text-ink truncate">{cls?.name ?? subject}{grade ? ` · Grade ${grade}` : ''}</p>
            {countdownLabel && (
              <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
                style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}>
                <Clock size={10} /> {countdownLabel}
              </span>
            )}
          </div>

          {timeUp && (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-2" style={{ background: '#EAC968', color: '#4A3809' }}>
              <Clock size={14} />
              <p className="text-xs font-bold">Class time is up — moving to feedback…</p>
            </div>
          )}

          {material ? (
            <>
              {(simUrl || boardUrl) && (
                <div className="flex items-center gap-2 p-1 rounded-2xl" style={{ background: 'rgba(58,44,30,0.06)' }}>
                  <button type="button" onClick={() => setView('sheet')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: view === 'sheet' ? '#fff' : 'transparent', color: view === 'sheet' ? 'var(--forest)' : 'var(--ink-soft)' }}>
                    <ClipboardList size={13} /> Prep Sheet
                  </button>
                  {simUrl && (
                    <button type="button" onClick={() => setView('sim')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all"
                      style={{ background: view === 'sim' ? '#fff' : 'transparent', color: view === 'sim' ? 'var(--forest)' : 'var(--ink-soft)' }}>
                      <GameController size={13} /> Simulation
                    </button>
                  )}
                  {boardUrl && (
                    <button type="button" onClick={() => setView('board')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all"
                      style={{ background: view === 'board' ? '#fff' : 'transparent', color: view === 'board' ? 'var(--forest)' : 'var(--ink-soft)' }}>
                      Blackboard
                    </button>
                  )}
                </div>
              )}

              {view === 'sim' && simUrl ? (
                <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid var(--card-border)', height: '65vh' }}>
                  <iframe src={simUrl} title="Simulation" sandbox="allow-scripts" className="w-full h-full" style={{ border: 0 }} />
                </div>
              ) : view === 'board' && boardUrl ? (
                <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid var(--card-border)', background: '#0F1810' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={boardUrl} alt="Blackboard sketch of today's example" className="w-full h-auto block" />
                </div>
              ) : (
                <PrepSheetView lesson={material.lesson} topic={material.topic} subtopic={material.subtopic} fromCache />
              )}
            </>
          ) : (
            <div className="paper-card text-center py-14 space-y-2">
              <Sparkles size={28} className="mx-auto text-ink-faint" />
              <p className="text-sm font-bold text-ink">No prep material saved for today&apos;s topic</p>
              <p className="text-xs text-ink-soft px-6">You can still teach — the feedback after class still helps plan next time.</p>
            </div>
          )}

          <button type="button"
            onClick={() => setStep('feedback')}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm active:scale-[0.98] transition-all"
            style={{ background: 'var(--ink)' }}>
            <Flag size={16} /> End Class
          </button>
        </div>
      )}

      {step === 'feedback' && (
        <div className="space-y-4">
          <div>
            <h3 className="font-display font-black text-lg text-ink">How did {cls?.name ?? 'the class'} go?</h3>
            {taught?.topic && (
              <p className="text-sm text-ink-soft mt-1">{taught.topic}{taught.subtopic ? ` — ${taught.subtopic}` : ''}</p>
            )}
          </div>

          <div className="space-y-3">
            {FEEDBACK_QUESTIONS.map(q => (
              <div key={q.key} className="paper-card p-4">
                <p className="text-sm font-semibold text-ink mb-3">{q.text}</p>
                <div className="flex gap-2">
                  {FEEDBACK_OPTIONS.map(opt => {
                    const selected = answers[q.key] === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAnswers(prev => ({ ...prev, [q.key]: opt.value }))}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                        style={{
                          background: selected ? 'var(--ink)' : 'rgba(58,44,30,0.05)',
                          color: selected ? '#fff' : 'var(--ink-soft)',
                        }}
                      >
                        {selected && <Check size={12} />} {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="paper-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-ink">Anything else? <span className="font-medium text-ink-faint">(optional)</span></p>
                <button
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0"
                  style={{ background: listening ? '#FEE2E2' : 'rgba(58,44,30,0.05)', color: listening ? '#B91C1C' : 'var(--ink-soft)' }}
                >
                  {listening ? <MicOff size={13} /> : <Mic size={13} />}
                  {listening ? 'Stop' : 'Voice'}
                </button>
              </div>
              <textarea
                value={answers.otherFeedback}
                onChange={e => setAnswers(prev => ({ ...prev, otherFeedback: e.target.value }))}
                placeholder="Type or use voice — anything else worth remembering for next time…"
                rows={3}
                className="w-full text-sm text-ink placeholder-ink-faint bg-white rounded-2xl px-3 py-2.5 border-2 resize-none focus:outline-none focus:ring-2 focus:ring-forest"
                style={{ borderColor: 'var(--card-border)' }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={finish}
            disabled={!allAnswered || saving}
            className="paper-btn-primary w-full text-base disabled:opacity-50"
          >
            {saving ? <span className="animate-pulse">Saving…</span> : 'Finish & Close'}
          </button>

          <button type="button" onClick={onClose} className="w-full text-center text-xs font-semibold text-ink-faint">
            Skip for now
          </button>
        </div>
      )}
    </Modal>
  )
}
