'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import { CalendarDays, ClipboardList, Sparkles, BookOpenCheck } from 'lucide-react'
import type { TimetableEntry } from '@/lib/types'
import PrepMaterialModal from '@/components/timetable/PrepMaterialModal'
import SubstituteBanner from '@/components/timetable/SubstituteBanner'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'

function todayDayNum() {
  const d = new Date().getDay()
  return d === 0 ? 0 : d
}

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const DAY_COLORS = [
  { bg: '#AAD6A0', ink: '#234A1D' },
  { bg: '#AACDEA', ink: '#1E3A55' },
  { bg: '#F0A491', ink: '#5C2416' },
  { bg: '#C7B7E8', ink: '#31215C' },
  { bg: '#F0AFC6', ink: '#5C1F38' },
  { bg: '#EAC968', ink: '#4A3809' },
]
function colorForKey(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return DAY_COLORS[hash % DAY_COLORS.length]
}

// Groups same-time entries so they render side-by-side instead of stacking on top of each other
function layoutDayEvents(entries: TimetableEntry[]) {
  const sorted = [...entries].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
  const clusters: TimetableEntry[][] = []
  let cluster: TimetableEntry[] = []
  let clusterEnd = -1

  for (const e of sorted) {
    const start = toMinutes(e.startTime)
    const end   = toMinutes(e.endTime)
    if (cluster.length === 0 || start < clusterEnd) {
      cluster.push(e)
      clusterEnd = Math.max(clusterEnd, end)
    } else {
      clusters.push(cluster)
      cluster = [e]
      clusterEnd = end
    }
  }
  if (cluster.length) clusters.push(cluster)

  const laidOut: { entry: TimetableEntry; col: number; cols: number }[] = []
  for (const group of clusters) {
    const colEnds: number[] = []
    const colByEntry = new Map<string, number>()
    for (const e of group) {
      const start = toMinutes(e.startTime)
      const end   = toMinutes(e.endTime)
      let col = colEnds.findIndex(endTime => endTime <= start)
      if (col === -1) { col = colEnds.length; colEnds.push(end) }
      else colEnds[col] = end
      colByEntry.set(e.id, col)
    }
    const cols = colEnds.length
    for (const e of group) laidOut.push({ entry: e, col: colByEntry.get(e.id)!, cols })
  }
  return laidOut
}

const PX_PER_MIN = 1.3

