'use client'
import { Repeat } from 'lucide-react'
import type { TimetableEntry } from '@/lib/types'

// Same violet that marks coverage everywhere else in the portal.
const COVERING_ACCENT = '#31215C'

interface Props {
  /** Covering entries for ONE day, already filtered by the caller. */
  entries: TimetableEntry[]
  title: string
  /** Called for subject-matched covers only — see fullAccess below. */
  onOpenPrep: (entry: TimetableEntry) => void
  className?: string
}

/**
 * The periods a teacher has picked up covering for an absent colleague, as
 * actionable cards rather than a notice.
 *
 * Its own section rather than interleaved into the schedule or grid: these
 * aren't the teacher's normal slots, and rendering them identically made a
 * covered period indistinguishable from a class they own. Grouping them also
 * gives the one thing a notice can't — a way into the prep material for a
 * class they may never have taught before.
 *
 * Shared by the home page and the timetable page so the two can't drift into
 * showing different things for the same day. The caller supplies the day's
 * entries and the prep-modal handler, since each page already owns its own
 * notion of "the day being shown" and its own modal state.
 */
export default function CoveringPeriods({ entries, title, onOpenPrep, className }: Props) {
  if (entries.length === 0) return null

  return (
    <section className={className}>
      <h2 className="font-display font-bold text-ink text-lg mb-1">{title}</h2>
      <p className="text-[12.5px] text-ink-soft mb-3">
        Extra periods you&apos;re taking for an absent colleague.
      </p>
      <div className="space-y-3">
        {entries.map(entry => {
          // Only a subject match unlocks the class: school_data() unions an
          // "assigned" cover's class into the teacher's access, so prep
          // material, students and syllabus are all there. A fallback or
          // hand-reassigned cover was never added to that union — there is
          // genuinely nothing behind it to open.
          const fullAccess = entry.fullAccess === true
          const subject = entry.label ?? ''

          const card = (
            <div
              className="paper-card p-4 flex items-center justify-between gap-3"
              style={{ borderLeft: `5px solid ${COVERING_ACCENT}` }}
            >
              <div className="min-w-0 flex items-start gap-3">
                <span
                  className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5"
                  style={{ background: 'rgba(49,33,92,0.10)' }}
                >
                  <Repeat size={15} style={{ color: COVERING_ACCENT }} />
                </span>
                <div className="min-w-0">
                  <p className="font-display font-bold text-ink text-[15px] truncate">
                    Period {entry.periodNumber} · {entry.className ?? 'Class'}
                    {subject ? ` — ${subject}` : ''}
                  </p>
                  <p className="text-[12.5px] font-medium text-ink-soft mt-0.5">
                    {entry.startTime && entry.endTime ? `${entry.startTime}–${entry.endTime} · ` : ''}
                    Covering for {entry.originalTeacherName ?? 'a colleague'}
                  </p>
                  {!fullAccess && (
                    <p className="text-[11.5px] text-ink-faint mt-1 italic">
                      Not your subject — no prep material for this one, just be in the room.
                    </p>
                  )}
                </div>
              </div>
              {fullAccess && (
                <span
                  className="shrink-0 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full text-white"
                  style={{ background: COVERING_ACCENT }}
                >
                  Prep Material
                </span>
              )}
            </div>
          )

          return fullAccess ? (
            <button
              key={entry.id}
              type="button"
              className="w-full text-left active:scale-[0.99] transition-transform"
              onClick={() => onOpenPrep(entry)}
            >
              {card}
            </button>
          ) : (
            <div key={entry.id}>{card}</div>
          )
        })}
      </div>
    </section>
  )
}
