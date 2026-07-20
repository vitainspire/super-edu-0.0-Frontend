'use client'
import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, RotateCcw, ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { TopicPicker } from './TopicPicker'
import type { LearnSubject } from './studentLearn'

interface Question { text: string; options: string[]; answerIndex: number; explanation?: string }
type Tier = 'easy' | 'medium' | 'hard'
type Pool = Record<Tier, Question[]>
type Phase = 'pick' | 'loading' | 'active' | 'done'

const TOTAL_QUESTIONS = 6
const STREAK_TO_SHIFT = 2

const TIER_LABEL: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const TIER_COLOR: Record<Tier, string> = { easy: '#059669', medium: '#D97706', hard: '#dc2626' }

// Given the current tier, which tier to try first when picking the next
// question (an exhausted tier falls through to the next-closest one).
function tierSearchOrder(tier: Tier): Tier[] {
  if (tier === 'easy') return ['easy', 'medium', 'hard']
  if (tier === 'hard') return ['hard', 'medium', 'easy']
  return ['medium', 'easy', 'hard']
}

function pickFromPool(pool: Pool, used: Record<Tier, Set<number>>, tier: Tier): { tier: Tier; index: number; question: Question } | null {
  for (const t of tierSearchOrder(tier)) {
    const idx = pool[t].findIndex((_, i) => !used[t].has(i))
    if (idx !== -1) return { tier: t, index: idx, question: pool[t][idx] }
  }
  return null
}

