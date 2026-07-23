'use client'
import { useRef, useState, type ReactNode } from 'react'
import {
  Database, Clock, BookOpen, Compass, Trophy, Flag,
  ChevronRight, ChevronUp, ChevronDown, LayoutList,
  Target, AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import type { SmartLesson, ExpandableBullet } from '@/lib/types'

interface PrepSheetViewProps {
  lesson: SmartLesson
  topic: string
  subtopic?: string
  fromCache?: boolean
  headerAction?: ReactNode   // optional control rendered in the doc header, next to the "Saved" badge
}

// One section of the lesson, flattened for the banner + the vertical deck.
interface Section {
  key: string
  title: string      // short chip title, e.g. "Explore"
  header: string     // the fuller header line, e.g. "Let's Imagine..." / "Activity: Mystery Bag"
  color: string
  Icon: LucideIcon
  bullets: ExpandableBullet[]
  minutes?: number   // rough pacing, shown as a chip on the banner header
}

function buildSections(lesson: SmartLesson): Section[] {
  const out: Section[] = []
  // One shared accent across every section — the sheet reads as a single family,
  // sections are told apart by their icon + header, not by color.
  const C = '#8B7BC7'
  const t = lesson.timings
  if (lesson.previousTopicRefresher) {
    out.push({
      key: 'refresher', title: 'Refresher',
      header: `Last time: ${lesson.previousTopicRefresher.previousTopic}`,
      color: C, Icon: Clock, bullets: lesson.previousTopicRefresher.recap ?? [], minutes: t?.refresher,
    })
  }
  out.push({ key: 'concept', title: 'Concept', header: 'Concept', color: C, Icon: BookOpen, bullets: lesson.concept ?? [], minutes: t?.concept })
  out.push({ key: 'explore', title: 'Explore', header: "Let's Imagine…", color: C, Icon: Compass, bullets: lesson.explore?.points ?? [], minutes: t?.explore })
  out.push({ key: 'challenge', title: 'Challenge', header: `Activity: ${lesson.challenge?.activity ?? ''}`, color: C, Icon: Trophy, bullets: lesson.challenge?.points ?? [], minutes: t?.challenge })
  out.push({ key: 'levelSet', title: 'Level Set', header: 'Level Set', color: C, Icon: Flag, bullets: lesson.levelSet?.points ?? [], minutes: t?.levelSet })
  return out.filter(s => s.bullets.length > 0)
}

// The read-only prep sheet, in two linked views:
//   • Banner — a single "at a glance" page listing every section header with its
//     (≤3) bullet lines. An arrow beside the header jumps into the deck at that
//     section's first bullet; an arrow beside a bullet jumps straight to that
//     bullet's own slide.
//   • Deck — one bullet per slide, sliding vertically, showing that bullet's
//     full detail + board sketch. "Overview" returns to the banner.
// Shared between PrepMaterialModal's "done" state and the Preview / Classroom
// Mode surfaces, all of which display the same already-generated SmartLesson.
export default function PrepSheetView({ lesson, topic, subtopic, fromCache, headerAction }: PrepSheetViewProps) {
  const [mode, setMode] = useState<'banner' | 'deck'>('banner')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [slideDir, setSlideDir] = useState(1)

  const sections = buildSections(lesson)

  // The deck is scoped to a SINGLE section — its own bullets only, one per slide.
  const activeSection = sections.find(s => s.key === activeKey) ?? null
  const deckBullets = activeSection?.bullets ?? []
  const safeIndex = Math.min(slideIndex, Math.max(0, deckBullets.length - 1))
  const current = deckBullets[safeIndex]

  function openDeck(key: string) {
    setActiveKey(key)
    setSlideDir(1)
    setSlideIndex(0)
    setMode('deck')
  }
  function goSlide(i: number) {
    setSlideDir(i > safeIndex ? 1 : -1)
    setSlideIndex(Math.max(0, Math.min(deckBullets.length - 1, i)))
  }

  // Finger swipe on the slide (phones): swipe UP → next bullet, DOWN → previous.
  // A modest vertical threshold, and we ignore mostly-horizontal drags so it
  // doesn't fight the modal's own scroll/close gestures.
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dy = t.clientY - start.y
    const dx = t.clientX - start.x
    if (Math.abs(dy) < 40 || Math.abs(dy) < Math.abs(dx)) return  // too small, or a horizontal swipe
    if (dy < 0) goSlide(safeIndex + 1)   // finger moved up → next
    else goSlide(safeIndex - 1)          // finger moved down → previous
  }

  return (
    <div className="rounded-3xl overflow-hidden -mx-1" style={{ border: '1.5px solid rgba(58,44,30,0.08)' }}>
      <style>{`
        @keyframes prepSlideUp { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes prepSlideDown { from { transform: translateY(-24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes prepFade { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

      {/* Doc header */}
      <div style={{ background: 'var(--ink)', padding: '16px 20px' }}>
        <div className="flex items-center justify-between">
          <p style={{ fontSize: 10, fontWeight: 800, color: '#C7B7E8', textTransform: 'uppercase', letterSpacing: '.12em' }}>
            {mode === 'banner' ? 'Prep Sheet · Overview' : 'Prep Sheet'}
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

      {/* ── Banner: everything on one colorful page ────────────────────────── */}
      {mode === 'banner' && (
        <div style={{ background: '#FBF8F2', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'prepFade .25s ease' }}>
          {/* Today's Goal — a single headline, small teacher-note */}
          {lesson.objective && (
            <div className="rounded-xl flex items-center gap-1.5" style={{ background: '#F1ECFA', border: '1px solid #8B7BC733', padding: '7px 10px' }}>
              <Target size={11} style={{ color: '#5B3F9E', flexShrink: 0 }} />
              <span style={{ fontSize: 8.5, fontWeight: 800, color: '#5B3F9E', textTransform: 'uppercase', letterSpacing: '.09em', flexShrink: 0 }}>Goal</span>
              <p className="flex-1 min-w-0" style={{ fontSize: 11.5, color: 'var(--ink)', lineHeight: 1.35, fontWeight: 600 }}>{lesson.objective}</p>
            </div>
          )}

          {sections.map(sec => {
            const Icon = sec.Icon
            return (
              <section
                key={sec.key}
                className="rounded-2xl overflow-hidden"
                style={{ background: sec.color }}
              >
                {/* Header row — the ONE arrow that opens THIS section's deck */}
                <button
                  type="button"
                  onClick={() => openDeck(sec.key)}
                  className="w-full flex items-center gap-2 px-3 pt-2.5 pb-2 active:scale-[0.99] transition-transform"
                  style={{ textAlign: 'left' }}
                >
                  <span className="flex items-center justify-center shrink-0" style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(255,255,255,0.22)', color: '#fff' }}>
                    <Icon size={13} />
                  </span>
                  <p className="flex-1 min-w-0 truncate" style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    {sec.header}
                  </p>
                  {typeof sec.minutes === 'number' && sec.minutes > 0 && (
                    <span className="shrink-0" style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.22)', padding: '2px 7px', borderRadius: 999 }}>
                      ~{sec.minutes} min
                    </span>
                  )}
                  <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.22)', color: '#fff' }}>
                    <ChevronRight size={16} strokeWidth={2.75} />
                  </span>
                </button>

                {/* ≤3 bullet lines — read-only glance, same color as the card */}
                <div style={{ padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {sec.bullets.map((b, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.6)', marginTop: 6, flexShrink: 0 }} />
                      <p className="flex-1 min-w-0" style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.92)', lineHeight: 1.5 }}>{b.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}

          {/* Watch for — small teacher-note: misconceptions + corrective move */}
          {(lesson.watchFor?.length ?? 0) > 0 && (
            <div className="rounded-xl" style={{ background: '#FBF1E3', border: '1px solid #C98A2E44', padding: '7px 10px' }}>
              <div className="flex items-center gap-1" style={{ marginBottom: 5 }}>
                <AlertTriangle size={10} style={{ color: '#B0771E' }} />
                <p style={{ fontSize: 8.5, fontWeight: 800, color: '#B0771E', textTransform: 'uppercase', letterSpacing: '.09em' }}>Watch For</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {lesson.watchFor!.map((w, i) => (
                  <div key={i}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', lineHeight: 1.35 }}>{w.text}</p>
                    {w.detail && (
                      <p style={{ fontSize: 10.5, color: 'var(--ink-faint)', lineHeight: 1.4, marginTop: 1 }}>→ {w.detail}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materials the teacher needs, at a glance */}
          {(lesson.materialsUsed?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 flex-wrap" style={{ padding: '2px 4px' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                You&apos;ll need
              </span>
              {lesson.materialsUsed.map((m, i) => (
                <span key={i} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', background: 'rgba(58,44,30,0.06)', padding: '2px 9px', borderRadius: 999 }}>
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Deck: this ONE section's bullets, one per slide, sliding vertically ── */}
      {mode === 'deck' && activeSection && current && (
        <>
          <div
            key={safeIndex}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{
              background: '#fff', padding: '20px', minHeight: 300,
              animation: `${slideDir >= 0 ? 'prepSlideUp' : 'prepSlideDown'} .28s ease`,
              display: 'flex', flexDirection: 'column', gap: 14,
              touchAction: 'pan-y', WebkitUserSelect: 'none', userSelect: 'none',
            }}
          >
            {/* which section + position within it */}
            <div className="flex items-center gap-1.5">
              <span className="flex items-center justify-center shrink-0" style={{ width: 18, height: 18, borderRadius: 999, background: `${activeSection.color}1A`, color: activeSection.color }}>
                <activeSection.Icon size={11} />
              </span>
              <p style={{ fontSize: 10, fontWeight: 800, color: activeSection.color, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                {activeSection.title}{deckBullets.length > 1 ? ` · ${safeIndex + 1} of ${deckBullets.length}` : ''}
              </p>
            </div>

            {/* the bullet itself, expanded */}
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.4 }}>{current.text}</p>

            {current.detail && (
              <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.65 }}>{current.detail}</p>
            )}

            {current.image?.url && (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current.image.url}
                  alt="Board reference sketch"
                  style={{ width: '100%', maxWidth: 300, borderRadius: 10, border: '1px solid rgba(58,44,30,0.15)', background: '#fff', display: 'block' }}
                />
                <p style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 4, fontWeight: 600 }}>Reference — copy this onto the board</p>
              </div>
            )}
          </div>

          {/* Vertical nav (within this section) + back to overview */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(58,44,30,0.08)' }}>
            <button
              type="button"
              onClick={() => setMode('banner')}
              className="flex items-center gap-1.5 px-3 h-9 rounded-full text-ink-soft transition-colors"
              style={{ fontSize: 12, fontWeight: 700, background: 'rgba(58,44,30,0.04)' }}
            >
              <LayoutList size={14} /> Overview
            </button>

            <div className="flex items-center gap-1.5">
              {deckBullets.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goSlide(i)}
                  aria-label={`Go to ${activeSection.title} ${i + 1}`}
                  style={{
                    width: 6, height: i === safeIndex ? 18 : 6, borderRadius: 999,
                    background: i === safeIndex ? activeSection.color : 'rgba(58,44,30,0.15)',
                    transition: 'all .15s',
                  }}
                />
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goSlide(safeIndex - 1)}
                disabled={safeIndex === 0}
                aria-label="Previous"
                className="w-9 h-9 flex items-center justify-center rounded-full text-ink-soft disabled:opacity-30 transition-colors"
              >
                <ChevronUp size={18} />
              </button>
              <button
                type="button"
                onClick={() => goSlide(safeIndex + 1)}
                disabled={safeIndex === deckBullets.length - 1}
                aria-label="Next"
                className="w-9 h-9 flex items-center justify-center rounded-full text-ink-soft disabled:opacity-30 transition-colors"
              >
                <ChevronDown size={18} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
