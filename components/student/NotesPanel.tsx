'use client'
import { useState, useEffect } from 'react'
import { Loader2, ArrowLeft, Sparkles, Maximize2, X } from 'lucide-react'
import { TopicPicker } from './TopicPicker'
import type { LearnSubject } from './studentLearn'

interface Section {
  heading: string
  body?: string
  bullets?: string[]
}
interface Notes {
  sections: Section[]
  image?: { url: string; caption: string } | null
}
type Phase = 'pick' | 'loading' | 'ready'

export function NotesPanel({ subjects, interests, preselect, onTopicPicked, onBack, hideSubjectHeading }: {
  subjects: LearnSubject[]
  interests: string[]
  preselect?: { subject: string; topic: string } | null
  onTopicPicked?: (subject: string, topic: string) => void
  onBack?: () => void
  hideSubjectHeading?: boolean
}) {
  const [phase, setPhase] = useState<Phase>('pick')
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState<Notes | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)

  async function load(subject: LearnSubject, t: string) {
    setTopic(t); setError(null); setPhase('loading')
    onTopicPicked?.(subject.label, t)
    try {
      const res = await fetch('/api/test-prep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: t, subject: subject.label, grade: subject.grade, interests }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load notes')
      setNotes(await res.json()); setPhase('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes. Please try again.')
      setPhase('pick')
    }
  }

  // Auto-open a topic when navigated here from "AI Notes" on the Home screen, or
  // when switching back to this tab after picking a topic in Flashcards/Quiz.
  // Guarded on the topic value (not just object identity) — load() itself calls
  // onTopicPicked, which updates the shared preselect object, so without this
  // guard the resulting new preselect reference would re-trigger this effect
  // and loop forever re-fetching the same topic.
  useEffect(() => {
    if (!preselect) return
    if (preselect.topic === topic && phase !== 'pick') return
    const subj = subjects.find(s => s.label === preselect.subject) ?? subjects[0]
    if (subj) load(subj, preselect.topic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect])

  if (phase === 'pick') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ padding: '10px 14px', borderRadius: 12, background: '#FBE3DC', border: '1.5px solid #F0A491', fontSize: 12.5, fontWeight: 600, color: '#8A3A28' }}>{error}</div>}
        <p style={{ fontSize: 13, color: '#5B6B87', lineHeight: 1.5 }}>Pick a topic and we&apos;ll write clear summary notes for you.</p>
        <TopicPicker subjects={subjects} activeColor="#3D6CB4" onPick={load} hideSubjectHeading={hideSubjectHeading} />
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 12 }}>
        <Loader2 size={28} className="animate-spin" style={{ color: '#3D6CB4' }} />
        <p style={{ fontSize: 13, fontWeight: 600, color: '#5B6B87' }}>Writing notes on “{topic}”…</p>
      </div>
    )
  }

  const sections = notes?.sections ?? []
  // Float the diagram beside the first bullet-style section (falls back to the first section).
  const imageSectionIndex = notes?.image
    ? (() => { const i = sections.findIndex(s => (s.bullets?.length ?? 0) > 0); return i !== -1 ? i : 0 })()
    : -1

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => { setPhase('pick'); setNotes(null); onBack?.() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6B87', display: 'flex', alignItems: 'center', padding: 0 }}><ArrowLeft size={16} /></button>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#1E2A44', flex: 1 }}>{topic}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#3D6CB4', background: '#DCEBF8', padding: '4px 10px', borderRadius: 20 }}><Sparkles size={11} /> AI Notes</span>
      </div>

      <p className="font-kid" style={{ fontSize: 19, fontWeight: 600, color: '#1E2A44', letterSpacing: '-.3px', marginBottom: 16 }}>Summary Notes</p>

      {sections.map((sec, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginBottom: 8 }}>{sec.heading}</p>

          {i === imageSectionIndex && notes?.image && (
            <figure style={{ float: 'right', width: 300, maxWidth: '60%', margin: '0 0 14px 18px', borderRadius: 16, overflow: 'hidden', background: '#fff', border: '1.5px solid rgba(30,42,68,0.14)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={notes.image.url} alt={notes.image.caption} style={{ display: 'block', width: '100%', maxHeight: 360, objectFit: 'contain', background: '#fff' }} />
              <figcaption style={{ fontSize: 10.5, fontWeight: 600, color: '#5B6B87', padding: '7px 8px 0', textAlign: 'center' }}>{notes.image.caption}</figcaption>
              <button onClick={() => setViewerOpen(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: 'calc(100% - 16px)', margin: '8px', padding: '6px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: '#3D6CB4', background: '#DCEBF8' }}>
                <Maximize2 size={11} /> View Diagram
              </button>
            </figure>
          )}

          {sec.body && (
            <p style={{ fontSize: 14, color: '#3B4A63', lineHeight: 1.65 }}>{sec.body}</p>
          )}

          {sec.bullets && sec.bullets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sec.bullets.map((b, bi) => (
                <div key={bi} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3D6CB4', flexShrink: 0, marginTop: 7 }} />
                  <p style={{ fontSize: 14, color: '#1E2A44', fontWeight: 600, lineHeight: 1.5 }}>{b}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ clear: 'both' }} />

      {viewerOpen && notes?.image && (
        <div onClick={() => setViewerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(30,42,68,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1.5px solid rgba(30,42,68,0.14)', borderRadius: 18, overflow: 'hidden', maxWidth: 480, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1.5px solid rgba(30,42,68,0.1)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1E2A44' }}>{notes.image.caption}</span>
              <button onClick={() => setViewerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6B87', display: 'flex', padding: 0 }}><X size={18} /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={notes.image.url} alt={notes.image.caption} style={{ display: 'block', width: '100%', maxHeight: '70vh', objectFit: 'contain', background: '#fff' }} />
          </div>
        </div>
      )}
    </div>
  )
}
