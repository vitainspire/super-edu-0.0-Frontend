'use client'
import { CalendarDays } from '@/components/ui/icons'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DAY_INITIALS, weekDates, entriesOn, sameDay, addDays, weekProgress,
} from '@/lib/logic/weekPlan'
import type { SyllabusTopic, TimetableEntry } from '@/lib/types'
import clsx from 'clsx'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_FULL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

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
}: {
  timetableEntries: TimetableEntry[]
  syllabusTopics: SyllabusTopic[]
  selected: Date
  onSelect: (date: Date) => void
  academicYearStart?: string
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
            <CalendarDays size={15} className="text-ink-faint shrink-0" />
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
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white active:scale-90 transition-transform"
            style={{ border: '2px solid var(--card-border)' }}
          >
            <ChevronLeft size={15} className="text-ink" />
          </button>
          <button
            type="button"
            onClick={() => onSelect(addDays(selected, 7))}
            aria-label="Next week"
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white active:scale-90 transition-transform"
            style={{ border: '2px solid var(--card-border)' }}
          >
            <ChevronRight size={15} className="text-ink" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map(day => {
          const count = entriesOn(timetableEntries, day).length
          const isSelected = sameDay(day, selected)
          const isToday = sameDay(day, today)
          return (
            <button
              key={day.toDateString()}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={`${DAYS_FULL[day.getDay()]} ${day.getDate()}, ${count} period${count === 1 ? '' : 's'}`}
              aria-current={isSelected ? 'date' : undefined}
              className="flex flex-col items-center gap-1 py-1.5 rounded-2xl active:scale-95 transition-transform"
              style={{
                background: isSelected ? 'var(--ink)' : 'transparent',
                border: isSelected
                  ? '2px solid var(--card-border)'
                  : isToday ? '2px dashed rgba(58,44,30,0.28)' : '2px solid transparent',
              }}
            >
              <span
                className="text-[9px] font-black tracking-wide"
                style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--ink-faint)' }}
              >
                {DAY_INITIALS[day.getDay()]}
              </span>
              <span
                className={clsx('text-[15px] leading-none', isSelected ? 'font-extrabold' : 'font-bold')}
                style={{ color: isSelected ? '#fff' : count ? 'var(--ink)' : 'var(--ink-faint)' }}
              >
                {day.getDate()}
              </span>
              {/* A day with nothing on gets no dot rather than a "0", so the
                  free days read as empty space at a glance. */}
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: count
                    ? (isSelected ? 'rgba(255,255,255,0.85)' : 'var(--forest)')
                    : 'transparent',
                }}
              />
            </button>
          )
        })}
      </div>

      {progress.total > 0 && (
        <div className="mt-4">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(58,44,30,0.10)' }}>
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
