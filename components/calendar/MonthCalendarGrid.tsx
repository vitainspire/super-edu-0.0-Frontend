'use client'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { AcademicEvent } from '@/lib/types'
import { CATEGORY_META, CATEGORY_CELL_TINT } from '@/lib/academic-calendar'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Priority for which category "wins" the whole-cell tint when a day has
// more than one event on it — holidays are the thing admins scan for most.
const CATEGORY_PRIORITY: AcademicEvent['category'][] = ['holiday', 'exam', 'term']

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function eventsOnDay(events: AcademicEvent[], dateStr: string) {
  return events.filter(e => dateStr >= e.startDate && dateStr <= e.endDate)
}

interface MonthCalendarGridProps {
  year: number
  month: number // 0-11
  events: AcademicEvent[]
  onPrevMonth: () => void
  onNextMonth: () => void
  onDayClick?: (dateStr: string) => void
  onEventClick?: (event: AcademicEvent) => void
  /** Dim events that aren't published yet, with a small "Draft" tag — admin view only. */
  showDraftBadge?: boolean
  /** Dims days outside the school's Academic Year, and notes it if the whole visible month falls outside it. */
  yearRange?: { start: string; end: string; label?: string }
}

// Reusable Sun–Sat month grid, shared by the admin calendar editor and the
// teacher read-only calendar so both surfaces render events identically.
export default function MonthCalendarGrid({
  year, month, events, onPrevMonth, onNextMonth, onDayClick, onEventClick, showDraftBadge, yearRange,
}: MonthCalendarGridProps) {
  const firstOfMonth = new Date(Date.UTC(year, month, 1))
  const firstWeekday = firstOfMonth.getUTCDay() // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const todayStr = toDateStr(new Date())

  const cells: Array<{ dateStr: string; day: number; inMonth: boolean }> = []
  // Leading days from the previous month, to fill the first row.
  const prevMonthDays = new Date(Date.UTC(year, month, 0)).getUTCDate()
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1, prevMonthDays - i))
    cells.push({ dateStr: toDateStr(d), day: d.getUTCDate(), inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(year, month, day))
    cells.push({ dateStr: toDateStr(d), day, inMonth: true })
  }
  // Trailing days from the next month, to complete the final row.
  while (cells.length % 7 !== 0) {
    const d = new Date(Date.UTC(year, month, daysInMonth + (cells.length - (firstWeekday + daysInMonth) + 1)))
    cells.push({ dateStr: toDateStr(d), day: d.getUTCDate(), inMonth: false })
  }

  const monthEntirelyOutOfRange = yearRange && cells
    .filter(c => c.inMonth)
    .every(c => c.dateStr < yearRange.start || c.dateStr > yearRange.end)

  return (
    <div className="paper-card p-4">
      <div className="flex items-center justify-between mb-1">
        <button type="button" onClick={onPrevMonth} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
          <ChevronLeft className="w-4 h-4 text-ink-soft" />
        </button>
        <p className="text-sm font-black text-ink">{MONTH_LABELS[month]} {year}</p>
        <button type="button" onClick={onNextMonth} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
          <ChevronRight className="w-4 h-4 text-ink-soft" />
        </button>
      </div>

      {monthEntirelyOutOfRange && (
        <p className="text-[11px] font-semibold text-ink-faint text-center mb-2">
          Outside {yearRange.label ?? 'the Academic Year'} ({formatDate(yearRange.start)} – {formatDate(yearRange.end)})
        </p>
      )}

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map(w => (
          <div key={w} className="text-center text-[10px] font-bold text-ink-faint uppercase tracking-wide py-1">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map(cell => {
          const dayEvents = eventsOnDay(events, cell.dateStr)
          const isToday = cell.dateStr === todayStr
          const outOfRange = !!yearRange && (cell.dateStr < yearRange.start || cell.dateStr > yearRange.end)
          const shown = dayEvents.slice(0, 2)
          const extra = dayEvents.length - shown.length

          const primaryCategory = CATEGORY_PRIORITY.find(cat => dayEvents.some(e => e.category === cat))
          const cellColor = primaryCategory ? CATEGORY_META[primaryCategory].color : null
          const cellBg = primaryCategory ? CATEGORY_CELL_TINT[primaryCategory] : null

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onDayClick?.(cell.dateStr)}
              disabled={!onDayClick}
              className="group relative min-h-[64px] rounded-lg p-1 text-left align-top flex flex-col gap-0.5 transition-colors"
              style={{
                opacity: !cell.inMonth ? 0.35 : outOfRange ? 0.45 : 1,
                background: cellBg ?? (isToday ? 'rgba(58,44,30,0.06)' : 'transparent'),
                border: isToday ? '1.5px solid rgba(58,44,30,0.2)' : '1.5px solid transparent',
                cursor: onDayClick ? 'pointer' : 'default',
              }}
            >
              <span
                className="text-[11px] font-bold px-0.5"
                style={{ color: cellColor ?? 'var(--ink-soft)' }}
              >
                {cell.day}
              </span>
              {shown.map(ev => {
                const meta = CATEGORY_META[ev.category]
                const isDraft = showDraftBadge && !ev.published
                return (
                  <span
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick?.(ev) }}
                    className="text-[9px] font-bold px-1 py-0.5 rounded truncate leading-tight"
                    style={{ background: 'rgba(255,255,255,0.55)', color: meta.color, opacity: isDraft ? 0.55 : 1 }}
                    title={isDraft ? `${ev.title} (draft — not published)` : ev.title}
                  >
                    {isDraft && '· '}{ev.title}
                  </span>
                )
              })}
              {extra > 0 && <span className="text-[9px] font-bold text-ink-faint px-1">+{extra} more</span>}

              {onDayClick && cell.inMonth && dayEvents.length === 0 && (
                <span
                  className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5"
                  style={{ background: 'rgba(58,44,30,0.1)' }}
                >
                  <Plus className="w-3 h-3 text-ink-soft" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