export default function TimetablePage() {
  const { timetableEntries, classes, getTaughtTopicToday, getCurrentPeriod } = useApp()
  const router = useRouter()
  const [prepModal, setPrepModal] = useState<{ classId: string; subject: string; grade: string } | null>(null)

  const hhmm   = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
  const todayN = todayDayNum()

  // Show a Saturday column/tab only when the school's published timetable actually has one —
  // avoids hardcoding a 5-day week when a school runs 6 days.
  const days = useMemo(
    () => timetableEntries.some(e => e.dayOfWeek === 6)
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    [timetableEntries]
  )

  const [selectedDay, setSelectedDay] = useState(todayN >= 1 && todayN <= days.length ? todayN : 1)

  const todayEntries = useMemo(() =>
    timetableEntries.filter(e => e.dayOfWeek === todayN).sort((a, b) => a.periodNumber - b.periodNumber),
  [timetableEntries, todayN])

  const currentEntry = getCurrentPeriod()
  const nextEntry = useMemo(
    () => currentEntry ? null : (todayEntries.find(e => e.startTime > hhmm) ?? null),
    [currentEntry, todayEntries, hhmm]
  )
  const heroEntry  = currentEntry ?? nextEntry
  const heroIsLive = !!currentEntry

  function getClassName(classId: string) { return classes.find(c => c.id === classId)?.name ?? '—' }
  function getSubject(entry: { classId: string; label?: string }) {
    return entry.label && entry.label.trim() ? entry.label : getClassName(entry.classId)
  }
  function getSecondary(entry: { classId: string; label?: string }) {
    return entry.label && entry.label.trim() ? getClassName(entry.classId) : null
  }

  const { dayStartMin, dayEndMin } = useMemo(() => {
    const weekdayEntries = timetableEntries.filter(e => e.dayOfWeek >= 1 && e.dayOfWeek <= 6)
    if (weekdayEntries.length === 0) return { dayStartMin: 8 * 60, dayEndMin: 15 * 60 }
    const starts = weekdayEntries.map(e => toMinutes(e.startTime))
    const ends   = weekdayEntries.map(e => toMinutes(e.endTime))
    return {
      dayStartMin: Math.floor(Math.min(...starts) / 60) * 60,
      dayEndMin:   Math.ceil(Math.max(...ends) / 60) * 60,
    }
  }, [timetableEntries])

  const gridHeight = Math.max((dayEndMin - dayStartMin) * PX_PER_MIN, 320)

  const selectedDayEntries = useMemo(
    () => timetableEntries
      .filter(e => e.dayOfWeek === selectedDay)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)),
    [timetableEntries, selectedDay]
  )

  function fmtTime(t: string) {
    const [h, m] = t.split(':').map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  if (timetableEntries.length === 0) {
    return (
      <div className="paper-page flex flex-col items-center justify-center px-6 text-center pb-28" style={{ minHeight: '100vh' }}>
        <Sticker tone="blue" size={72} radius={22} style={{ marginBottom: 20 }}>
          <CalendarDays size={30} style={{ color: '#1E3A55' }} />
        </Sticker>
        <h2 className="font-display font-bold text-ink text-xl mb-2">No Timetable Yet</h2>
        <p className="text-sm text-ink-soft max-w-xs leading-relaxed">
          Your school admin hasn&apos;t published your timetable yet. Once they do, your full weekly schedule will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="paper-page pb-28">
      <PageHeader
        title="Weekly Timetable"
        subtitle={todayEntries.length > 0 ? `${todayEntries.length} class${todayEntries.length !== 1 ? 'es' : ''} today` : 'No classes scheduled today'}
      />

      <div className="px-4 md:px-6 relative z-10 space-y-4">

        <SubstituteBanner />

        {/* Current / next class banner */}
        <div className="rounded-3xl p-5" style={{ background: heroIsLive ? '#AACDEA' : 'rgba(58,44,30,0.06)', border: '2px solid rgba(58,44,30,0.12)' }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: heroIsLive ? '#1E3A55' : 'var(--ink-soft)' }}>
            {heroIsLive ? 'Current Class' : heroEntry ? 'Up Next' : 'No Class Right Now'}
          </p>
          {heroEntry ? (
            <>
              <p className="font-display font-bold text-xl leading-tight" style={{ color: heroIsLive ? '#1E3A55' : 'var(--ink)' }}>
                {getSubject(heroEntry)}{getSecondary(heroEntry) ? ` - ${getSecondary(heroEntry)}` : ''}
              </p>
              <p className="text-sm font-medium mt-1" style={{ color: heroIsLive ? '#1E3A55' : 'var(--ink-soft)', opacity: 0.75 }}>
                Period {heroEntry.periodNumber} · {fmtTime(heroEntry.startTime)}–{fmtTime(heroEntry.endTime)}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setPrepModal({
                    classId: heroEntry.classId,
                    subject: getSubject(heroEntry),
                    grade: classes.find(c => c.id === heroEntry.classId)?.grade ?? '',
                  })}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold active:scale-95 transition-all"
                  style={{ background: 'rgba(255,255,255,0.6)', color: heroIsLive ? '#1E3A55' : 'var(--ink)' }}
                >
                  <Sparkles size={13} /> Prep Material
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/classes/${heroEntry.classId}/attendance`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all"
                  style={{ background: 'var(--ink)' }}
                >
                  <ClipboardList size={13} /> Take Attendance
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm font-medium text-ink-soft">No more classes scheduled today.</p>
          )}
        </div>

        {/* Weekly grid — mobile: single-day agenda (no horizontal scroll); desktop: Mon–Fri columns */}
        <div className="paper-card p-3 md:p-4">

          {/* Mobile day tabs */}
          <div className="flex md:hidden gap-1.5 mb-3">
            {days.map((day, i) => {
              const dayNum     = i + 1
              const isToday    = dayNum === todayN
              const isSelected = dayNum === selectedDay
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(dayNum)}
                  className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-bold transition-colors"
                  style={{
                    background: isSelected ? 'var(--ink)' : 'rgba(58,44,30,0.06)',
                    color: isSelected ? '#fff' : 'var(--ink-soft)',
                  }}
                >
                  {day}
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: isToday ? (isSelected ? '#fff' : 'var(--ink)') : 'transparent' }} />
                </button>
              )
            })}
          </div>

          {/* Mobile agenda for the selected day */}
          <div className="md:hidden space-y-2">
            {selectedDayEntries.length === 0 ? (
              <p className="text-sm text-ink-faint text-center py-8">No classes scheduled.</p>
            ) : selectedDayEntries.map(entry => {
              const isToday    = selectedDay === todayN
              const color      = colorForKey(getSubject(entry))
              const subject    = getSubject(entry)
              const secondary  = getSecondary(entry)
              const taught     = isToday ? getTaughtTopicToday(entry.classId) : null

              return (
                <button
                  key={entry.id}
                  disabled={!isToday}
                  onClick={() => isToday && setPrepModal({
                    classId: entry.classId,
                    subject,
                    grade: classes.find(c => c.id === entry.classId)?.grade ?? '',
                  })}
                  className={`w-full flex items-center gap-3 text-left rounded-2xl px-3 py-2.5 transition-transform ${isToday ? 'active:scale-[0.98] cursor-pointer' : 'cursor-default'}`}
                  style={{
                    background: isToday ? color.bg : 'rgba(58,44,30,0.06)',
                    border: '1.5px solid rgba(58,44,30,0.12)',
                    opacity: isToday ? 1 : 0.85,
                  }}
                >
                  <p className="shrink-0 text-[11px] font-bold leading-tight text-right" style={{ width: 54, color: isToday ? color.ink : 'var(--ink-soft)' }}>
                    {fmtTime(entry.startTime)}
                  </p>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: isToday ? color.ink : 'var(--ink-soft)' }}>{subject}</p>
                    {secondary && (
                      <p className="text-xs font-medium truncate" style={{ color: isToday ? color.ink : 'var(--ink-soft)', opacity: 0.75 }}>{secondary}</p>
                    )}
                  </div>
                  {taught && (
                    <span className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 20, height: 20, background: isToday ? color.ink : 'var(--ink-faint)' }}>
                      <BookOpenCheck size={11} className="text-white" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Desktop: weekly columns (5 or 6 depending on the school), stacked period cards */}
          <div className="hidden md:flex">
            {days.map((day, i) => {
              const dayNum   = i + 1
              const isToday  = dayNum === todayN
              const dayEntries = layoutDayEvents(timetableEntries.filter(e => e.dayOfWeek === dayNum))

              return (
                <div key={day} className="flex-1 px-1">
                  <div className="text-center mb-2">
                    <p className="text-sm font-display font-bold" style={{ color: isToday ? 'var(--ink)' : 'var(--ink-soft)' }}>{day}</p>
                    {isToday && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-black text-white" style={{ background: 'var(--ink)' }}>
                        TODAY
                      </span>
                    )}
                  </div>
                  <div className="relative rounded-2xl" style={{ height: gridHeight, background: 'rgba(58,44,30,0.03)' }}>
                    {dayEntries.map(({ entry, col, cols }) => {
                      const rawTop    = (toMinutes(entry.startTime) - dayStartMin) * PX_PER_MIN
                      const rawHeight = Math.max((toMinutes(entry.endTime) - toMinutes(entry.startTime)) * PX_PER_MIN, 46)
                      const top       = Math.max(rawTop, 0) + 3
                      const height    = rawHeight - 6
                      const colPct    = 100 / cols
                      const color     = colorForKey(getSubject(entry))
                      const subject   = getSubject(entry)
                      const secondary = getSecondary(entry)
                      const taught    = isToday ? getTaughtTopicToday(entry.classId) : null

                      return (
                        <button
                          key={entry.id}
                          disabled={!isToday}
                          onClick={() => isToday && setPrepModal({
                            classId: entry.classId,
                            subject,
                            grade: classes.find(c => c.id === entry.classId)?.grade ?? '',
                          })}
                          className={`absolute text-left rounded-xl px-2 py-1.5 overflow-hidden transition-transform ${isToday ? 'active:scale-[0.97] cursor-pointer' : 'cursor-default'}`}
                          style={{
                            top, height,
                            left:  `calc(${col * colPct}% + 2px)`,
                            width: `calc(${colPct}% - 4px)`,
                            background: isToday ? color.bg : 'rgba(58,44,30,0.08)',
                            border: '1.5px solid rgba(58,44,30,0.15)',
                            opacity: isToday ? 1 : 0.8,
                          }}
                        >
                          {taught && (
                            <span className="absolute top-1 right-1 flex items-center justify-center rounded-full"
                              style={{ width: 14, height: 14, background: isToday ? color.ink : 'var(--ink-faint)' }}>
                              <BookOpenCheck size={9} className="text-white" />
                            </span>
                          )}
                          <p className="text-xs font-bold truncate leading-tight" style={{ color: isToday ? color.ink : 'var(--ink-soft)' }}>{subject}</p>
                          {secondary && height > 40 && (
                            <p className="text-[10px] font-medium truncate" style={{ color: isToday ? color.ink : 'var(--ink-soft)', opacity: 0.75 }}>{secondary}</p>
                          )}
                          {height > 56 && (
                            <p className="text-[10px] font-medium truncate" style={{ color: isToday ? color.ink : 'var(--ink-soft)', opacity: 0.6 }}>{fmtTime(entry.startTime)}</p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-xs text-ink-faint text-center pb-2">Tap today&apos;s classes to open prep material — other days are view-only</p>
      </div>

      <PrepMaterialModal
        open={!!prepModal}
        onClose={() => setPrepModal(null)}
        classId={prepModal?.classId ?? ''}
        subject={prepModal?.subject ?? ''}
        grade={prepModal?.grade ?? ''}
      />
    </div>
  )
}
