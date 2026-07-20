'use client'
import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, XCircle, RotateCcw, ArrowLeft } from 'lucide-react'
import { TopicPicker } from './TopicPicker'
import type { LearnSubject } from './studentLearn'

interface QuizQuestion { text: string; options: string[]; answerIndex: number; explanation?: string }
type Phase = 'pick' | 'loading' | 'active' | 'done'

export function QuizPanel({ subjects, interests, preselect, onTopicPicked, onBack, hideSubjectHeading }: {
  subjects: LearnSubject[]; interests: string[]; preselect?: { subject: string; topic: string } | null
  onTopicPicked?: (subject: string, topic: string) => void
  onBack?: () => void
  hideSubjectHeading?: boolean
}) {
  const [phase, setPhase]       = useState<Phase>('pick')
  const [topic, setTopic]       = useState('')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [current, setCurrent]   = useState(0)
  const [selected, setSelected] = useState<(number | null)[]>([])
  const [score, setScore]       = useState(0)
  const [showExpl, setShowExpl] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function startQuiz(subject: LearnSubject, t: string) {
    setTopic(t); setError(null); setPhase('loading')
    onTopicPicked?.(subject.label, t)
    try {
      const res = await fetch('/api/practice-quiz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: t, subject: subject.label, grade: subject.grade, interests }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load quiz')
      const data = await res.json()
      if (!Array.isArray(data.questions) || data.questions.length === 0) throw new Error('No questions returned')
      setQuestions(data.questions)
      setSelected(new Array(data.questions.length).fill(null))
      setCurrent(0); setScore(0); setShowExpl(false); setPhase('active')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz. Please try again.')
      setPhase('pick')
    }
  }

  function selectAnswer(oi: number) {
    if (selected[current] !== null) return
    const q = questions[current]
    const sel = [...selected]; sel[current] = oi
    setSelected(sel)
    if (oi === q.answerIndex) setScore(s => s + 1)
    setShowExpl(true)
  }

  function next() {
    if (current + 1 >= questions.length) { setPhase('done'); return }
    setCurrent(c => c + 1); setShowExpl(false)
  }

  function reset() { setPhase('pick'); setQuestions([]); setError(null); onBack?.() }

  // Auto-start when navigated here from a "Practice Quiz" shortcut, or when
  // switching back to this tab after picking a topic elsewhere. Guarded on the
  // topic value (not just object identity) — startQuiz() calls onTopicPicked,
  // which updates the shared preselect object, so without this guard the new
  // preselect reference would re-trigger this effect and loop forever.
  useEffect(() => {
    if (!preselect) return
    if (preselect.topic === topic && phase !== 'pick') return
    const subj = subjects.find(s => s.label === preselect.subject) ?? subjects[0]
    if (subj) startQuiz(subj, preselect.topic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect])

  if (phase === 'pick') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ padding: '10px 14px', borderRadius: 12, background: '#FBE3DC', border: '1.5px solid #F0A491', fontSize: 12.5, fontWeight: 600, color: '#8A3A28' }}>{error}</div>}
        <p style={{ fontSize: 13, color: '#5B6B87', lineHeight: 1.5 }}>Pick a topic to practise. We&apos;ll generate a quick 4-question quiz just for you.</p>
        <TopicPicker subjects={subjects} activeColor="#3D6CB4" onPick={startQuiz} hideSubjectHeading={hideSubjectHeading} />
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 12 }}>
        <Loader2 size={28} className="animate-spin" style={{ color: '#3D6CB4' }} />
        <p style={{ fontSize: 13, fontWeight: 600, color: '#5B6B87' }}>Building your quiz on “{topic}”…</p>
      </div>
    )
  }

  if (phase === 'done') {
    const pct = Math.round((score / questions.length) * 100)
    const color = pct >= 70 ? '#059669' : pct >= 40 ? '#f97316' : '#dc2626'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 8 }}>
        <p style={{ fontSize: 40, fontWeight: 900, color, lineHeight: 1 }}>{score}<span style={{ fontSize: 18, color: '#A6AEC2' }}>/{questions.length}</span></p>
        <p style={{ fontSize: 14, fontWeight: 800, color: '#1E2A44' }}>{pct >= 70 ? 'Great work!' : pct >= 40 ? 'Good effort — keep practising!' : 'Keep going, you’ll get there!'}</p>
        <p style={{ fontSize: 12.5, color: '#5B6B87' }}>{topic}</p>
        <button onClick={reset} style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 12, background: '#3D6CB4', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <RotateCcw size={14} /> Practise another topic
        </button>
      </div>
    )
  }

  // active
  const q = questions[current]
  const picked = selected[current]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6B87', display: 'flex', alignItems: 'center', padding: 0 }}><ArrowLeft size={16} /></button>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#1E2A44', flex: 1 }}>{topic}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3D6CB4', background: '#DCEBF8', padding: '3px 12px', borderRadius: 20 }}>{current + 1} / {questions.length}</span>
      </div>

      <p style={{ fontSize: 15, fontWeight: 700, color: '#1E2A44', lineHeight: 1.5, marginBottom: 14 }}>{q.text}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.options.map((opt, oi) => {
          const isCorrect = oi === q.answerIndex
          const isPicked  = picked === oi
          let bg = '#FFFFFF', border = 'rgba(30,42,68,0.14)', color = '#3B4A63'
          if (picked !== null) {
            if (isCorrect) { bg = '#DFF0DA'; border = '#AAD6A0'; color = '#234A1D' }
            else if (isPicked) { bg = '#FBE3DC'; border = '#F0A491'; color = '#8A3A28' }
          }
          return (
            <button key={oi} onClick={() => selectAnswer(oi)} disabled={picked !== null}
              style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '12px 14px', borderRadius: 12, background: bg, border: `2px solid ${border}`, color, fontSize: 13.5, fontWeight: 600, cursor: picked === null ? 'pointer' : 'default', fontFamily: 'inherit' }}>
              <span style={{ flex: 1 }}>{opt}</span>
              {picked !== null && isCorrect && <CheckCircle2 size={16} style={{ color: '#5C8F52', flexShrink: 0 }} />}
              {picked !== null && isPicked && !isCorrect && <XCircle size={16} style={{ color: '#C46B54', flexShrink: 0 }} />}
            </button>
          )
        })}
      </div>

      {showExpl && q.explanation && (
        <div style={{ marginTop: 12, padding: '11px 14px', borderRadius: 12, background: 'rgba(30,42,68,0.05)', fontSize: 12.5, color: '#3B4A63', lineHeight: 1.5 }}>
          {q.explanation}
        </div>
      )}

      {picked !== null && (
        <button onClick={next}
          style={{ marginTop: 16, width: '100%', padding: '12px 0', borderRadius: 12, background: '#1E2A44', border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          {current + 1 >= questions.length ? 'See results' : 'Next question'}
        </button>
      )}
    </div>
  )
}