export function AdaptiveQuizPanel({ subjects, interests, preselect, onTopicPicked, onBack, hideSubjectHeading }: {
  subjects: LearnSubject[]; interests: string[]; preselect?: { subject: string; topic: string } | null
  onTopicPicked?: (subject: string, topic: string) => void
  onBack?: () => void
  hideSubjectHeading?: boolean
}) {
  const [phase, setPhase] = useState<Phase>('pick')
  const [topic, setTopic] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [pool, setPool] = useState<Pool>({ easy: [], medium: [], hard: [] })
  const [used, setUsed] = useState<Record<Tier, Set<number>>>({ easy: new Set(), medium: new Set(), hard: new Set() })
  const [tier, setTier] = useState<Tier>('medium')
  const [current, setCurrent] = useState<{ tier: Tier; index: number; question: Question } | null>(null)
  const [askedCount, setAskedCount] = useState(0)
  const [correctStreak, setCorrectStreak] = useState(0)
  const [wrongStreak, setWrongStreak] = useState(0)
  const [score, setScore] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [shiftNote, setShiftNote] = useState<'up' | 'down' | null>(null)

  async function startQuiz(subject: LearnSubject, t: string) {
    setTopic(t); setError(null); setPhase('loading')
    onTopicPicked?.(subject.label, t)
    try {
      const res = await fetch('/api/adaptive-quiz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: t, subject: subject.label, grade: subject.grade, interests }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load quiz')
      const data = await res.json()
      const freshPool: Pool = { easy: data.pool?.easy ?? [], medium: data.pool?.medium ?? [], hard: data.pool?.hard ?? [] }
      if (freshPool.easy.length + freshPool.medium.length + freshPool.hard.length === 0) throw new Error('No questions returned')

      const freshUsed = { easy: new Set<number>(), medium: new Set<number>(), hard: new Set<number>() }
      const first = pickFromPool(freshPool, freshUsed, 'medium')
      if (!first) throw new Error('No questions returned')

      setPool(freshPool); setUsed(freshUsed); setTier('medium')
      setCurrent(first); setAskedCount(1); setCorrectStreak(0); setWrongStreak(0)
      setScore(0); setPicked(null); setShiftNote(null); setPhase('active')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz. Please try again.')
      setPhase('pick')
    }
  }

  function selectAnswer(oi: number) {
    if (picked !== null || !current) return
    setPicked(oi)
    const correct = oi === current.question.answerIndex
    if (correct) setScore(s => s + 1)

    const nextUsed = { ...used, [current.tier]: new Set(used[current.tier]).add(current.index) }
    setUsed(nextUsed)

    const nextCorrectStreak = correct ? correctStreak + 1 : 0
    const nextWrongStreak   = correct ? 0 : wrongStreak + 1
    setCorrectStreak(nextCorrectStreak)
    setWrongStreak(nextWrongStreak)

    let nextTier = tier
    if (nextCorrectStreak >= STREAK_TO_SHIFT && tier !== 'hard') {
      nextTier = tier === 'easy' ? 'medium' : 'hard'
      setShiftNote('up')
    } else if (nextWrongStreak >= STREAK_TO_SHIFT && tier !== 'easy') {
      nextTier = tier === 'hard' ? 'medium' : 'easy'
      setShiftNote('down')
    } else {
      setShiftNote(null)
    }
    setTier(nextTier)
  }

  function next() {
    if (!current) return
    if (askedCount >= TOTAL_QUESTIONS) { setPhase('done'); return }
    const nextQ = pickFromPool(pool, used, tier)
    if (!nextQ) { setPhase('done'); return }
    setCurrent(nextQ)
    setAskedCount(c => c + 1)
    setPicked(null)
    if (correctStreak >= STREAK_TO_SHIFT || wrongStreak >= STREAK_TO_SHIFT) {
      setCorrectStreak(0); setWrongStreak(0)
    }
  }

  function reset() { setPhase('pick'); setCurrent(null); setError(null); onBack?.() }

  if (phase === 'pick') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ padding: '10px 14px', borderRadius: 12, background: '#FBE3DC', border: '1.5px solid #F0A491', fontSize: 12.5, fontWeight: 600, color: '#8A3A28' }}>{error}</div>}
        <p style={{ fontSize: 13, color: '#5B6B87', lineHeight: 1.5 }}>Pick a topic — the questions get easier or harder as you go, matched to how you&apos;re doing.</p>
        <TopicPicker subjects={subjects} activeColor="#3D6CB4" onPick={startQuiz} hideSubjectHeading={hideSubjectHeading} />
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 12 }}>
        <Loader2 size={28} className="animate-spin" style={{ color: '#3D6CB4' }} />
        <p style={{ fontSize: 13, fontWeight: 600, color: '#5B6B87' }}>Building your adaptive quiz on “{topic}”…</p>
      </div>
    )
  }

  if (phase === 'done') {
    const pct = Math.round((score / askedCount) * 100)
    const color = pct >= 70 ? '#059669' : pct >= 40 ? '#f97316' : '#dc2626'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 8 }}>
        <p style={{ fontSize: 40, fontWeight: 900, color, lineHeight: 1 }}>{score}<span style={{ fontSize: 18, color: '#A6AEC2' }}>/{askedCount}</span></p>
        <p style={{ fontSize: 14, fontWeight: 800, color: '#1E2A44' }}>{pct >= 70 ? 'Great work!' : pct >= 40 ? 'Good effort — keep practising!' : 'Keep going, you’ll get there!'}</p>
        <p style={{ fontSize: 12.5, color: '#5B6B87' }}>{topic}</p>
        <button onClick={reset} style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 12, background: '#3D6CB4', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <RotateCcw size={14} /> Practise another topic
        </button>
      </div>
    )
  }

  // active
  if (!current) return null
  const q = current.question
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6B87', display: 'flex', alignItems: 'center', padding: 0 }}><ArrowLeft size={16} /></button>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#1E2A44', flex: 1 }}>{topic}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3D6CB4', background: '#DCEBF8', padding: '3px 12px', borderRadius: 20 }}>{askedCount} / {TOTAL_QUESTIONS}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: TIER_COLOR[current.tier], background: `${TIER_COLOR[current.tier]}18`, padding: '3px 10px', borderRadius: 20 }}>
          {TIER_LABEL[current.tier]} level
        </span>
        {shiftNote === 'up' && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#059669' }}><TrendingUp size={12} /> Leveling up</span>}
        {shiftNote === 'down' && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#dc2626' }}><TrendingDown size={12} /> Easing off</span>}
        {shiftNote === null && picked !== null && <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#A6AEC2' }}><Minus size={12} /> Steady</span>}
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

      {picked !== null && q.explanation && (
        <div style={{ marginTop: 12, padding: '11px 14px', borderRadius: 12, background: 'rgba(30,42,68,0.05)', fontSize: 12.5, color: '#3B4A63', lineHeight: 1.5 }}>
          {q.explanation}
        </div>
      )}

      {picked !== null && (
        <button onClick={next}
          style={{ marginTop: 16, width: '100%', padding: '12px 0', borderRadius: 12, background: '#1E2A44', border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          {askedCount >= TOTAL_QUESTIONS ? 'See results' : 'Next question'}
        </button>
      )}
    </div>
  )
}
