'use client'
import { useState, useEffect } from 'react'
import { Loader2, ChevronLeft, ChevronRight, RotateCcw, ArrowLeft, Repeat } from 'lucide-react'
import { TopicPicker } from './TopicPicker'
import type { LearnSubject } from './studentLearn'

interface Card { front: string; back: string }
type Phase = 'pick' | 'loading' | 'deck'

export function FlashcardsPanel({ subjects, interests, preselect, onTopicPicked, onBack, hideSubjectHeading }: {
  subjects: LearnSubject[]; interests: string[]; preselect?: { subject: string; topic: string } | null
  onTopicPicked?: (subject: string, topic: string) => void
  onBack?: () => void
  hideSubjectHeading?: boolean
}) {
  const [phase, setPhase]   = useState<Phase>('pick')
  const [topic, setTopic]   = useState('')
  const [cards, setCards]   = useState<Card[]>([])
  const [index, setIndex]   = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function loadCards(subject: LearnSubject, t: string) {
    setTopic(t); setError(null); setPhase('loading')
    onTopicPicked?.(subject.label, t)
    try {
      const res = await fetch('/api/flashcards', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: t, subject: subject.label, grade: subject.grade, interests }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load flashcards')
      const data = await res.json()
      if (!Array.isArray(data.cards) || data.cards.length === 0) throw new Error('No flashcards returned')
      setCards(data.cards); setIndex(0); setFlipped(false); setPhase('deck')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load flashcards. Please try again.')
      setPhase('pick')
    }
  }

  function go(delta: number) {
    setFlipped(false)
    setIndex(i => Math.min(cards.length - 1, Math.max(0, i + delta)))
  }
  function reset() { setPhase('pick'); setCards([]); setError(null); onBack?.() }

  // Auto-open when navigated here from a "Flashcards" shortcut, or when switching
  // back to this tab after picking a topic elsewhere. Guarded on the topic value
  // (not just object identity) — loadCards() calls onTopicPicked, which updates
  // the shared preselect object, so without this guard the new preselect
  // reference would re-trigger this effect and loop forever.
  useEffect(() => {
    if (!preselect) return
    if (preselect.topic === topic && phase !== 'pick') return
    const subj = subjects.find(s => s.label === preselect.subject) ?? subjects[0]
    if (subj) loadCards(subj, preselect.topic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect])

  if (phase === 'pick') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ padding: '10px 14px', borderRadius: 12, background: '#FBE3DC', border: '1.5px solid #F0A491', fontSize: 12.5, fontWeight: 600, color: '#8A3A28' }}>{error}</div>}
        <p style={{ fontSize: 13, color: '#5B6B87', lineHeight: 1.5 }}>Pick a topic to revise with flashcards. Tap a card to flip it.</p>
        <TopicPicker subjects={subjects} activeColor="#3D6CB4" onPick={loadCards} hideSubjectHeading={hideSubjectHeading} />
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 12 }}>
        <Loader2 size={28} className="animate-spin" style={{ color: '#3D6CB4' }} />
        <p style={{ fontSize: 13, fontWeight: 600, color: '#5B6B87' }}>Making flashcards for “{topic}”…</p>
      </div>
    )
  }

  const card = cards[index]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6B87', display: 'flex', alignItems: 'center', padding: 0 }}><ArrowLeft size={16} /></button>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#1E2A44', flex: 1 }}>{topic}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#3D6CB4', background: '#DCEBF8', padding: '3px 12px', borderRadius: 20 }}>{index + 1} / {cards.length}</span>
      </div>

      <button onClick={() => setFlipped(f => !f)}
        style={{ width: '100%', minHeight: 190, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 20, padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', transition: 'all .15s',
          background: flipped ? '#3D6CB4' : '#fff',
          border: flipped ? '2.5px solid transparent' : '2.5px solid #3D6CB4' }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: flipped ? 'rgba(255,255,255,.7)' : '#3D6CB4' }}>{flipped ? 'Answer' : 'Question'}</span>
        <span className="font-kid" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, color: flipped ? '#fff' : '#1E2A44' }}>{flipped ? card.back : card.front}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: flipped ? 'rgba(255,255,255,.75)' : '#94A3B8', marginTop: 4 }}>
          <Repeat size={12} /> Tap to flip
        </span>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <button onClick={() => go(-1)} disabled={index === 0}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', borderRadius: 12, border: '2px solid rgba(30,42,68,0.14)', background: '#fff', color: index === 0 ? '#C7CDD8' : '#3B4A63', fontSize: 13, fontWeight: 700, cursor: index === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
          <ChevronLeft size={15} /> Prev
        </button>
        {index + 1 >= cards.length ? (
          <button onClick={reset}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', borderRadius: 12, border: 'none', background: '#1E2A44', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <RotateCcw size={14} /> Done
          </button>
        ) : (
          <button onClick={() => go(1)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', borderRadius: 12, border: 'none', background: '#1E2A44', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Next <ChevronRight size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
