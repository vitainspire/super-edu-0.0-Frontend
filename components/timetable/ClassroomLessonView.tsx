'use client'
import { useState } from 'react'
import { ArrowLeft, ArrowRight, Translate } from '@/components/ui/icons'
import type { SmartLesson } from '@/lib/types'
import { ACCENT, BORDER, buildSections, WatchStrip } from './PrepSheetView'

interface ClassroomLessonViewProps {
  lesson: SmartLesson
  topic: string
  subtopic?: string
}

// The "teaching live" counterpart to PrepSheetView's banner+deck: one section
// full-screen at a time instead of a scrollable overview, since a teacher
// mid-class glances at ONE part, not the whole lesson. Built from the exact
// same buildSections()/WatchStrip()/ACCENT/BORDER PrepSheetView already
// exports, so the bucket order, bullet shape, and "Watch For" styling can
// never drift between "preparing" and "teaching" views of the same lesson.
//
// Deliberately has no "finish"/"end" action of its own — ClassroomModeModal
// already renders a persistent "End Class" button below whatever this
// component shows, which is the one way this flow ends. The Next button here
// just disables on the last part, pointing the teacher at that button rather
// than duplicating it.
export default function ClassroomLessonView({ lesson, topic, subtopic }: ClassroomLessonViewProps) {
  const sections = buildSections(lesson)
  const [index, setIndex] = useState(0)
  // Off by default, same as PrepSheetView's deck — one tap reveals it for
  // every bullet in this section.
  const [showTelugu, setShowTelugu] = useState(false)
  const section = sections[Math.min(index, Math.max(0, sections.length - 1))]

  if (!section) return null

  const Icon = section.Icon
  const image = section.bullets.find(b => b.image?.url)?.image?.url
  const isLast = index === sections.length - 1

  return (
    <div className="rounded-3xl overflow-hidden -mx-1" style={{ border: BORDER }}>
      {/* Doc header — same forest banner PrepSheetView uses, topic only */}
      <div style={{ background: 'var(--forest)', padding: '16px 20px', borderBottom: BORDER }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#A9C4A2', textTransform: 'uppercase', letterSpacing: '.12em' }}>
          Classroom Mode
        </p>
        <p style={{ fontSize: 17, fontWeight: 900, color: '#fff', lineHeight: 1.2, marginTop: 2 }}>
          {topic}{subtopic ? ` — ${subtopic}` : ''}
        </p>
      </div>

      <div style={{ background: 'var(--paper-bg)', padding: 14 }}>
        {/* Progress across sections, not within one — a teacher cares "how much
            of the lesson is left", not a bullet count. */}
        <div className="flex" style={{ gap: 6, marginBottom: 14 }}>
          {sections.map((s, i) => (
            <div
              key={s.key}
              style={{
                flex: 1, height: 6, borderRadius: 999,
                background: i < index ? ACCENT : i === index ? 'var(--ink)' : 'rgba(15,23,42,0.12)',
              }}
            />
          ))}
        </div>

        <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-soft)', marginBottom: 10 }}>
          Part {index + 1} of {sections.length}
        </p>

        <section className="rounded-2xl overflow-hidden bg-white" style={{ border: BORDER }}>
          <div className="flex items-center gap-2.5 px-4 py-3.5" style={{ borderBottom: '1.5px solid rgba(15,23,42,0.1)' }}>
            <span className="flex items-center justify-center shrink-0 text-white" style={{ width: 34, height: 34, borderRadius: 11, background: ACCENT }}>
              <Icon size={17} />
            </span>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', flex: 1, minWidth: 0 }}>{section.header}</p>
            {typeof section.minutes === 'number' && section.minutes > 0 && (
              <span className="shrink-0 bg-white" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink)', border: '1.5px solid var(--card-border)', padding: '1px 7px', borderRadius: 999 }}>
                ~{section.minutes} min
              </span>
            )}
            {section.bullets.some(b => b.detail_te) && (
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

          {image && (
            <div style={{ padding: '14px 16px 0' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt={`${section.title} illustration`}
                style={{ width: '100%', maxWidth: 320, margin: '0 auto', display: 'block', borderRadius: 12, border: '1.5px solid var(--card-border)', background: '#fff' }}
              />
            </div>
          )}

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {section.bullets.map((b, i) => (
              <div key={i}>
                <p style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4, margin: 0 }}>{b.text}</p>
                {b.detail && <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.55 }}>{b.detail}</p>}
                {/* Telugu — ALWAYS an unreviewed draft (see PrepSheetView's own
                    note on this field); labelled every time, not just once. */}
                {b.detail_te && showTelugu && (
                  <div style={{ borderLeft: '2px dashed var(--card-border)', paddingLeft: 9, marginTop: 6 }}>
                    <div className="flex items-center gap-1" style={{ marginBottom: 2 }}>
                      <Translate size={10} style={{ color: 'var(--ink-faint)' }} />
                      <span style={{ fontSize: 8.5, fontWeight: 800, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                        తెలుగు · unreviewed draft
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55 }}>{b.detail_te}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {section.watch?.text && <WatchStrip watch={section.watch} />}
        </section>

        <div className="flex items-center gap-2.5" style={{ marginTop: 16 }}>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex(i => i - 1)}
            className="flex items-center justify-center gap-1.5 bg-white disabled:opacity-30 transition-colors"
            style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', border: '1.75px solid var(--card-border)', borderRadius: 14, padding: '12px 16px' }}
          >
            <ArrowLeft size={14} /> Back
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => setIndex(i => i + 1)}
            className="flex-1 flex items-center justify-center gap-1.5 text-white disabled:opacity-30 transition-colors"
            style={{ fontSize: 13.5, fontWeight: 800, background: 'var(--ink)', borderRadius: 14, padding: '12px 16px' }}
          >
            {isLast ? 'Last part' : <>Next <ArrowRight size={14} /></>}
          </button>
        </div>

        {isLast && (lesson.materialsUsed?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 16 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.08em', width: '100%' }}>
              You&apos;ll need
            </span>
            {lesson.materialsUsed!.map((m, i) => (
              <span key={i} className="bg-white" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)', border: '1.5px solid var(--card-border)', padding: '2px 9px', borderRadius: 999 }}>
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
