'use client'
import { useState, type ReactNode } from 'react'
import {
  Database, Lightbulb, Compass, Trophy, Flag,
  ChevronLeft, ChevronRight, HelpCircle, Sparkle,
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

const SLIDES = [
  { key: 'concept', label: '1 · Concept', color: '#31215C' },
  { key: 'connection', label: "2 · Let's Imagine", color: '#1E3A55' },
  { key: 'exploration', label: '3 · Explore', color: '#8A6A1E' },
  { key: 'challenge', label: '4 · Challenge', color: '#234A1D' },
  { key: 'levelSet', label: '5 · Level Set', color: '#5C1F38' },
] as const

// The read-only prep-sheet deck — Concept -> Let's Imagine (real-life connection)
// -> Explore -> Challenge -> Level Set — shared between PrepMaterialModal's "done"
// state and the Classroom Mode / Preview surfaces, all of which display the same
// already-generated SmartLesson, just in different contexts.
export default function PrepSheetView({ lesson, topic, subtopic, fromCache, headerAction }: PrepSheetViewProps) {
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

        {SLIDES[slideIndex].key === 'concept' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(lesson.concept ?? []).map((bullet, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: '#7A5FB8', marginTop: 7, flexShrink: 0 }} />
                <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, flex: 1 }}>{bullet}</p>
              </div>
            ))}
          </div>
        )}

        {SLIDES[slideIndex].key === 'connection' && (
          <section>
            <SectionLabel icon={<Lightbulb size={11} />} color="#1E3A55" text="Let's Imagine..." />
            <p style={{ fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.7, marginTop: 8 }}>{lesson.realLifeConnection}</p>
          </section>
        )}

        {SLIDES[slideIndex].key === 'exploration' && (
          <>
            <section>
              <SectionLabel icon={<Compass size={11} />} color="#8A6A1E" text={`Activity: ${lesson.interactiveExploration?.activity ?? ''}`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {(lesson.interactiveExploration?.steps ?? []).map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span className="flex items-center justify-center shrink-0" style={{ width: 20, height: 20, borderRadius: 999, background: 'rgba(138,106,30,0.12)', color: '#8A6A1E', fontSize: 10, fontWeight: 800, marginTop: 1 }}>
                      {i + 1}
                    </span>
                    <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6, flex: 1 }}>{step}</p>
                  </div>
                ))}
              </div>
            </section>
            {(lesson.interactiveExploration?.guidingQuestions?.length ?? 0) > 0 && (
              <section style={{ paddingTop: 12, borderTop: '1px dashed rgba(58,44,30,0.15)' }}>
                <SectionLabel icon={<HelpCircle size={11} />} color="#5B87AD" text="Ask the class" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {lesson.interactiveExploration.guidingQuestions.map((q, i) => (
                    <p key={i} style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>&ldquo;{q}&rdquo;</p>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {SLIDES[slideIndex].key === 'challenge' && (
          <section>
            <SectionLabel icon={<Trophy size={11} />} color="#234A1D" text={`Activity: ${lesson.challenge?.activity ?? ''}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {(lesson.challenge?.steps ?? []).map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span className="flex items-center justify-center shrink-0" style={{ width: 20, height: 20, borderRadius: 999, background: 'rgba(35,74,29,0.12)', color: '#234A1D', fontSize: 10, fontWeight: 800, marginTop: 1 }}>
                    {i + 1}
                  </span>
                  <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.6, flex: 1 }}>{step}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {SLIDES[slideIndex].key === 'levelSet' && (
          <>
            <section>
              <SectionLabel icon={<Flag size={11} />} color="#5C1F38" text="Back to the story" />
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.6, marginTop: 8 }}>{lesson.levelSet?.returnToScenario}</p>
            </section>
            {(lesson.levelSet?.questions?.length ?? 0) > 0 && (
              <section>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lesson.levelSet.questions.map((q, i) => (
                    <p key={i} style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>- {q}</p>
                  ))}
                </div>
              </section>
            )}
            {lesson.levelSet?.extendPrompt && (
              <section style={{ paddingTop: 12, borderTop: '1px dashed rgba(58,44,30,0.15)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Sparkle size={13} style={{ color: '#8069B0', flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{lesson.levelSet.extendPrompt}</p>
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
