'use client'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { X, ArrowRight, ArrowLeft } from 'lucide-react'
// Pure, and tested separately — a card placed off-screen breaks the whole
// guide, so the geometry lives where it can be exercised without a browser.
import { placeCard, type Box } from '@/lib/logic/tour-placement'

/**
 * A pointing tour of the admin portal.
 *
 * Each step puts a box around a real element and explains what it is for, in
 * the order the school has to be set up. That order is the whole point: every
 * page in this portal works in isolation, so it is entirely possible to build a
 * timetable before assigning any teachers and have it publish 8 periods out of
 * 80 while reporting success. Reading the sidebar top to bottom avoids that,
 * and this walks it.
 *
 * Steps whose target is not on screen are skipped rather than shown floating —
 * the sidebar is `hidden md:flex`, so on a phone the nav steps do not exist.
 */

interface Step {
  /** data-tour value of the element to ring. Omitted = a centred card. */
  target?: string
  title: string
  body: string
  /** Which side of the target the card sits on. Falls back if there is no room. */
  place?: 'right' | 'bottom'
}

const STEPS: Step[] = [
  {
    title: 'Welcome to the admin portal',
    body:
      // No step count here on purpose: steps whose target is missing are
      // dropped at runtime, so any number written into the copy would
      // eventually be a lie. The dots below the card carry the length.
      "This is where the school gets set up and run. The sidebar is ordered by what has to happen first — each step unlocks the next, and going out of order is how you end up with a half-published timetable. It takes about a minute.",
  },
  {
    target: 'nav-academic-calendar',
    place: 'right',
    title: '1. Academic Calendar — start here',
    body:
      'Set the academic year, the holidays, and the daily bell schedule. Everything later counts working days and periods against this, so the timetable and syllabus estimates cannot be right until it is. Remember to Publish — teachers only see a published calendar.',
  },
  {
    target: 'nav-teachers',
    place: 'right',
    title: '2. Teachers',
    body:
      'Add your teaching staff. Their accounts are active immediately — no confirmation email to chase. Give each one their subjects while you are here: it feeds timetable generation and helps substitute cover find someone who actually teaches that subject.',
  },
  {
    target: 'nav-classes',
    place: 'right',
    title: '3. Classes and students',
    body:
      'Create each grade and section, add the students, and assign a teacher to each class per subject. That assignment is what makes a class appear on a teacher\'s portal — without it the class exists but nobody can open it.',
  },
  {
    target: 'nav-timetable',
    place: 'right',
    title: '4. Timetable',
    body:
      'Generate the week from your subjects and bell schedule, then Publish. Only periods with a teacher assigned are published — an unstaffed period is silently skipped, so finish step 3 before you get here.',
  },
  {
    target: 'nav-syllabus',
    place: 'right',
    title: '5. Syllabus',
    body:
      'Add the topics for each grade and subject, by hand or by importing a PDF. Once the calendar and timetable exist, the portal can tell you how many sessions the year actually has and whether the syllabus fits in them.',
  },
  {
    target: 'nav-textbooks',
    place: 'right',
    title: '6. Textbooks',
    body:
      'Upload the real textbook. Chapters are extracted with their pictures, and you review the split before publishing — that review matters, because a wrongly split book looks perfectly fine to every automated check. Published chapters are what keep AI prep material faithful to the book in the children\'s hands.',
  },
  {
    target: 'nav-substitutes',
    place: 'right',
    title: 'Day to day — Substitutes',
    body:
      'Once the school is running, this is the page you open each morning. Mark who is away and cover is assigned automatically, preferring a teacher who actually teaches that subject. Anything it could not resolve is flagged for you.',
  },
  {
    target: 'dash-readiness',
    place: 'bottom',
    title: 'School Readiness',
    body:
      'Your live checklist. Each line is a number that should be zero and links to the page that fixes it. It empties out as the school gets configured, and disappears entirely when everything is in place.',
  },
  {
    target: 'dash-today',
    place: 'bottom',
    title: 'Today',
    body:
      'The state of the school right now — attendance, teachers away, cover that still needs a decision, and students waiting on an answer. Check it before the first bell.',
  },
]

