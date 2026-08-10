'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import { BookOpenCheck, Repeat } from 'lucide-react'
import { CalendarDays, ClipboardList, Sparkles } from '@/components/ui/icons'
import type { TimetableEntry } from '@/lib/types'
import PrepMaterialModal from '@/components/timetable/PrepMaterialModal'
import SubstituteBanner from '@/components/timetable/SubstituteBanner'
import CoveringPeriods from '@/components/timetable/CoveringPeriods'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'

function todayDayNum() {
  const d = new Date().getDay()
  return d === 0 ? 0 : d
}

// Tolerant of a missing time: a covering period reads its times off the absent
// teacher's timetable row, and that row can have been deleted since the cover
// was assigned. Such an entry sorts to the end of the day rather than throwing.
function toMinutes(t?: string) {
  if (!t) return Number.MAX_SAFE_INTEGER
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

// A period handed to a substitute stays on the grid — the teacher should be able
// to see what happened to their class — but greyed, since they aren't teaching it.
const COVERED_AWAY_BG = 'rgba(58,44,30,0.06)'
// Violet marks coverage throughout the portal; SubstituteBanner uses the same pair.
const COVERING_INK = '#31215C'

function CoverageTag({ entry, compact = false }: { entry: TimetableEntry; compact?: boolean }) {
  if (entry.coverage === 'covering') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-black uppercase tracking-wide ${compact ? 'px-1.5 text-[8px]' : 'px-2 py-0.5 text-[9px]'}`}
        style={{ background: 'rgba(255,255,255,0.65)', color: COVERING_INK }}
      >
        <Repeat size={compact ? 8 : 9} /> Covering
      </span>
    )
  }
  if (entry.coverage === 'covered_away') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-black uppercase tracking-wide ${compact ? 'px-1.5 text-[8px]' : 'px-2 py-0.5 text-[9px]'}`}
        style={{
          background: entry.unresolved ? '#FEE2E2' : 'rgba(58,44,30,0.10)',
          color: entry.unresolved ? '#991B1B' : 'var(--ink-soft)',
        }}
      >
        {entry.unresolved ? 'Needs cover' : 'Covered'}
      </span>
    )
  }
  return null
}

