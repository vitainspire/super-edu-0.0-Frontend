'use client'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, PartyPopper, ClipboardList, BookOpenCheck } from 'lucide-react'
import type { AcademicEvent } from '@/lib/types'
import { CATEGORY_META, HOLIDAY_SUBTYPE_META } from '@/lib/academic-calendar'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'
import MonthCalendarGrid from '@/components/calendar/MonthCalendarGrid'

const CATEGORY_ICON: Record<AcademicEvent['category'], typeof CalendarDays> = {
  holiday: PartyPopper,
  exam: ClipboardList,
  term: BookOpenCheck,
}

function formatRange(a: AcademicEvent) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  const start = new Date(a.startDate + 'T00:00:00').toLocaleDateString('en-IN', opts)
  if (a.startDate === a.endDate) return start
  const end = new Date(a.endDate + 'T00:00:00').toLocaleDateString('en-IN', opts)
  return `${start} – ${end}`
}

export default function TeacherAcademicCalendarPage() {
  const [events, setEvents] = useState<AcademicEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear]   = useState(new Date().getFullYear())

  useEffect(() => {
    fetch('/api/teacher/academic-calendar')
      .then(r => r.json())
      .then(d => setEvents(d.events ?? []))
      .finally(() => setLoading(false))
  }, [])

  // The whole-year "Academic Year" event would show a chip on every single
  // day in the grid — exclude it, and instead surface it as the calendar's
  // subtitle so it's still visible at a glance.
  const academicYearEvent = useMemo(() => events.find(e => e.category === 'term' && e.title === 'Academic Year'), [events])
  const displayEvents = useMemo(() => events.filter(e => e.id !== academicYearEvent?.id), [events, academicYearEvent])

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return displayEvents.filter(e => e.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))
  }, [displayEvents])

  return (
    <div className="paper-page pb-28">
      <PageHeader
        eyebrow="From Your School"
        title="Academic Calendar"
        subtitle={loading ? 'Loading…' : academicYearEvent ? `Academic Year: ${formatRange(academicYearEvent)}` : 'Holidays, exams, and term dates'}
      />

      <div className="px-4 pt-2 space-y-4 relative z-10">
        {loading ? (
          <div className="paper-card p-8 text-center">
            <div className="w-8 h-8 border-4 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'rgba(58,44,30,0.15)', borderTopColor: 'var(--ink)' }} />
            <p className="text-sm text-ink-soft">Loading calendar…</p>
          </div>
        ) : events.length === 0 ? (
          <div className="paper-card p-10 text-center">
            <Sticker tone="cream" size={72} radius={999} style={{ margin: '0 auto 16px' }}>
              <CalendarDays size={30} className="text-ink-soft" />
            </Sticker>
            <p className="font-display font-bold text-ink text-lg">Nothing published yet</p>
            <p className="text-sm text-ink-soft mt-1">Your school admin hasn&apos;t published this year&apos;s calendar yet — check back soon.</p>
          </div>
        ) : (
          <>
            <MonthCalendarGrid
              year={calYear}
              month={calMonth}
              events={displayEvents}
              yearRange={academicYearEvent ? { start: academicYearEvent.startDate, end: academicYearEvent.endDate, label: 'the Academic Year' } : undefined}
              onPrevMonth={() => { const m = calMonth - 1; if (m < 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m) }}
              onNextMonth={() => { const m = calMonth + 1; if (m > 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m) }}
            />

            <div>
              <p className="text-xs font-black text-ink-soft uppercase tracking-widest mb-2 px-1">Upcoming</p>
              {upcoming.length === 0 ? (
                <p className="text-sm text-ink-soft px-1">Nothing else on the calendar right now.</p>
              ) : (
                <div className="space-y-3">
                  {upcoming.map(a => {
                    const meta = CATEGORY_META[a.category]
                    const Icon = CATEGORY_ICON[a.category]
                    return (
                      <div key={a.id} className="paper-card p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
                            <Icon size={16} style={{ color: meta.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-ink text-sm">{a.title}</p>
                              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>
                                {meta.label}
                              </span>
                              {a.category === 'holiday' && a.holidaySubtype && (
                                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-ink-soft" style={{ background: 'rgba(58,44,30,0.06)' }}>
                                  {HOLIDAY_SUBTYPE_META[a.holidaySubtype].label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-ink-soft mt-1 font-semibold">{formatRange(a)}</p>
                            {a.description && <p className="text-sm text-ink mt-1.5 leading-relaxed whitespace-pre-wrap">{a.description}</p>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
