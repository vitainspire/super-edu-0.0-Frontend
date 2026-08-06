'use client'
import { ArrowRight, Sparkles } from '@/components/ui/icons'
import { entriesOn, nextTeachingDay } from '@/lib/logic/weekPlan'
import type { PlannedSession } from '@/lib/logic/weekPlan'
import { accentForSubject } from '@/lib/subject-accent'
import type { TimetableEntry } from '@/lib/types'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

/**
 * Tomorrow's lessons, with tomorrow's topic and a way to prep for them now.
 *
 * The day the page opens on is already covered by the schedule below; the thing
 * a teacher cannot do from that list is get ahead. Prep happens the evening
 * before, so the next teaching day is the one worth putting a button on.
 *
 * "Next" means the next day that actually has periods — not literally tomorrow,
 * which on a Saturday would be an empty Sunday. Hidden entirely when there is
 * nothing ahead within the week, rather than showing an empty shell.
 */
export default function NextDayPrep({
  timetableEntries,
  after,
  today,
  classNameFor,
  gradeFor,
  plannedFor,
  onOpenDay,
  onPrep,
}: {
  timetableEntries: TimetableEntry[]
  /** The day being shown above — "next" is relative to it, not to the clock. */
  after: Date
  /** Actual calendar today, midnight. Only used to word the header correctly —
      "tomorrow" must mean the real tomorrow, not just "the day after `after`",
      or this card relabels the day the schedule above already shows. */
  today: Date
  classNameFor: (classId: string) => string
  gradeFor: (classId: string) => string
  plannedFor: (entry: TimetableEntry, date: Date) => PlannedSession | undefined
  onOpenDay: (date: Date) => void
  onPrep: (args: { classId: string; subject: string; grade: string; topic?: string }) => void
}) {
  const day = nextTeachingDay(timetableEntries, after)
  if (!day) return null
  const entries = entriesOn(timetableEntries, day)

  const isTomorrow = day.getTime() === new Date(
    today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime()

  return (
    <div className="paper-card p-4 sm:p-5" style={{ background: '#FBF6E6' }}>
      <button
        type="button"
        onClick={() => onOpenDay(day)}
        className="w-full flex items-center gap-2.5 text-left group"
      >
        {/* The arrow is the affordance: it reads as "carry on to the next day",
            and tapping the header moves the strip there. */}
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-white group-active:scale-90 transition-transform"
          style={{ border: '2px solid var(--card-border)' }}
        >
          <ArrowRight size={15} className="text-ink" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold text-ink text-[15px]">
            Get ahead for {isTomorrow ? 'tomorrow' : DAYS[day.getDay()]}
          </span>
          <span className="block text-[11px] text-ink-faint mt-0.5">
            {DAYS[day.getDay()].slice(0, 3)}, {MONTHS[day.getMonth()]} {day.getDate()}
            {' · '}{entries.length} period{entries.length === 1 ? '' : 's'}
          </span>
        </span>
      </button>

      <div className="mt-3 space-y-2">
        {entries.map(entry => {
          const subject = entry.label ?? classNameFor(entry.classId)
          const accent  = accentForSubject(subject)
          const planned = plannedFor(entry, day)
          return (
            <div
              key={entry.id}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-white"
              style={{ border: '2px solid var(--card-border)', borderLeft: `5px solid ${accent}` }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-ink truncate">
                  {subject} <span className="text-ink-faint font-semibold">· {classNameFor(entry.classId)}</span>
                </p>
                {/* The topic that will be due by then, not today's. This is the
                    whole reason to project the plan forward. */}
                <p className="text-[11.5px] mt-0.5 truncate">
                  <span className="text-ink-faint font-medium">{entry.startTime}</span>
                  {planned ? (
                    <>
                      {' · '}
                      <span className="font-bold" style={{ color: accent }}>{planned.topic.topic}</span>
                      {planned.sessions > 1 && (
                        <span className="text-ink-faint font-semibold">
                          {' '}(session {planned.session} of {planned.sessions})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-faint font-medium"> · syllabus complete</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onPrep({
                  // Pass the topic this card just displayed — so Prep Material
                  // never re-derives a different one than what's on screen.
                  classId: entry.classId, subject, grade: gradeFor(entry.classId), topic: planned?.topic.topic,
                })}
                aria-label={`Prep material for ${subject}${planned ? `: ${planned.topic.topic}` : ''}`}
                className="shrink-0 flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold text-white active:scale-95 transition-transform"
                style={{ background: 'var(--forest)' }}
              >
                <Sparkles size={13} /> Prep
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
