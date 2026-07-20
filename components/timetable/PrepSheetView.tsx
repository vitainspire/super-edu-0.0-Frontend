'use client'
import { useState, type ReactNode } from 'react'
import {
  Database, ListChecks, BookOpen, Gamepad2, Compass,
  ChevronLeft, ChevronRight, Plus,
} from 'lucide-react'
import type { SmartLesson } from '@/lib/types'

interface PrepSheetViewProps {
  lesson: SmartLesson
  topic: string
  subtopic?: string
  fromCache?: boolean
  headerAction?: ReactNode   // optional control rendered in the doc header, next to the "Saved" badge
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

// 5 slides, sized to be readable by a teacher in ~15 minutes and taught straight from:
// Concept (what) -> Activities (how, in class) -> Story (deepen it) -> Challenges (play with
// it) -> Real-Life Application (why it matters outside class).
const SLIDES = [
  { key: 'concept', label: '1 · Concept', color: '#31215C' },
  { key: 'activities', label: '2 · Activities', color: '#1E3A55' },
  { key: 'story', label: '3 · Story', color: '#8A6A1E' },
  { key: 'challenges', label: '4 · Challenges', color: '#234A1D' },
  { key: 'application', label: '5 · Real Life', color: '#5C1F38' },
] as const

// The read-only prep-sheet deck, shared between PrepMaterialModal's "done" state and the
// Classroom Mode / Preview surfaces — all of which display the same already-generated
// SmartLesson, just in different contexts.
export default function PrepSheetView({ lesson, topic, subtopic, fromCache, headerAction }: PrepSheetViewProps) {
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
          <div className="flex items-center gap-2">
            {fromCache && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: '#AAD6A0', background: 'rgba(170,214,160,.15)' }}>
                <Database size={10} /> Saved
              </span>
            )}
            {headerAction}
          </div>
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

        {/* 1 — Concept: unchanged from before, just first now */}
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

        {/* 2 — Activities: one real-life activity per concept point, doubling as the in-class plan */}
        {SLIDES[slideIndex].key === 'activities' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel icon={<ListChecks size={11} />} color="#1E3A55" text="Try These In Class" />
            {(lesson.activities ?? []).map((activity, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span className="flex items-center justify-center shrink-0" style={{ width: 20, height: 20, borderRadius: 999, background: 'rgba(30,58,85,0.1)', color: '#1E3A55', fontSize: 10, fontWeight: 800, marginTop: 1 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#1E3A55' }}>
                    {activity.title}{activity.minutes ? <span style={{ fontWeight: 600, color: 'var(--ink-faint)' }}> · {activity.minutes} min</span> : null}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, marginTop: 2 }}>{activity.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3 — Story: a flowing narrative weaving the concepts together */}
        {SLIDES[slideIndex].key === 'story' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel icon={<BookOpen size={11} />} color="#8A6A1E" text="Tell It Like A Story" />
            <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.85, fontStyle: 'italic' }}>
              {lesson.storyExpansion}
            </p>
          </div>
        )}

        {/* 4 — Challenges: playful, game-like, never framed as a test */}
        {SLIDES[slideIndex].key === 'challenges' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel icon={<Gamepad2 size={11} />} color="#234A1D" text="Play With It" />
            {(lesson.challenges ?? []).map((challenge, i) => (
              <div key={i} style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(35,74,29,0.05)', border: '1px solid rgba(35,74,29,0.12)' }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#234A1D' }}>{challenge.title}</p>
                <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6, marginTop: 3 }}>{challenge.instructions}</p>
              </div>
            ))}
          </div>
        )}

        {/* 5 — Real-Life Application: closing nudge, told directly to students */}
        {SLIDES[slideIndex].key === 'application' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel icon={<Compass size={11} />} color="#5C1F38" text="Where You'll Use This" />
            <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(92,31,56,0.06)', border: '1px solid rgba(92,31,56,0.14)' }}>
              <p style={{ fontSize: 13.5, color: '#5C1F38', lineHeight: 1.7, fontWeight: 600 }}>{lesson.realLifeApplication}</p>
            </div>
          </div>
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
