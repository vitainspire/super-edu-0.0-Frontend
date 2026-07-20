'use client'
import { useState, type ReactNode } from 'react'
import {
  CheckCircle2, Database,
  Target, ListChecks, MessageCircle, AlertTriangle, LifeBuoy, ArrowUpCircle,
  ChevronLeft, ChevronRight, Plus,
} from 'lucide-react'
import type { SmartLesson } from '@/lib/types'

interface PrepSheetViewProps {
  lesson: SmartLesson
  topic: string
  subtopic?: string
  fromCache?: boolean
}

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

const SLIDES = [
  { key: 'overview', label: '1 · Overview', color: '#31215C' },
  { key: 'concept', label: '2 · Concept', color: '#1E3A55' },
  { key: 'flow', label: '3 · Flow', color: '#8A6A1E' },
  { key: 'support', label: '4 · Support', color: '#234A1D' },
] as const

// The read-only prep-sheet deck (Overview/Concept/Flow/Support), shared between
// PrepMaterialModal's "done" state and the Classroom Mode / Preview surfaces —
// all of which display the same already-generated SmartLesson, just in different contexts.
export default function PrepSheetView({ lesson, topic, subtopic, fromCache }: PrepSheetViewProps) {
  const [expandedBullet, setExpandedBullet] = useState<number | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [slideDir, setSlideDir] = useState(1)

  function goSlide(i: number) {
    setSlideDir(i > slideIndex ? 1 : -1)
    setSlideIndex(Math.max(0, Math.min(SLIDES.length - 1, i)))
  }

  return (
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
  )
}
