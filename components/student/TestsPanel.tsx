'use client'
import { useState } from 'react'
import {
  Loader2, ClipboardCheck, ChevronLeft, ChevronRight, ArrowLeft,
  BarChart3, Hourglass, AlertTriangle, Lightbulb, Maximize2, X,
} from 'lucide-react'
import { DOT_PALETTE } from './studentTheme'

export interface UpcomingTestItem {
  id: string
  topic: string
  subjectLabel: string
  grade: string
  totalMarks: number
  conductedOn: string
  whenLabel: string   // e.g. "In 3 days"
  isNew: boolean
}

// A test that already happened but hasn't been marked for this student yet —
// distinct from "upcoming" (still in the future) and "past scores" (graded).
export interface AwaitingResultItem {
  id: string
  topic: string
  subjectLabel: string
  grade: string
  totalMarks: number
  conductedOn: string
  whenLabel: string   // e.g. "2 days ago"
}

export interface PastScore {
  id: string
  topic: string
  subjectLabel: string
  score: number
  totalMarks: number
  conductedOn: string
}

interface StudyTopic {
  name: string
  summary: string
  keyPoints: string[]
  examples: string[]
  commonMistakes: string[]
  practiceQuestions: { question: string; answer: string }[]
  image?: { url: string; caption: string } | null
}

// Common shape both Upcoming Tests and Awaiting Results cards need to fetch
// and render a study guide — a plain topic/subject/grade lookup, nothing more.
interface TestLike {
  id: string
  topic: string
  subjectLabel: string
  grade: string
  totalMarks: number
}

function SectionBar({ color, tint, Icon, label }: { color: string; tint: string; Icon: typeof ClipboardCheck; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 9, borderBottom: `2px solid ${color}` }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 25, height: 25, borderRadius: 8, background: tint, flexShrink: 0 }}>
        <Icon size={13.5} color={color} strokeWidth={2.5} />
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.05em', color, textTransform: 'uppercase' }}>{label}</span>
    </div>
  )
}

