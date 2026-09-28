'use client'
import { useRef, useState, type ReactNode } from 'react'
import {
  Database, Clock, BookOpen, Compass, Trophy, Flag, Users,
  ChevronRight, ChevronUp, ChevronDown, LayoutList,
  Target, AlertTriangle, Footprints, Translate,
  type LucideIcon,
} from '@/components/ui/icons'
import type { SmartLesson, ExpandableBullet } from '@/lib/types'

interface PrepSheetViewProps {
  lesson: SmartLesson
  topic: string
  subtopic?: string
  fromCache?: boolean
  headerAction?: ReactNode   // optional control rendered in the doc header, next to the "Saved" badge
}

// Shared forest accent — the sheet reads as one family; sections are told apart
// by their icon + header, not by color.
//
// ACCENT/BORDER/Section/buildSections/WatchStrip are exported so
// ClassroomLessonView.tsx (the one-bucket-at-a-time view used inside
// ClassroomModeModal) can build the exact same section list and reuse the
// exact same "Watch For" strip, rather than re-deriving the bucket
// order/shape a second time.
export const ACCENT = '#1F3D2C'
export const BORDER = '2px solid var(--card-border)'

export interface Section {
  key: string
  title: string
  header: string
  Icon: LucideIcon
  bullets: ExpandableBullet[]
  minutes?: number
  watch?: ExpandableBullet | null   // the one thing to watch for during THIS section
}

export function buildSections(lesson: SmartLesson): Section[] {
  const out: Section[] = []
  const t = lesson.timings
  const w = lesson.sectionWatch
  // Order matches the six-bucket agentic pipeline's own teaching order
  // (prep_flow/sections.py's SECTION_ORDER): refresher, concept, realLife,
  // challenge, levelSet, explore — Explore is the forward-looking hook into
  // NEXT lesson's refresher, so it belongs last, not before Challenge.
  if (lesson.previousTopicRefresher) {
    out.push({
      key: 'refresher', title: 'Refresher',
      header: `Refresher — last time: ${lesson.previousTopicRefresher.previousTopic}`,
      Icon: Clock, bullets: lesson.previousTopicRefresher.recap ?? [], minutes: t?.refresher, watch: w?.refresher,
    })
  }
  out.push({ key: 'concept', title: 'Concept', header: 'Concept', Icon: BookOpen, bullets: lesson.concept ?? [], minutes: t?.concept, watch: w?.concept })
  if (lesson.realLife) {
    out.push({ key: 'realLife', title: 'Real Life', header: 'Real Life', Icon: Users, bullets: lesson.realLife.points ?? [], minutes: t?.realLife, watch: w?.realLife })
  }
  out.push({
    key: 'challenge', title: 'Challenge',
    header: lesson.challenge?.activity ? `Challenge — ${lesson.challenge.activity}` : 'Challenge',
    Icon: Trophy, bullets: lesson.challenge?.points ?? [], minutes: t?.challenge, watch: w?.challenge,
  })
  out.push({ key: 'levelSet', title: 'Level Set', header: 'Level Set', Icon: Flag, bullets: lesson.levelSet?.points ?? [], minutes: t?.levelSet, watch: w?.levelSet })
  out.push({ key: 'explore', title: 'Explore', header: 'Explore', Icon: Compass, bullets: lesson.explore?.points ?? [], minutes: t?.explore, watch: w?.explore })
  return out.filter(s => s.bullets.length > 0)
}