// useLayoutEffect warns when React renders this on the server. The measuring
// genuinely wants to run before paint, so keep it in the browser and fall back
// to useEffect during SSR, where it does nothing anyway.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const PADDING = 8

export default function AdminTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  // Only the steps whose target actually exists — measured after mount, since
  // the sidebar is absent on small screens and panels render conditionally.
  const [steps, setSteps] = useState<Step[]>([])
  const [box, setBox] = useState<Box | null>(null)

  useEffect(() => {
    if (!open) return
    setIndex(0)
    setSteps(STEPS.filter(s => !s.target || document.querySelector(`[data-tour="${s.target}"]`)))
  }, [open])

  const step = steps[index]

  const measure = useCallback(() => {
    if (!step?.target) { setBox(null); return }
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    if (!el) { setBox(null); return }
    const r = el.getBoundingClientRect()
    setBox({
      top: r.top - PADDING,
      left: r.left - PADDING,
      width: r.width + PADDING * 2,
      height: r.height + PADDING * 2,
    })
  }, [step])

  useIsomorphicLayoutEffect(() => {
    if (!open || !step) return
    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // After the smooth scroll settles, not before, or the ring lands on where
    // the element used to be.
    const t = setTimeout(measure, 320)
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, step, measure])

  const next = useCallback(() => {
    setIndex(i => (i + 1 < steps.length ? i + 1 : (onClose(), i)))
  }, [steps.length, onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, next, onClose])

  if (!open || !step) return null

  const last = index === steps.length - 1

  const cardStyle = placeCard(box, step.place, {
    width: window.innerWidth,
    height: window.innerHeight,
  })

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Admin portal guide">
      {/* No target: a plain dimmer. With one: the same dimmer punched through by
          an enormous spread shadow, which is what makes the ring a spotlight
          rather than a box drawn on top of a grey sheet. */}
      {!box && <div className="absolute inset-0" style={{ background: 'rgba(23,20,15,0.55)' }} onClick={onClose} />}
      {box && (
        <div
          className="absolute rounded-2xl pointer-events-none transition-all duration-200"
          style={{
            top: box.top, left: box.left, width: box.width, height: box.height,
            boxShadow: '0 0 0 9999px rgba(23,20,15,0.55)',
            border: '2.5px solid #F7EFC4',
          }}
        />
      )}

      <div
        className="absolute paper-card p-4 shadow-xl"
        style={{ ...cardStyle, background: 'var(--paper-soft, #FFF)' }}
      >
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <p className="font-display font-bold text-ink text-[15px] leading-tight">{step.title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the guide"
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-ink-soft hover:bg-ink/5"
          >
            <X size={14} />
          </button>
        </div>

        <p className="text-[13px] text-ink-soft leading-relaxed">{step.body}</p>

        <div className="flex items-center gap-2 mt-4">
          <div className="flex items-center gap-1 flex-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === index ? 18 : 6,
                  background: i === index ? 'var(--ink)' : 'rgba(15,23,42,0.18)',
                }}
              />
            ))}
          </div>
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex(i => Math.max(0, i - 1))}
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-white active:scale-90 transition-transform shrink-0"
              style={{ border: '2px solid var(--card-border)' }}
            >
              <ArrowLeft size={14} className="text-ink" />
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="flex items-center gap-1.5 px-4 h-9 rounded-xl text-xs font-bold text-white active:scale-95 transition-transform shrink-0"
            style={{ background: 'var(--ink)' }}
          >
            {last ? 'Done' : 'Next'} {!last && <ArrowRight size={13} />}
          </button>
        </div>
      </div>
    </div>
  )
}