export function TestsPanel({
  upcomingTests, awaitingResults, pastScores, interests,
}: {
  upcomingTests: UpcomingTestItem[]
  awaitingResults: AwaitingResultItem[]
  pastScores: PastScore[]
  interests: string[]
}) {
  const [openTest, setOpenTest]   = useState<TestLike | null>(null)
  const [guides, setGuides]       = useState<Record<string, StudyTopic[]>>({})
  const [activeTab, setActiveTab] = useState<Record<string, number>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [errorId, setErrorId]     = useState<string | null>(null)
  // Practice questions render as a flip-card deck (one question at a time),
  // keyed by `${testId}:${topicTabIndex}` so each focus area's deck resets
  // independently when you switch tabs.
  const [pqIndex, setPqIndex]     = useState<Record<string, number>>({})
  const [pqFlipped, setPqFlipped] = useState<Record<string, boolean>>({})
  const [viewerImage, setViewerImage] = useState<{ url: string; caption: string } | null>(null)

  function pqGo(key: string, delta: number, max: number) {
    setPqFlipped(prev => ({ ...prev, [key]: false }))
    setPqIndex(prev => ({ ...prev, [key]: Math.min(max - 1, Math.max(0, (prev[key] ?? 0) + delta)) }))
  }

  async function openStudyGuide(t: TestLike) {
    setOpenTest(t); setErrorId(null)
    if (guides[t.id]) return
    setLoadingId(t.id)
    try {
      const res = await fetch('/api/test-study-guide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: t.topic, subject: t.subjectLabel, grade: t.grade, totalMarks: t.totalMarks, interests }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load study guide')
      const data = await res.json() as { topics: StudyTopic[] }
      setGuides(prev => ({ ...prev, [t.id]: data.topics }))
      setActiveTab(prev => ({ ...prev, [t.id]: 0 }))
    } catch {
      setErrorId(t.id)
    } finally {
      setLoadingId(null)
    }
  }

  // ── Full-screen Study Guide ──────────────────────────────────────────────
  if (openTest) {
    const t       = openTest
    const topics  = guides[t.id]
    const tabIdx  = activeTab[t.id] ?? 0
    const topic   = topics?.[Math.min(tabIdx, topics.length - 1)]
    const pqKey   = `${t.id}:${tabIdx}`
    const pqTotal = topic?.practiceQuestions.length ?? 0
    const pqIdx   = Math.min(pqIndex[pqKey] ?? 0, Math.max(0, pqTotal - 1))
    const pq      = topic?.practiceQuestions[pqIdx]
    const pqFlip  = !!pqFlipped[pqKey]

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: '#FFFFFF', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 14px', background: '#FFFFFF' }}>
          <button onClick={() => setOpenTest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3D6CB4', display: 'flex', padding: 0 }}>
            <ArrowLeft size={22} />
          </button>
          <span className="font-kid" style={{ fontSize: 19, fontWeight: 600, color: '#3D6CB4' }}>Study Guide</span>
          <button onClick={() => setOpenTest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: '#3D6CB4', padding: 0 }}>
            Hide
          </button>
        </div>

        <div style={{ padding: '4px 20px 100px', maxWidth: 640, margin: '0 auto' }}>
          {loadingId === t.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '64px 0' }}>
              <Loader2 size={30} className="animate-spin" style={{ color: '#3D6CB4' }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#5B6B87' }}>Building your complete study guide…</span>
            </div>
          ) : errorId === t.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '64px 0', textAlign: 'center' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#dc2626' }}>Couldn&apos;t load the study guide.</span>
              <button onClick={() => openStudyGuide(t)} style={{ fontSize: 13, fontWeight: 700, color: '#3D6CB4', background: '#DCEBF8', padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Retry</button>
            </div>
          ) : topics && topic ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Focus-area tabs */}
              {topics.length > 1 && (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} className="no-scrollbar">
                  {topics.map((tp, i) => {
                    const isAct = i === tabIdx
                    return (
                      <button key={tp.name} onClick={() => setActiveTab(prev => ({ ...prev, [t.id]: i }))}
                        style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 20, border: `1.5px solid ${isAct ? '#3D6CB4' : '#D8E1EE'}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, transition: 'all .15s', background: isAct ? '#3D6CB4' : 'transparent', color: isAct ? '#fff' : '#5B6B87' }}>
                        {tp.name}
                      </button>
                    )
                  })}
                </div>
              )}

              <h1 className="font-kid" style={{ fontSize: 24, fontWeight: 600, color: '#1E2A44', lineHeight: 1.25 }}>
                {t.topic}: {topic.name}
              </h1>

              {topic.image ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
                  <figure style={{ flexShrink: 0, width: 220, maxWidth: '100%', margin: 0, borderRadius: 16, overflow: 'hidden', background: '#fff', border: '1.5px solid rgba(30,42,68,0.14)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={topic.image.url} alt={topic.image.caption} style={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'contain', background: '#fff' }} />
                    <figcaption style={{ fontSize: 10, fontWeight: 600, color: '#5B6B87', padding: '6px 7px 0', textAlign: 'center' }}>{topic.image.caption}</figcaption>
                    <button onClick={() => setViewerImage(topic.image ?? null)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: 'calc(100% - 14px)', margin: '7px', padding: '5px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700, color: '#3D6CB4', background: '#DCEBF8' }}>
                      <Maximize2 size={10} /> View
                    </button>
                  </figure>
                  {topic.summary && (
                    <p style={{ flex: 1, minWidth: 180, fontSize: 14, color: '#3B4A63', lineHeight: 1.6 }}>{topic.summary}</p>
                  )}
                </div>
              ) : topic.summary && (
                <p style={{ fontSize: 14, color: '#3B4A63', lineHeight: 1.6 }}>{topic.summary}</p>
              )}

              {topic.keyPoints.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: '#5B6B87', textTransform: 'uppercase', marginBottom: 10 }}>Key points to revise</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {topic.keyPoints.map((kp, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: DOT_PALETTE[i % DOT_PALETTE.length], flexShrink: 0, marginTop: 5 }} />
                        <p style={{ fontSize: 14.5, color: '#1E2A44', fontWeight: 600, lineHeight: 1.5 }}>{kp}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topic.examples.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: '#5B6B87', textTransform: 'uppercase', marginBottom: 10 }}>Examples</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {topic.examples.map((ex, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <Lightbulb size={15} style={{ color: '#D9A83B', flexShrink: 0, marginTop: 2 }} />
                        <p style={{ fontSize: 14, color: '#3B4A63', lineHeight: 1.55 }}>{ex}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topic.commonMistakes.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <AlertTriangle size={14} style={{ color: '#B45309' }} />
                    <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: '#B45309', textTransform: 'uppercase' }}>Watch out for</p>
                  </div>
                  <div style={{ background: '#FDECD3', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topic.commonMistakes.map((m, i) => (
                      <p key={i} style={{ fontSize: 13.5, color: '#7C4A15', lineHeight: 1.55 }}>{m}</p>
                    ))}
                  </div>
                </div>
              )}

              {pq && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: '#5B6B87', textTransform: 'uppercase' }}>Practice questions</p>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#3D6CB4', background: '#DCEBF8', padding: '2px 10px', borderRadius: 20 }}>{pqIdx + 1} / {pqTotal}</span>
                  </div>

                  <button onClick={() => setPqFlipped(prev => ({ ...prev, [pqKey]: !prev[pqKey] }))}
                    style={{ width: '100%', minHeight: 150, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 18, padding: '22px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', transition: 'all .15s',
                      background: pqFlip ? '#3D6CB4' : '#fff',
                      border: `2.5px solid ${pqFlip ? 'transparent' : '#3D6CB4'}` }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: pqFlip ? 'rgba(255,255,255,.75)' : '#3D6CB4' }}>{pqFlip ? 'Answer' : 'Question'}</span>
                    <span className="font-kid" style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.5, color: pqFlip ? '#fff' : '#1E2A44' }}>{pqFlip ? pq.answer : pq.question}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: pqFlip ? 'rgba(255,255,255,.7)' : '#94A3B8', marginTop: 2 }}>Tap to flip</span>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                    <button onClick={() => pqGo(pqKey, -1, pqTotal)} disabled={pqIdx === 0}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 0', borderRadius: 14, border: 'none', background: pqIdx === 0 ? '#E3E9F3' : '#1E2A44', color: pqIdx === 0 ? '#A6AEC2' : '#fff', fontSize: 14, fontWeight: 700, cursor: pqIdx === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                      <ChevronLeft size={16} /> Prev
                    </button>
                    <button onClick={() => pqGo(pqKey, 1, pqTotal)} disabled={pqIdx >= pqTotal - 1}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px 0', borderRadius: 14, border: 'none', background: pqIdx >= pqTotal - 1 ? '#E3E9F3' : '#1E2A44', color: pqIdx >= pqTotal - 1 ? '#A6AEC2' : '#fff', fontSize: 14, fontWeight: 700, cursor: pqIdx >= pqTotal - 1 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {viewerImage && (
          <div onClick={() => setViewerImage(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(30,42,68,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1.5px solid rgba(30,42,68,0.14)', borderRadius: 18, overflow: 'hidden', maxWidth: 480, width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1.5px solid rgba(30,42,68,0.1)' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#1E2A44' }}>{viewerImage.caption}</span>
                <button onClick={() => setViewerImage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6B87', display: 'flex', padding: 0 }}><X size={18} /></button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={viewerImage.url} alt={viewerImage.caption} style={{ display: 'block', width: '100%', maxHeight: '70vh', objectFit: 'contain', background: '#fff' }} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Test list ─────────────────────────────────────────────────────────────

  function TestCard({ t, badge, borderColor, whenLabel }: { t: TestLike; badge?: React.ReactNode; borderColor: string; whenLabel: string }) {
    const isLoading = loadingId === t.id
    return (
      <button onClick={() => openStudyGuide(t)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', cursor: 'pointer',
          background: '#fff', borderRadius: 16, padding: '14px 16px', border: `1.5px solid ${borderColor}55`, borderLeft: `5px solid ${borderColor}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44' }}>{t.topic}</p>
            {badge}
          </div>
          <p style={{ fontSize: 12, color: '#5B6B87', marginTop: 3 }}>{t.subjectLabel} · {t.totalMarks} marks · {whenLabel}</p>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '9px 14px', borderRadius: 11, background: '#3D6CB4', color: '#fff', fontSize: 12.5, fontWeight: 800 }}>
          {isLoading ? <Loader2 size={13} className="animate-spin" /> : null} Study guide
        </span>
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ── Upcoming tests ── */}
      <div>
        <SectionBar color="#1E2A44" tint="rgba(30,42,68,0.10)" Icon={ClipboardCheck} label={`Upcoming Tests${upcomingTests.length > 0 ? ` (${upcomingTests.length})` : ''}`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {upcomingTests.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #D8E1EE', padding: '20px 18px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#5B6B87' }}>No upcoming tests scheduled. When your teacher schedules a test, it&apos;ll show here with a full study guide.</p>
            </div>
          ) : upcomingTests.map(t => (
            <TestCard key={t.id} t={t} whenLabel={t.whenLabel} borderColor="#1E2A44" badge={t.isNew ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#1E2A44', color: '#fff', fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', padding: '2px 7px', borderRadius: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#EAC968' }} />
                NEW
              </span>
            ) : undefined} />
          ))}
        </div>
      </div>

      {/* ── Awaiting results — already conducted, not marked for this student yet ── */}
      {awaitingResults.length > 0 && (
        <div>
          <SectionBar color="#D97706" tint="#FDECD3" Icon={Hourglass} label="Awaiting Results" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {awaitingResults.map(t => (
              <TestCard key={t.id} t={t} whenLabel={t.whenLabel} borderColor="#D97706" badge={
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', color: '#B45309', background: '#FDECD3', padding: '2px 7px', borderRadius: 8 }}>
                  GRADING
                </span>
              } />
            ))}
          </div>
        </div>
      )}

      {/* ── Previous scores ── */}
      <div>
        <SectionBar color="#3D6CB4" tint="#DCEBF8" Icon={BarChart3} label="Previous Scores" />
        <div style={{ marginTop: 12 }}>
          {pastScores.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #D8E1EE', padding: '20px 18px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#5B6B87' }}>No test results yet.</p>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #D8E1EE', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pastScores.map(m => {
                const pct = m.totalMarks > 0 ? m.score / m.totalMarks : 0
                const color = pct >= 0.7 ? '#059669' : pct >= 0.5 ? '#f97316' : '#dc2626'
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: '#F7FAFD' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1E2A44' }}>{m.topic}</p>
                      <p style={{ fontSize: 11, color: '#5B6B87', marginTop: 2 }}>{m.subjectLabel}</p>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{m.score}/{m.totalMarks}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