// Break a "detail" string into sentence-level points so the deck shows bullets,
// not a paragraph. Splits on sentence-ending punctuation followed by whitespace
// and a capital letter / opening quote / ₹ — which leaves decimals (₹5.50) and
// mid-sentence abbreviations intact.
function splitIntoPoints(detail: string): string[] {
  return detail
    .split(/(?<=[.?!])\s+(?=["'“₹A-Z])/)
    .map(s => s.trim())
    .filter(Boolean)
}

// Small amber "Watch for" strip — reused in each banner section card and each
// deck section so the caution rides with the section it belongs to.
export function WatchStrip({ watch }: { watch: ExpandableBullet }) {
  return (
    <div className="flex items-start gap-1.5" style={{ borderTop: '1.5px solid rgba(27,24,15,0.1)', padding: '8px 14px 10px', background: 'rgba(176,119,30,0.06)' }}>
      <AlertTriangle size={12} style={{ color: '#B0771E', flexShrink: 0, marginTop: 2 }} />
      <div className="min-w-0">
        <p style={{ fontSize: 8.5, fontWeight: 800, color: '#B0771E', textTransform: 'uppercase', letterSpacing: '.09em' }}>Watch For</p>
        <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35, marginTop: 1 }}>{watch.text}</p>
        {watch.detail && <p style={{ fontSize: 10.5, color: 'var(--ink-soft)', lineHeight: 1.4, marginTop: 1 }}>→ {watch.detail}</p>}
      </div>
    </div>
  )
}

// The read-only prep sheet, in two linked views: a banner overview of every
// section, and a per-section vertical deck (one bullet per slide). Bold-outline
// cream aesthetic. Shared between PrepMaterialModal, the Preview modal, and
// Classroom Mode.
export default function PrepSheetView({ lesson, topic, subtopic, fromCache, headerAction }: PrepSheetViewProps) {
  const [mode, setMode] = useState<'banner' | 'deck'>('banner')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [slideDir, setSlideDir] = useState(1)
  // Off by default — a teacher who reads English fine shouldn't have to
  // scroll past a translation on every slide. One tap reveals it for the
  // rest of this sheet.
  const [showTelugu, setShowTelugu] = useState(false)

  const sections = buildSections(lesson)
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

  // Finger swipe on the slide (phones): swipe UP → next, DOWN → previous.
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
    if (Math.abs(dy) < 40 || Math.abs(dy) < Math.abs(dx)) return
    if (dy < 0) goSlide(safeIndex + 1)
    else goSlide(safeIndex - 1)
  }

  return (
    <div className="rounded-3xl overflow-hidden -mx-1" style={{ border: BORDER }}>
      <style>{`
        @keyframes prepSlideUp { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes prepSlideDown { from { transform: translateY(-24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes prepFade { from { opacity: 0 } to { opacity: 1 } }
      `}</style>

      {/* Doc header — forest green */}
      <div style={{ background: 'var(--forest)', padding: '16px 20px', borderBottom: BORDER }}>
        <div className="flex items-center justify-between">
          <p style={{ fontSize: 10, fontWeight: 800, color: '#A9C4A2', textTransform: 'uppercase', letterSpacing: '.12em' }}>
            {mode === 'banner' ? 'Prep Sheet · Overview' : 'Prep Sheet'}
          </p>
          <div className="flex items-center gap-2">
            {fromCache && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: '#1F3D2C', background: '#AAD6A0' }}>
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

      {/* ── Banner: everything on one page ─────────────────────────────────── */}
      {mode === 'banner' && (
        <div style={{ background: 'var(--paper-bg)', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'prepFade .25s ease' }}>
          {/* Today's Goal — a single headline teacher-note */}
          {lesson.objective && (
            <div className="rounded-xl flex items-center gap-1.5 bg-white" style={{ border: BORDER, padding: '8px 11px' }}>
              <Target size={12} style={{ color: ACCENT, flexShrink: 0 }} />
              <span style={{ fontSize: 8.5, fontWeight: 800, color: ACCENT, textTransform: 'uppercase', letterSpacing: '.09em', flexShrink: 0 }}>Goal</span>
              <p className="flex-1 min-w-0" style={{ fontSize: 11.5, color: 'var(--ink)', lineHeight: 1.35, fontWeight: 600 }}>{lesson.objective}</p>
            </div>
          )}

          {/* Floor — the weakest-child path: what EVERY child can do today,
              with this period's own objects, no comparison required. */}
          {lesson.floor && (
            <div className="rounded-xl flex items-center gap-1.5 bg-white" style={{ border: BORDER, padding: '8px 11px' }}>
              <Footprints size={12} style={{ color: ACCENT, flexShrink: 0 }} />
              <span style={{ fontSize: 8.5, fontWeight: 800, color: ACCENT, textTransform: 'uppercase', letterSpacing: '.09em', flexShrink: 0 }}>Floor</span>
              <p className="flex-1 min-w-0" style={{ fontSize: 11.5, color: 'var(--ink)', lineHeight: 1.35, fontWeight: 600 }}>{lesson.floor}</p>
            </div>
          )}

          {sections.map(sec => {
            const Icon = sec.Icon
            return (
              <section key={sec.key} className="rounded-2xl overflow-hidden bg-white" style={{ border: BORDER }}>
                {/* Header row — the ONE arrow that opens THIS section's deck */}
                <button
                  type="button"
                  onClick={() => openDeck(sec.key)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 active:scale-[0.99] transition-transform"
                  style={{ textAlign: 'left', borderBottom: '1.5px solid rgba(27,24,15,0.1)' }}
                >
                  <span className="flex items-center justify-center shrink-0 text-white" style={{ width: 24, height: 24, borderRadius: 8, background: ACCENT }}>
                    <Icon size={13} />
                  </span>
                  <p className="flex-1 min-w-0 truncate" style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {sec.header}
                  </p>
                  {typeof sec.minutes === 'number' && sec.minutes > 0 && (
                    <span className="shrink-0 bg-white" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink)', border: '1.5px solid var(--card-border)', padding: '1px 7px', borderRadius: 999 }}>
                      ~{sec.minutes} min
                    </span>
                  )}
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: ACCENT }}>
                    <ChevronRight size={16} strokeWidth={2.75} />
                  </span>
                </button>

                {/* ≤3 bullet lines — read-only glance */}
                <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {sec.bullets.map((b, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: ACCENT, marginTop: 6, flexShrink: 0 }} />
                      <p className="flex-1 min-w-0" style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>{b.text}</p>
                    </div>
                  ))}
                </div>

                {/* Section board sketch, if one was generated — shown right in the
                    overview so the visual isn't buried behind a tap. */}
                {(() => {
                  const img = sec.bullets.find(b => b.image?.url)?.image?.url
                  return img ? (
                    <div style={{ padding: '0 14px 12px' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img}
                        alt={`${sec.title} illustration`}
                        style={{ width: '100%', maxWidth: 260, borderRadius: 10, border: '1.5px solid var(--card-border)', background: '#fff', display: 'block' }}
                      />
                      <p style={{ fontSize: 9.5, color: 'var(--ink-faint)', marginTop: 3, fontWeight: 600 }}>Show this to explain the example</p>
                    </div>
                  ) : null
                })()}

                {/* No per-section Watch For here anymore — it's what the arrow
                    above opens: Deck view already shows it, pinned to this
                    section's last slide. Keeping the banner card to bullets
                    only is the point; the caution is one tap away, not
                    cluttering the overview by default. */}
              </section>
            )
          })}

          {/* Legacy global Watch For — only for lessons saved before per-section
              sectionWatch existed; new lessons show the caution inside each card. */}
          {!lesson.sectionWatch && (lesson.watchFor?.length ?? 0) > 0 && (
            <div className="rounded-xl bg-white" style={{ border: BORDER, padding: '9px 11px' }}>
              <div className="flex items-center gap-1" style={{ marginBottom: 5 }}>
                <AlertTriangle size={11} style={{ color: '#B0771E' }} />
                <p style={{ fontSize: 8.5, fontWeight: 800, color: '#B0771E', textTransform: 'uppercase', letterSpacing: '.09em' }}>Watch For</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {lesson.watchFor!.map((w, i) => (
                  <div key={i}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>{w.text}</p>
                    {w.detail && (
                      <p style={{ fontSize: 10.5, color: 'var(--ink-soft)', lineHeight: 1.4, marginTop: 1 }}>→ {w.detail}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materials the teacher needs */}
          {(lesson.materialsUsed?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 flex-wrap" style={{ padding: '2px 4px' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                You&apos;ll need
              </span>
              {lesson.materialsUsed.map((m, i) => (
                <span key={i} className="bg-white" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)', border: '1.5px solid var(--card-border)', padding: '2px 9px', borderRadius: 999 }}>
                  {m}
                </span>
              ))}
            </div>
          )}

          {/* Flex time — freed by Explore's 5-minute cap, never silently folded
              into another section; the teacher decides what to do with it. */}
          {typeof lesson.flexMinutes === 'number' && lesson.flexMinutes > 0 && (
            <div className="rounded-xl flex items-center gap-1.5" style={{ border: '1.5px dashed var(--card-border)', padding: '8px 11px', background: 'rgba(31,61,44,0.04)' }}>
              <Clock size={12} style={{ color: ACCENT, flexShrink: 0 }} />
              <p className="flex-1 min-w-0" style={{ fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.35 }}>
                <span style={{ fontWeight: 800, color: 'var(--ink)' }}>+{lesson.flexMinutes} min flex time</span> — yours to spend however this class needs today.
              </p>
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
            <div className="flex items-center gap-1.5">
              <span className="flex items-center justify-center shrink-0 text-white" style={{ width: 20, height: 20, borderRadius: 7, background: ACCENT }}>
                <activeSection.Icon size={11} />
              </span>
              <p className="flex-1 min-w-0" style={{ fontSize: 10, fontWeight: 800, color: ACCENT, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                {activeSection.title}{deckBullets.length > 1 ? ` · ${safeIndex + 1} of ${deckBullets.length}` : ''}
              </p>
              {current.detail_te && (
                <button
                  type="button"
                  onClick={() => setShowTelugu(v => !v)}
                  className="flex items-center gap-1 shrink-0 transition-colors"
                  style={{
                    fontSize: 9.5, fontWeight: 800, borderRadius: 999, padding: '3px 9px',
                    color: showTelugu ? '#fff' : ACCENT,
                    background: showTelugu ? ACCENT : '#fff',
                    border: `1.5px solid ${ACCENT}`,
                  }}
                >
                  <Translate size={10} /> {showTelugu ? 'Hide' : 'Show'} తెలుగు
                </button>
              )}
            </div>

            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.4 }}>{current.text}</p>

            {current.detail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {splitIntoPoints(current.detail).map((pt, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: ACCENT, marginTop: 8, flexShrink: 0 }} />
                    <p className="flex-1 min-w-0" style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{pt}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Telugu — ALWAYS an unreviewed draft (generation/language_layer.py
                stamps every lesson this way; no native-speaker review pass
                exists yet), so the label says so every time, not just once. */}
            {current.detail_te && showTelugu && (
              <div style={{ borderLeft: '2px dashed var(--card-border)', paddingLeft: 10 }}>
                <div className="flex items-center gap-1" style={{ marginBottom: 3 }}>
                  <Translate size={11} style={{ color: 'var(--ink-faint)' }} />
                  <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    తెలుగు · unreviewed draft
                  </span>
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{current.detail_te}</p>
              </div>
            )}

            {current.image?.url && (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current.image.url}
                  alt="Lesson illustration"
                  style={{ width: '100%', maxWidth: 300, borderRadius: 10, border: BORDER, background: '#fff', display: 'block' }}
                />
                <p style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 4, fontWeight: 600 }}>Show this to explain the example</p>
              </div>
            )}

            {/* This section's Watch For — pinned to the last slide of the section */}
            {activeSection.watch?.text && safeIndex === deckBullets.length - 1 && (
              <div style={{ marginTop: 'auto', marginLeft: -20, marginRight: -20, marginBottom: -20 }}>
                <WatchStrip watch={activeSection.watch} />
              </div>
            )}
          </div>

          {/* Vertical nav (within this section) + back to overview */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: BORDER, background: 'var(--paper-bg)' }}>
            <button
              type="button"
              onClick={() => setMode('banner')}
              className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-ink bg-white transition-colors"
              style={{ fontSize: 12, fontWeight: 700, border: '1.75px solid var(--card-border)' }}
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
                    background: i === safeIndex ? ACCENT : 'rgba(27,24,15,0.2)',
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
                className="w-9 h-9 flex items-center justify-center rounded-lg text-ink bg-white disabled:opacity-30 transition-colors"
                style={{ border: '1.75px solid var(--card-border)' }}
              >
                <ChevronUp size={18} />
              </button>
              <button
                type="button"
                onClick={() => goSlide(safeIndex + 1)}
                disabled={safeIndex === deckBullets.length - 1}
                aria-label="Next"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-ink bg-white disabled:opacity-30 transition-colors"
                style={{ border: '1.75px solid var(--card-border)' }}
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
