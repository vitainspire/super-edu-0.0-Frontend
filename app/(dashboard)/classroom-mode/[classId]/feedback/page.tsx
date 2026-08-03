'use client'
import { useCallback, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Check } from '@/components/ui/icons'
import { Mic, MicOff } from 'lucide-react'
import { useApp } from '@/lib/context'
import type { FeedbackAnswer } from '@/lib/types'

type QuestionKey = 'engagement' | 'comprehension' | 'pacing'

const QUESTIONS: { key: QuestionKey; text: string }[] = [
  { key: 'engagement', text: 'Did students engage with the lesson?' },
  { key: 'comprehension', text: 'Did students across all levels grasp the topic?' },
  { key: 'pacing', text: 'Was the pacing right for this class?' },
]

const OPTIONS: { value: FeedbackAnswer; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'somewhat', label: 'Somewhat' },
  { value: 'no', label: 'No' },
]

export default function ClassroomModeFeedbackPage() {
  const { classId } = useParams<{ classId: string }>()
  const router = useRouter()
  const { classes, getTaughtTopicToday, saveLessonFeedback } = useApp()

  const cls = classes.find(c => c.id === classId)
  const taught = getTaughtTopicToday(classId)

  const [answers, setAnswers] = useState<Partial<Record<QuestionKey, FeedbackAnswer>>>({})
  const [otherFeedback, setOtherFeedback] = useState('')
  const [saving, setSaving] = useState(false)

  // Dictation for the free-text field — same Web Speech API pattern as VoiceEntry.tsx,
  // just appending plain transcript instead of parsing structured data out of it.
  const [listening, setListening] = useState(false)
  const recogRef = useRef<SpeechRecognition | null>(null)

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
      setOtherFeedback(prev => (prev.trim() ? `${prev.trim()} ${text}` : text))
    }
    recog.start()
    recogRef.current = recog
  }, [])

  const stopListening = () => {
    recogRef.current?.stop()
    setListening(false)
  }

  const allAnswered = QUESTIONS.every(q => answers[q.key])

  const finish = async () => {
    if (allAnswered && taught) {
      setSaving(true)
      try {
        await saveLessonFeedback({
          classId,
          topic: taught.topic,
          subtopic: taught.subtopic,
          engagement: answers.engagement!,
          comprehension: answers.comprehension!,
          pacing: answers.pacing!,
          otherFeedback: otherFeedback.trim() || undefined,
        })
      } catch { /* best-effort — teacher shouldn't be blocked from finishing */ }
    }
    router.push('/home')
  }

  return (
    <div className="p-4 space-y-5 pb-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Quick reflection</p>
        <h1 className="font-display font-black text-xl text-ink mt-1">
          How did {cls?.name ?? 'the class'} go?
        </h1>
        {taught?.topic && (
          <p className="text-sm text-ink-soft mt-1">{taught.topic}{taught.subtopic ? ` — ${taught.subtopic}` : ''}</p>
        )}
      </div>

      <div className="space-y-3">
        {QUESTIONS.map(q => (
          <div key={q.key} className="paper-card p-4">
            <p className="text-sm font-semibold text-ink mb-3">{q.text}</p>
            <div className="flex gap-2">
              {OPTIONS.map(opt => {
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
              style={{
                background: listening ? '#FEE2E2' : 'rgba(58,44,30,0.05)',
                color: listening ? '#B91C1C' : 'var(--ink-soft)',
              }}
            >
              {listening ? <MicOff size={13} /> : <Mic size={13} />}
              {listening ? 'Stop' : 'Voice'}
            </button>
          </div>
          <textarea
            value={otherFeedback}
            onChange={e => setOtherFeedback(e.target.value)}
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
        {saving ? <span className="animate-pulse">Saving…</span> : 'Finish & Go to Home'}
      </button>

      <button type="button" onClick={() => router.push('/home')} className="w-full text-center text-xs font-semibold text-ink-faint">
        Skip for now
      </button>
    </div>
  )
}