export default function TimetablePage() {
  const { timetableEntries, classes, getTaughtTopicToday, getCurrentPeriod } = useApp()
  const router = useRouter()
  const [prepModal, setPrepModal] = useState<{ classId: string; subject: string; grade: string; periodNumber: number } | null>(null)

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

  // Periods this teacher has handed to a substitute are out of the "today"
  // count and out of Up Next — they aren't turning up to them. They stay on the
  // grid below, marked, so the teacher can see who has their class.
  const todayEntries = useMemo(() =>
    timetableEntries
      .filter(e => e.dayOfWeek === todayN && e.coverage !== 'covered_away')
      .sort((a, b) => a.periodNumber - b.periodNumber),
  [timetableEntries, todayN])

  const currentEntry = getCurrentPeriod()
  const nextEntry = useMemo(
    () => currentEntry ? null : (todayEntries.find(e => e.startTime > hhmm) ?? null),
    [currentEntry, todayEntries, hhmm]
  )
  const heroEntry  = currentEntry ?? nextEntry
  const heroIsLive = !!currentEntry

  // A covering period's class may not be in `classes` at all — a fallback cover
  // deliberately gets no class access — so the name resolved by the backend wins.
  function getClassName(entry: TimetableEntry) {
    return entry.className ?? classes.find(c => c.id === entry.classId)?.name ?? '—'
  }
  function getSubject(entry: TimetableEntry) {
    return entry.label && entry.label.trim() ? entry.label : getClassName(entry)
  }
  function getSecondary(entry: TimetableEntry) {
    if (entry.coverage === 'covering') return `for ${entry.originalTeacherName ?? 'a colleague'}`
    if (entry.coverage === 'covered_away') {
      return entry.unresolved ? 'No substitute assigned' : `${entry.substituteTeacherName} is covering`
    }
    return entry.label && entry.label.trim() ? getClassName(entry) : null
  }

  // Prep material, students and syllabus sit behind a period only when the
  // teacher actually owns the class. A fallback cover (no subject match) is
  // supervision: the period shows, nothing opens.
  function canOpen(entry: TimetableEntry) {
    if (entry.coverage === 'covered_away') return false
    if (entry.coverage === 'covering') return entry.fullAccess === true
    return true
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

  const coveringForSelectedDay = useMemo(
    () => selectedDayEntries.filter(e => e.coverage === 'covering'),
    [selectedDayEntries]
  )

  function fmtTime(t?: string) {
    if (!t) return '—'
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

        {/* The covers for the day the tabs below are on. The grid also shows
            them in their time slot, but a slot in a grid is a poor place to
            start from when the class isn't one you normally teach — this is
            the way in to its prep material. */}
        <CoveringPeriods
          entries={coveringForSelectedDay}
          title={selectedDay === todayN ? 'Covering Today' : `Covering on ${days[selectedDay - 1] ?? 'that day'}`}
          onOpenPrep={entry => setPrepModal({
            classId: entry.classId,
            subject: entry.label ?? '',
            grade: classes.find(c => c.id === entry.classId)?.grade ?? '',
            periodNumber: entry.periodNumber,
          })}
        />

        {/* Current / next class banner */}
        <div className="rounded-3xl p-5" style={{ background: heroIsLive ? '#AACDEA' : 'rgba(58,44,30,0.06)', border: '2px solid var(--card-border)' }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: heroIsLive ? '#1E3A55' : 'var(--ink-soft)' }}>
            {heroIsLive ? 'Current Class' : heroEntry ? 'Up Next' : 'No Class Right Now'}
          </p>
          {heroEntry ? (
            <>
              {heroEntry.coverage === 'covering' && (
                <div className="mb-1.5"><CoverageTag entry={heroEntry} /></div>
              )}
              <p className="font-display font-bold text-xl leading-tight" style={{ color: heroIsLive ? '#1E3A55' : 'var(--ink)' }}>
                {getSubject(heroEntry)}{getSecondary(heroEntry) ? ` - ${getSecondary(heroEntry)}` : ''}
              </p>
              <p className="text-sm font-medium mt-1" style={{ color: heroIsLive ? '#1E3A55' : 'var(--ink-soft)', opacity: 0.75 }}>
                Period {heroEntry.periodNumber} · {fmtTime(heroEntry.startTime)}–{fmtTime(heroEntry.endTime)}
              </p>
              {canOpen(heroEntry) ? (
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setPrepModal({
                      classId: heroEntry.classId,
                      subject: getSubject(heroEntry),
                      grade: classes.find(c => c.id === heroEntry.classId)?.grade ?? '',
                      periodNumber: heroEntry.periodNumber,
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
              ) : (
                <p className="text-xs font-medium mt-3 rounded-2xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.5)', color: heroIsLive ? '#1E3A55' : 'var(--ink-soft)' }}>
                  Supervision cover — {getSubject(heroEntry)} isn&apos;t one of your subjects, so class materials stay with the regular teacher.
                </p>
              )}
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
              const handedOver = entry.coverage === 'covered_away'
              const color      = colorForKey(getSubject(entry))
              const subject    = getSubject(entry)
              const secondary  = getSecondary(entry)
              const taught     = isToday && !handedOver ? getTaughtTopicToday(entry.classId) : null
              const tappable   = isToday && canOpen(entry)
              const ink        = handedOver ? 'var(--ink-soft)' : (isToday ? color.ink : 'var(--ink-soft)')

              return (
                <button
                  key={entry.id}
                  disabled={!tappable}
                  onClick={() => tappable && setPrepModal({
                    classId: entry.classId,
                    subject,
                    grade: classes.find(c => c.id === entry.classId)?.grade ?? '',
                    periodNumber: entry.periodNumber,
                  })}
                  className={`w-full flex items-center gap-3 text-left rounded-2xl px-3 py-2.5 transition-transform ${tappable ? 'active:scale-[0.98] cursor-pointer' : 'cursor-default'}`}
                  style={{
                    background: handedOver ? COVERED_AWAY_BG : (isToday ? color.bg : 'rgba(58,44,30,0.06)'),
                    border: '2px solid var(--card-border)',
                    borderStyle: handedOver ? 'dashed' : 'solid',
                    opacity: isToday ? 1 : 0.85,
                  }}
                >
                  <p className="shrink-0 text-[11px] font-bold leading-tight text-right" style={{ width: 54, color: ink }}>
                    {fmtTime(entry.startTime)}
                  </p>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p
                        className="text-sm font-bold truncate"
                        style={{ color: ink, textDecoration: handedOver ? 'line-through' : undefined }}
                      >
                        {subject}
                      </p>
                      <CoverageTag entry={entry} />
                    </div>
                    {secondary && (
                      <p className="text-xs font-medium truncate" style={{ color: ink, opacity: 0.75 }}>{secondary}</p>
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
                      const handedOver = entry.coverage === 'covered_away'
                      const color     = colorForKey(getSubject(entry))
                      const subject   = getSubject(entry)
                      const secondary = getSecondary(entry)
                      const taught    = isToday && !handedOver ? getTaughtTopicToday(entry.classId) : null
                      const tappable  = isToday && canOpen(entry)
                      const ink       = handedOver ? 'var(--ink-soft)' : (isToday ? color.ink : 'var(--ink-soft)')

                      return (
                        <button
                          key={entry.id}
                          disabled={!tappable}
                          onClick={() => tappable && setPrepModal({
                            classId: entry.classId,
                            subject,
                            grade: classes.find(c => c.id === entry.classId)?.grade ?? '',
                            periodNumber: entry.periodNumber,
                          })}
                          className={`absolute text-left rounded-xl px-2 py-1.5 overflow-hidden transition-transform ${tappable ? 'active:scale-[0.97] cursor-pointer' : 'cursor-default'}`}
                          style={{
                            top, height,
                            left:  `calc(${col * colPct}% + 2px)`,
                            width: `calc(${colPct}% - 4px)`,
                            background: handedOver ? COVERED_AWAY_BG : (isToday ? color.bg : 'rgba(58,44,30,0.08)'),
                            border: '2px solid var(--card-border)',
                            borderStyle: handedOver ? 'dashed' : 'solid',
                            opacity: isToday ? 1 : 0.8,
                          }}
                        >
                          {taught && (
                            <span className="absolute top-1 right-1 flex items-center justify-center rounded-full"
                              style={{ width: 14, height: 14, background: isToday ? color.ink : 'var(--ink-faint)' }}>
                              <BookOpenCheck size={9} className="text-white" />
                            </span>
                          )}
                          <p
                            className="text-xs font-bold truncate leading-tight"
                            style={{ color: ink, textDecoration: handedOver ? 'line-through' : undefined }}
                          >
                            {subject}
                          </p>
                          {entry.coverage && entry.coverage !== 'regular' && (
                            <div className="mt-0.5"><CoverageTag entry={entry} compact /></div>
                          )}
                          {secondary && height > 56 && (
                            <p className="text-[10px] font-medium truncate" style={{ color: ink, opacity: 0.75 }}>{secondary}</p>
                          )}
                          {height > 72 && (
                            <p className="text-[10px] font-medium truncate" style={{ color: ink, opacity: 0.6 }}>{fmtTime(entry.startTime)}</p>
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
        periodNumber={prepModal?.periodNumber}
      />
    </div>
  )
}
