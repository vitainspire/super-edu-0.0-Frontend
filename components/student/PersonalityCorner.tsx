'use client'
import { useState } from 'react'
import { Sprout, X, Loader2, AlertTriangle } from 'lucide-react'
import type { PersonalityStory } from '@/lib/types'

interface Props {
  isMobile: boolean
}

// Which closing scene the story lands on — decided by how the choices leaned
// overall, but this is never shown to the student as a score or grade.
function pickEnding(picks: ('wise' | 'regret')[]): 'wise' | 'mixed' | 'regret' {
  const wiseCount = picks.filter(p => p === 'wise').length
  if (wiseCount === picks.length) return 'wise'
  if (wiseCount === 0) return 'regret'
  return 'mixed'
}

export default function PersonalityCorner({ isMobile }: Props) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(false)
  const [trait, setTrait]     = useState('')
  const [story, setStory]     = useState<PersonalityStory | null>(null)

  // Story-walk state
  const [stepIndex, setStepIndex]   = useState(0)
  const [picks, setPicks]           = useState<('wise' | 'regret')[]>([])
  const [finished, setFinished]     = useState(false)

  async function openCorner() {
    setOpen(true)
    if (story) return
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/personality-story')
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setTrait(data.trait)
      setStory(data.story)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  function close() {
    setOpen(false)
    setStepIndex(0)
    setPicks([])
    setFinished(false)
  }

  // Picking silently advances the story — no reveal, no judgment, at any of
  // the 3 steps. The child only sees an explanation once, at the very end.
  function choose(leadsToward: 'wise' | 'regret') {
    if (!story) return
    const nextPicks = [...picks, leadsToward]
    setPicks(nextPicks)
    if (stepIndex + 1 < story.steps.length) {
      setStepIndex(stepIndex + 1)
    } else {
      setFinished(true)
    }
  }

  const currentStep = story?.steps[stepIndex]
  const endingBucket = story && finished ? pickEnding(picks) : null
  const ending = story && endingBucket ? story.endings[endingBucket] : null
  const analysis = story && endingBucket ? story.personalityAnalysis[endingBucket] : null
  const summary = story && endingBucket ? story.learningSummary[endingBucket] : null

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={openCorner}
        title="Today's Story"
        style={{
          position: 'fixed', right: 18, bottom: isMobile ? 84 : 24, zIndex: 90,
          width: 56, height: 56, borderRadius: '50%', border: '2.5px solid rgba(30,42,68,0.22)',
          background: '#3D6CB4', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 6px 16px rgba(30,42,68,0.25)',
        }}
      >
        <Sprout size={24} color="#fff" strokeWidth={2.2} />
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(30,42,68,0.55)' }}
          onClick={e => { if (e.target === e.currentTarget) close() }}
        >
          <div style={{ background: '#FFFFFF', border: '2.5px solid rgba(30,42,68,0.22)', borderRadius: 24, width: '100%', maxWidth: 480, margin: '0 16px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '2.5px solid rgba(30,42,68,0.18)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#3D6CB4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Sprout size={18} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44' }}>{story?.title ?? "Today's Story"}</p>
                {trait && <p style={{ fontSize: 11.5, color: '#5B6B87', marginTop: 2 }}>Today&apos;s value: {trait}</p>}
              </div>
              <button onClick={close}
                style={{ background: 'rgba(30,42,68,0.06)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <X size={15} color="#5B6B87" />
              </button>
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0' }}>
                  <Loader2 size={26} color="#3D6CB4" className="animate-spin" />
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#5B6B87' }}>Getting today&apos;s story ready…</p>
                </div>
              )}

              {!loading && error && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0', textAlign: 'center' }}>
                  <AlertTriangle size={26} color="#dc2626" />
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#5B6B87' }}>Could not load today&apos;s story. Please try again.</p>
                  <button onClick={openCorner}
                    style={{ marginTop: 4, padding: '9px 20px', borderRadius: 12, background: '#3D6CB4', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Retry
                  </button>
                </div>
              )}

              {!loading && !error && story && !finished && currentStep && (
                <>
                  {stepIndex === 0 && story.introduction && (
                    <p style={{ fontSize: 13.5, color: '#5B6B87', lineHeight: 1.6, fontStyle: 'italic' }}>{story.introduction}</p>
                  )}
                  <p style={{ fontSize: 14, color: '#1E2A44', lineHeight: 1.6 }}>{currentStep.scene}</p>

                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 800, color: '#1E2A44', marginBottom: 10 }}>{currentStep.question}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {currentStep.options.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => choose(opt.leadsToward)}
                          style={{
                            width: '100%', textAlign: 'left', padding: '11px 14px', borderRadius: 14,
                            border: '2.5px solid rgba(30,42,68,0.22)', background: '#fff', color: '#1E2A44',
                            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                          }}
                        >
                          {opt.text}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {!loading && !error && story && finished && ending && (
                <>
                  <div style={{ padding: '16px 18px', borderRadius: 16, background: '#FFF7E6', border: '2px solid #F5DFA6' }}>
                    <p style={{ fontSize: 14, color: '#5C4A1E', lineHeight: 1.65 }}>{ending}</p>
                  </div>

                  {analysis && (
                    <div style={{ padding: '14px 18px', borderRadius: 16, background: '#F0F7EE', border: '2px solid #CDE7C4' }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: '#2F6B3F', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Why this happened</p>
                      <p style={{ fontSize: 13.5, color: '#2F4A34', lineHeight: 1.6 }}>{analysis}</p>
                    </div>
                  )}

                  {summary && (
                    <div style={{ padding: '14px 18px', borderRadius: 16, background: '#EDF2FB', border: '2px solid #C7D6F0' }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: '#2A4B8D', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>A better choice, for next time</p>
                      <p style={{ fontSize: 13.5, color: '#1E2A44', lineHeight: 1.6 }}>{summary}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '2.5px solid rgba(30,42,68,0.18)', flexShrink: 0 }}>
              <button onClick={close}
                style={{ width: '100%', padding: '12px 0', borderRadius: 14, border: 'none', background: '#1E2A44', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Done
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
