'use client'
import Link from 'next/link'
import { CalendarDays } from '@/components/ui/icons'
import { ChevronLeft, ChevronRight, PartyPopper } from 'lucide-react'
import {
  DAY_INITIALS, weekDates, entriesOn, sameDay, addDays, weekProgress,
} from '@/lib/logic/weekPlan'
import type { AcademicEvent, SyllabusTopic, TimetableEntry } from '@/lib/types'
import { CATEGORY_META, CATEGORY_CELL_TINT } from '@/lib/academic-calendar'
import clsx from 'clsx'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_FULL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']


/** Local date, not UTC — a straight toISOString() shifts the date near
    midnight in timezones ahead of UTC, which would flag the wrong day. */
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * A week at a time, with the selected day driving the schedule below it.
 *
 * Replaces a month grid. The month told you which days you teach — true, and
 * the same every month, since a timetable repeats weekly. A week strip answers
 * the question a teacher actually has: what is on, and what is on tomorrow.
 * Picking a day here is what makes the next day's periods and topics reachable
 * at all; before this the page could only ever show today.
 *
 * A dot marks days that carry periods, so a week with a free Thursday reads
 * without tapping through it.
 */
export default function WeekStrip({
  timetableEntries,
  syllabusTopics,
  selected,
  onSelect,
  academicYearStart,
  academicEvents = [],
  classNameFor,
}: {
  timetableEntries: TimetableEntry[]
  syllabusTopics: SyllabusTopic[]
  selected: Date
  onSelect: (date: Date) => void
  academicYearStart?: string
  /** Published holidays/exams/terms — flags a day off with a hover reason. */
  academicEvents?: AcademicEvent[]
  classNameFor: (classId: string) => string
}) {
  const today = new Date()
  const days = weekDates(selected)
  const progress = weekProgress(syllabusTopics, selected, academicYearStart)
  const pct = progress.total ? Math.round((progress.taught / progress.total) * 100) : 0

  return (
    <div className="paper-card p-4 sm:p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="font-display font-bold text-ink text-[17px] flex items-center gap-2">
            {DAYS_FULL[selected.getDay()]}, {MONTHS[selected.getMonth()]} {selected.getDate()}
            {/* Read-only for a teacher — same calendar the admin publishes,
                just no controls to change it. */}
            <Link
              href="/academic-calendar"
              aria-label="Open academic calendar"
              className="shrink-0 active:scale-90 transition-transform"
            >
              <CalendarDays size={15} className="text-ink-faint hover:text-ink transition-colors" />
            </Link>
          </p>
          <p className="text-[11px] text-ink-faint mt-0.5">
            {progress.week != null ? `Week ${progress.week}` : 'Before the year starts'}
            {progress.total > 0 && ` · ${progress.taught} of ${progress.total} topics taught`}
          </p>
        </div>

        {/* Week at a time. The arrows are the only way to reach a day that is
            not in the current week, so they stay visible rather than appearing
            on hover. */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onSelect(addDays(selected, -7))}
            aria-label="Previous week"
            className="w-11 h-11 rounded-xl flex items-center justify-center bg-white active:scale-90 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            style={{ border: '1px solid var(--card-border)' }}
          >
            <ChevronLeft size={15} className="text-ink" />
          </button>
          <button
            type="button"
            onClick={() => onSelect(addDays(selected, 7))}
            aria-label="Next week"
            className="w-11 h-11 rounded-xl flex items-center justify-center bg-white active:scale-90 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            style={{ border: '1px solid var(--card-border)' }}
          >
            <ChevronRight size={15} className="text-ink" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day, idx) => {
          const dayEntries = entriesOn(timetableEntries, day)
          const count = dayEntries.length
          const isSelected = sameDay(day, selected)
          const isToday = sameDay(day, today)
          const dateStr = toDateStr(day)
          const holiday = academicEvents.find(
            e => e.category === 'holiday' && dateStr >= e.startDate && dateStr <= e.endDate)
          // First/last column tooltips would otherwise render half off-screen
          // pinned to the card's center anchor — pin those two to an edge instead.
          const tipSide = idx === 0 ? 'left-0' : idx === days.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
          return (
            <button
              key={day.toDateString()}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={`${DAYS_FULL[day.getDay()]} ${day.getDate()}, ${count} period${count === 1 ? '' : 's'}${holiday ? `, holiday: ${holiday.title}` : ''}`}
              aria-current={isSelected ? 'date' : undefined}
              className="relative flex flex-col items-center gap-1 py-1.5 rounded-xl active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              style={{
                // A holiday still tints the cell when it's selected/today too —
                // just a plain wash under the navy/dashed styling, not replaced by it.
                // Sunday gets no special tint — just the standard muted/empty
                // treatment any day with nothing scheduled gets, below.
                background: isSelected ? 'var(--navy)' : holiday ? CATEGORY_CELL_TINT.holiday : 'transparent',
                border: isSelected
                  ? '2px solid var(--navy)'
                  : isToday ? '2px dashed rgba(15,23,42,0.28)' : '2px solid transparent',
              }}
            >
              {/* Holiday marker sits on the weekday-initial line, in normal
                  flow — an absolutely-positioned badge here read as a stray
                  icon floating above the cell instead of belonging to it. */}
              <span className="flex items-center gap-[3px]">
                <span
                  className="text-[9px] font-black tracking-wide"
                  style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--ink-faint)' }}
                >
                  {DAY_INITIALS[day.getDay()]}
                </span>
                {holiday && (
                  <span className="group/holiday relative inline-flex">
                    <PartyPopper size={9} style={{ color: isSelected ? '#5eead4' : CATEGORY_META.holiday.color }} />
                    <span
                      className={clsx(
                        'hidden group-hover/holiday:block absolute z-30 top-full mt-1.5 w-max max-w-[170px] px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white shadow-lg pointer-events-none',
                        tipSide,
                      )}
                      style={{ background: 'var(--ink)' }}
                    >
                      {holiday.title}
                    </span>
                  </span>
                )}
              </span>
              <span
                className={clsx('text-[15px] leading-none', isSelected ? 'font-extrabold' : 'font-bold')}
                style={{
                  color: isSelected
                    ? '#fff'
                    : holiday ? CATEGORY_META.holiday.color
                    : count ? 'var(--ink)' : 'var(--ink-faint)',
                }}
              >
                {day.getDate()}
              </span>
              {/* A day with nothing on gets no strip rather than a "0", so the
                  free days read as empty space at a glance. Otherwise one
                  strip per period, so a light Thursday visibly differs from a
                  packed Tuesday without opening either. */}
              {count > 0 ? (
                <span className="group/periods relative inline-flex items-center px-1.5 -mx-1.5 py-1 -my-1">
                  <span className="flex items-center gap-[2px] flex-wrap justify-center max-w-[34px]">
                    {Array.from({ length: count }).map((_, i) => (
                      <span
                        key={i}
                        className="w-[3px] h-1.5 rounded-full"
                        style={{ background: isSelected ? 'rgba(255,255,255,0.85)' : 'var(--forest)' }}
                      />
                    ))}
                  </span>
                  <span
                    className={clsx(
                      'hidden group-hover/periods:block absolute z-30 top-full mt-1.5 w-max max-w-[220px] rounded-xl p-2.5 text-left shadow-lg pointer-events-none',
                      tipSide,
                    )}
                    style={{ background: '#fff', border: '2px solid var(--card-border)' }}
                  >
                    <p className="text-[10px] font-black text-ink-faint uppercase tracking-wide mb-1.5">
                      {count} period{count === 1 ? '' : 's'}
                    </p>
                    <div className="space-y-1">
                      {dayEntries.map(e => (
                        <p key={e.id} className="text-[11px] font-semibold text-ink whitespace-nowrap">
                          {e.startTime}–{e.endTime}
                          <span className="text-ink-soft"> · {e.label ?? classNameFor(e.classId)} · {classNameFor(e.classId)}</span>
                        </p>
                      ))}
                    </div>
                  </span>
                </span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'transparent' }} />
              )}
            </button>
          )
        })}
      </div>

      {progress.total > 0 && (
        <div className="mt-4">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(15,23,42,0.10)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: 'var(--forest)' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
