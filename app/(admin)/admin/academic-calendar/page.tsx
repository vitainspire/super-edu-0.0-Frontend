'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { CalendarDays, PartyPopper, ClipboardList, BookOpenCheck, Trash2, Pencil, Loader2, Plus, Sparkles, Clock, GraduationCap, CalendarPlus, Rows3, LayoutGrid, UploadCloud, CheckCircle2 } from 'lucide-react'
import type { AcademicEvent, SchoolSchedule } from '@/lib/types'
import { computeWorkingCapacity, SIX_DAY_WEEK, FIVE_DAY_WEEK, CATEGORY_META, HOLIDAY_SUBTYPE_META, yearsSpanned } from '@/lib/academic-calendar'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'
import Modal from '@/components/ui/Modal'
import ExamPlanEditor from '@/components/admin/ExamPlanEditor'
import MonthCalendarGrid from '@/components/calendar/MonthCalendarGrid'

// Reserved title — this is the one "the" academic year, distinct from any
// other 'term' events an admin might add through the generic event form.
const ACADEMIC_YEAR_TITLE = 'Academic Year'

interface CreateForm {
  title: string
  category: AcademicEvent['category']
  holidaySubtype: NonNullable<AcademicEvent['holidaySubtype']>
  countsAsNonWorking: boolean
  startDate: string
  endDate: string
  description: string
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function plusDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}
function emptyForm(): CreateForm {
  return {
    title: '', category: 'holiday', holidaySubtype: 'public', countsAsNonWorking: true,
    startDate: todayStr(), endDate: todayStr(), description: '',
  }
}
function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// CATEGORY_META/HOLIDAY_SUBTYPE_META (label/color) come from lib/academic-calendar
// so this page and the teacher-facing calendar render events identically.
// Icons are page-local since lucide components can't live in a plain-data lib module.
const CATEGORY_ICON: Record<AcademicEvent['category'], typeof CalendarDays> = {
  holiday: PartyPopper,
  exam: ClipboardList,
  term: BookOpenCheck,
}

export default function AcademicCalendarPage() {
  const { school } = useAdmin()
  const [events, setEvents]     = useState<AcademicEvent[]>([])
  const [schedule, setSchedule] = useState<SchoolSchedule | null>(null)
  const [loading, setLoading]   = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState<CreateForm>(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating]   = useState(false)
  const [createError, setCreateError] = useState('')

  // List vs. visual month-grid view — same underlying events, just a different lens.
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar')
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear]   = useState(new Date().getFullYear())

  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState('')

  const [seedYear, setSeedYear] = useState(new Date().getFullYear())
  const [seeding, setSeeding]   = useState(false)
  const [seedMsg, setSeedMsg]   = useState('')
  const [suggestedFestivals, setSuggestedFestivals] = useState<{ title: string; date: string }[]>([])
  const [addingFestival, setAddingFestival] = useState<string | null>(null)

  // Academic Year card — start/end of the whole year, kept separate from the
  // generic event list so it's impossible to miss.
  const [ayStart, setAyStart] = useState(todayStr())
  const [ayEnd, setAyEnd]     = useState(todayStr())
  const [savingYear, setSavingYear] = useState(false)

  // Working week — many Indian schools run 6-day weeks, plenty run 5.
  // Only affects this page's own capacity math (see note in lib/academic-calendar.ts).
  const [sixDayWeek, setSixDayWeek] = useState(true)

  function load() {
    if (!school) { setLoading(false); return }
    Promise.all([
      fetch(`/api/admin/schools/${school.id}/academic-events`).then(r => r.json()),
      fetch(`/api/admin/schools/${school.id}/schedule`).then(r => r.json()),
    ]).then(([ev, sc]) => {
      setEvents(ev.events ?? [])
      setSchedule(sc.schedule ?? null)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [school])

  const academicYearEvent = useMemo(
    () => events.find(e => e.category === 'term' && e.title === ACADEMIC_YEAR_TITLE),
    [events]
  )

  // Pre-fill the Academic Year form once it's loaded from the server.
  useEffect(() => {
    if (academicYearEvent) {
      setAyStart(academicYearEvent.startDate)
      setAyEnd(academicYearEvent.endDate)
    }
  }, [academicYearEvent])

  async function saveAcademicYear() {
    if (!school) return
    setSavingYear(true)
    await fetch(`/api/admin/schools/${school.id}/academic-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: academicYearEvent?.id,
        title: ACADEMIC_YEAR_TITLE,
        category: 'term',
        startDate: ayStart,
        endDate: ayEnd,
      }),
    })
    setSavingYear(false)
    load()
  }

  // Working-capacity window: the Academic Year, if set — otherwise the active
  // 'term' event covering today (e.g. a specific term someone added directly)
  // — otherwise a rolling 90-day default.
  const capacityRange = useMemo(() => {
    if (academicYearEvent) return { startDate: academicYearEvent.startDate, endDate: academicYearEvent.endDate, label: 'Academic Year' }
    const today = todayStr()
    const activeTerm = events.find(e => e.category === 'term' && e.startDate <= today && today <= e.endDate)
    if (activeTerm) return { startDate: activeTerm.startDate, endDate: activeTerm.endDate, label: activeTerm.title }
    return { startDate: today, endDate: plusDays(today, 90), label: 'Next 90 days' }
  }, [events, academicYearEvent])

  const capacity = useMemo(() => {
    if (!schedule) return null
    const periodSlots = schedule.slots.filter(s => s.type === 'period')
    if (periodSlots.length === 0) return null
    const avgMins = periodSlots.reduce((sum, s) => sum + (timeToMins(s.endTime) - timeToMins(s.startTime)), 0) / periodSlots.length
    return computeWorkingCapacity(
      capacityRange.startDate, capacityRange.endDate, events, periodSlots.length, avgMins,
      sixDayWeek ? SIX_DAY_WEEK : FIVE_DAY_WEEK,
    )
  }, [schedule, events, capacityRange, sixDayWeek])

  const draftCount = useMemo(() => events.filter(e => !e.published).length, [events])

  // The Academic Year event has its own dedicated card above — showing it again
  // in the list/calendar would mean a chip on literally every day of the year.
  const displayEvents = useMemo(
    () => events.filter(e => e.id !== academicYearEvent?.id),
    [events, academicYearEvent]
  )

  async function removeEvent(id: string) {
    if (!school) return
    if (!confirm('Delete this event?')) return
    setRemoving(id)
    await fetch(`/api/admin/schools/${school.id}/academic-events`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setRemoving(null)
    load()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!school) return
    setCreateError('')
    setCreating(true)
    const res = await fetch(`/api/admin/schools/${school.id}/academic-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { setCreateError(data.error ?? 'Failed to save event.'); return }
    closeModal()
    load()
  }

  function openEdit(a: AcademicEvent) {
    setEditingId(a.id)
    setForm({
      title: a.title,
      category: a.category,
      holidaySubtype: a.holidaySubtype ?? 'public',
      countsAsNonWorking: a.countsAsNonWorking,
      startDate: a.startDate,
      endDate: a.endDate,
      description: a.description ?? '',
    })
    setCreateError('')
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(emptyForm())
    setCreateError('')
  }

  async function publishCalendar() {
    if (!school) return
    if (!confirm('Publish the current calendar? Every draft event will become visible to teachers.')) return
    setPublishing(true)
    setPublishMsg('')
    const res = await fetch(`/api/admin/schools/${school.id}/academic-events/publish`, { method: 'POST' })
    const data = await res.json()
    setPublishing(false)
    if (!res.ok) { setPublishMsg(data.error ?? 'Failed to publish.'); return }
    setPublishMsg(data.publishedCount > 0 ? `Published ${data.publishedCount} event${data.publishedCount === 1 ? '' : 's'} to teachers.` : 'Everything was already published.')
    load()
  }

  // date-holidays computes one calendar year at a time, but an academic year
  // (e.g. June 2026 → March 2027) spans two — seed every calendar year the
  // Academic Year touches in one action, so nothing between Jan–Mar of the
  // second year gets silently missed.
  const seedYears = academicYearEvent ? yearsSpanned(academicYearEvent.startDate, academicYearEvent.endDate) : [seedYear]

  async function seedHolidays() {
    if (!school) return
    setSeeding(true)
    setSeedMsg('')

    let totalCreated = 0
    let totalSkipped = 0
    const allSuggested: { title: string; date: string }[] = []

    for (const year of seedYears) {
      const res = await fetch(`/api/admin/schools/${school.id}/academic-events/seed-holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      })
      const data = await res.json()
      if (!res.ok) { setSeeding(false); setSeedMsg(data.error ?? `Failed to seed holidays for ${year}.`); return }
      totalCreated += data.created?.length ?? 0
      totalSkipped += data.skipped ?? 0
      allSuggested.push(...(data.suggested ?? []))
    }

    setSeeding(false)
    const yearsLabel = seedYears.length > 1 ? `${seedYears[0]}–${seedYears[seedYears.length - 1]}` : String(seedYears[0])
    setSeedMsg(`Added ${totalCreated} confirmed holiday${totalCreated === 1 ? '' : 's'} for ${yearsLabel}${totalSkipped ? ` (${totalSkipped} already existed)` : ''}.`)
    const deduped = Array.from(new Map(allSuggested.map(f => [`${f.title}|${f.date}`, f])).values())
    setSuggestedFestivals(deduped)
    load()
  }

  async function addFestival(f: { title: string; date: string }) {
    if (!school) return
    setAddingFestival(f.date + f.title)
    await fetch(`/api/admin/schools/${school.id}/academic-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: f.title,
        category: 'holiday',
        holidaySubtype: 'public',
        countsAsNonWorking: true,
        startDate: f.date,
        endDate: f.date,
      }),
    })
    setAddingFestival(null)
    setSuggestedFestivals(prev => prev.filter(s => s.date !== f.date || s.title !== f.title))
    load()
  }

  function scheduleExam(name: string) {
    setEditingId(null)
    setForm({ ...emptyForm(), title: name, category: 'exam' })
    setCreateError('')
    setShowModal(true)
  }

  function openNewOnDay(dateStr: string) {
    setEditingId(null)
    setForm({ ...emptyForm(), startDate: dateStr, endDate: dateStr })
    setCreateError('')
    setShowModal(true)
  }

  function formatRange(a: AcademicEvent) {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
    const start = new Date(a.startDate + 'T00:00:00').toLocaleDateString('en-IN', opts)
    if (a.startDate === a.endDate) return start
    const end = new Date(a.endDate + 'T00:00:00').toLocaleDateString('en-IN', opts)
    return `${start} – ${end}`
  }

  return (
    <div className="paper-page pb-16">
      <PageHeader
        title="Academic Calendar"
        back={false}
        subtitle="Holidays, exam blocks, and term dates for your school"
        action={
          <button
            onClick={() => { setEditingId(null); setForm(emptyForm()); setShowModal(true); setCreateError('') }}
            className="flex items-center gap-1.5 font-bold px-3.5 py-2.5 rounded-2xl text-xs active:scale-95 transition-transform"
            style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
          >
            <Plus size={14} strokeWidth={2.5} /> New Event
          </button>
        }
      />

      <div className="px-5 pt-3 space-y-4 relative z-10">

        {/* ── Publish status ── */}
        {!loading && (
          <div
            className="paper-card p-4 flex items-center justify-between gap-3 flex-wrap"
            style={draftCount > 0 ? { background: '#fffbeb', border: '1.5px solid rgba(217,119,6,0.25)' } : { background: '#ecfdf5', border: '1.5px solid rgba(16,185,129,0.2)' }}
          >
            <div className="flex items-center gap-2">
              {draftCount > 0 ? <UploadCloud className="w-4 h-4 text-amber-700" /> : <CheckCircle2 className="w-4 h-4 text-emerald-700" />}
              <p className="text-xs font-bold" style={{ color: draftCount > 0 ? '#92400e' : '#047857' }}>
                {draftCount > 0
                  ? `${draftCount} draft event${draftCount === 1 ? '' : 's'} not yet visible to teachers`
                  : 'Everything is published — teachers see the current calendar'}
              </p>
            </div>
            <button
              onClick={publishCalendar}
              disabled={publishing || draftCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50"
              style={{ background: '#0f766e' }}
            >
              {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              Publish Calendar
            </button>
          </div>
        )}
        {publishMsg && <p className="text-xs font-semibold text-ink-soft px-1">{publishMsg}</p>}

        {/* ── Academic Year ── */}
        <div className="paper-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4 text-ink-soft" />
            <p className="text-xs font-black text-ink-soft uppercase tracking-widest">Academic Year</p>
          </div>
          <p className="text-xs text-ink-faint mb-3">
            The start and end of your school year — everything below (working days, exam plan, holidays) is measured against this range.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                value={ayStart}
                onChange={e => setAyStart(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">End Date</label>
              <input
                type="date"
                min={ayStart}
                value={ayEnd}
                onChange={e => setAyEnd(e.target.value)}
                className="input-field"
              />
            </div>
            <button
              onClick={saveAcademicYear}
              disabled={savingYear}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60 self-end"
              style={{ background: 'var(--ink)' }}
            >
              {savingYear ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>

        {/* ── Exam plan ── */}
        {school && (
          <div className="paper-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="w-4 h-4 text-ink-soft" />
              <p className="text-xs font-black text-ink-soft uppercase tracking-widest">Exam Plan</p>
            </div>
            <p className="text-xs text-ink-faint mb-3">
              How many of each exam type this year (e.g. Unit Test ×3). Tap <CalendarPlus className="w-3 h-3 inline" /> next to one to add its actual dates below.
            </p>
            <ExamPlanEditor schoolId={school.id} onSchedule={scheduleExam} />
          </div>
        )}

        {/* ── Working capacity summary ── */}
        {!loading && (
          <div className="paper-card p-5">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-ink-soft" />
                <p className="text-xs font-black text-ink-soft uppercase tracking-widest">Working Capacity — {capacityRange.label}</p>
              </div>
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(58,44,30,0.16)' }}>
                {[{ label: '6-Day Week', value: true }, { label: '5-Day Week', value: false }].map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSixDayWeek(opt.value)}
                    className="px-3 py-1.5 text-[11px] font-bold transition-colors"
                    style={sixDayWeek === opt.value
                      ? { background: 'var(--ink)', color: 'var(--paper-soft)' }
                      : { background: 'transparent', color: 'var(--ink-soft)' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {!schedule ? (
              <p className="text-sm text-ink-soft">Set up your school schedule (Timetable page) to see working-day capacity here.</p>
            ) : capacity ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(58,44,30,0.05)' }}>
                  <p className="text-2xl font-black text-ink">{capacity.workingDays}</p>
                  <p className="text-[10px] font-bold text-ink-soft mt-0.5 uppercase tracking-wide">Working Days</p>
                </div>
                <div className="rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(58,44,30,0.05)' }}>
                  <p className="text-2xl font-black text-ink">{capacity.workingHours}</p>
                  <p className="text-[10px] font-bold text-ink-soft mt-0.5 uppercase tracking-wide">Working Hours</p>
                </div>
                <div className="rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(58,44,30,0.05)' }}>
                  <p className="text-2xl font-black text-ink">{capacity.nonWorkingDays}</p>
                  <p className="text-[10px] font-bold text-ink-soft mt-0.5 uppercase tracking-wide">Non-Working Days</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">No period slots configured yet.</p>
            )}
          </div>
        )}

        {/* ── Seed Indian holidays ── */}
        <div className="paper-card p-5" style={{ background: 'rgba(199,183,232,0.14)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4" style={{ color: '#31215C' }} />
            <p className="text-sm font-bold" style={{ color: '#31215C' }}>Auto-fill Indian holidays</p>
          </div>
          <p className="text-xs mb-3" style={{ color: '#31215C', opacity: 0.75 }}>
            Fills in India&apos;s national public holidays (Republic Day, Independence Day, etc. — computed for the exact year(s)) as confirmed Holiday events. Major festivals (Diwali, Holi...) are offered separately below as suggestions to confirm, since exact festival dates need verifying against a local calendar.
            {academicYearEvent && seedYears.length > 1 && (
              <> Your Academic Year spans {seedYears.join(' and ')}, so this seeds <strong>both</strong> years in one go.</>
            )}
          </p>
          <div className="flex items-center gap-2">
            {!academicYearEvent && (
              <input
                type="number"
                value={seedYear}
                onChange={e => setSeedYear(Number(e.target.value))}
                className="w-24 px-3 py-2.5 rounded-xl border-[1.5px] border-[rgba(58,44,30,0.16)] text-sm text-ink focus:outline-none bg-white/70"
              />
            )}
            <button
              onClick={seedHolidays}
              disabled={seeding}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-60"
              style={{ background: '#31215C' }}
            >
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Seed Holidays for {seedYears.length > 1 ? `${seedYears[0]}–${seedYears[seedYears.length - 1]}` : seedYears[0]}
            </button>
          </div>
          {!academicYearEvent && (
            <p className="text-[11px] mt-2" style={{ color: '#31215C', opacity: 0.6 }}>
              Set your Academic Year above to seed its full span automatically instead of one year at a time.
            </p>
          )}
          {seedMsg && <p className="text-xs font-semibold mt-2" style={{ color: '#31215C' }}>{seedMsg}</p>}
        </div>

        {/* ── Suggested festivals — require individual confirmation ── */}
        {suggestedFestivals.length > 0 && (
          <div className="paper-card p-5" style={{ background: '#fffbeb', border: '1.5px solid rgba(217,119,6,0.25)' }}>
            <p className="text-sm font-bold text-amber-800 mb-1">Major festivals to confirm</p>
            <p className="text-xs text-amber-700/80 mb-3">
              Best-effort estimated dates — please verify against a local calendar/panchang before confirming. Not auto-added.
            </p>
            <div className="space-y-2">
              {suggestedFestivals.map(f => (
                <div key={f.date + f.title} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.6)' }}>
                  <div>
                    <p className="text-sm font-bold text-ink">{f.title}</p>
                    <p className="text-xs text-ink-soft">{new Date(f.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <button
                    onClick={() => addFestival(f)}
                    disabled={addingFestival === f.date + f.title}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-60"
                    style={{ background: '#b45309' }}
                  >
                    {addingFestival === f.date + f.title ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm & Add'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Events — list / calendar toggle ── */}
        {!loading && displayEvents.length > 0 && (
          <div className="flex items-center justify-end">
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(58,44,30,0.16)' }}>
              {([
                { mode: 'calendar' as const, label: 'Calendar', icon: LayoutGrid },
                { mode: 'list' as const, label: 'List', icon: Rows3 },
              ]).map(opt => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => setViewMode(opt.mode)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-colors"
                  style={viewMode === opt.mode
                    ? { background: 'var(--ink)', color: 'var(--paper-soft)' }
                    : { background: 'transparent', color: 'var(--ink-soft)' }}
                >
                  <opt.icon className="w-3.5 h-3.5" /> {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="paper-card p-10 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-ink-soft mx-auto" />
          </div>
        ) : displayEvents.length === 0 ? (
          <div className="paper-card px-6 py-14 text-center">
            <Sticker tone="cream" size={72} radius={999} style={{ margin: '0 auto 16px' }}>
              <CalendarDays size={30} className="text-ink-soft" />
            </Sticker>
            <p className="font-display font-bold text-ink text-lg">No events yet</p>
            <p className="text-sm text-ink-soft mt-1">Seed Indian holidays above, or click &quot;New Event&quot; to add one</p>
          </div>
        ) : viewMode === 'calendar' ? (
          <MonthCalendarGrid
            year={calYear}
            month={calMonth}
            events={displayEvents}
            showDraftBadge
            yearRange={academicYearEvent ? { start: academicYearEvent.startDate, end: academicYearEvent.endDate, label: 'the Academic Year' } : undefined}
            onPrevMonth={() => { const m = calMonth - 1; if (m < 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m) }}
            onNextMonth={() => { const m = calMonth + 1; if (m > 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m) }}
            onDayClick={openNewOnDay}
            onEventClick={openEdit}
          />
        ) : (
          <div className="space-y-3">
            {displayEvents.map(a => {
              const meta = CATEGORY_META[a.category]
              const Icon = CATEGORY_ICON[a.category]
              return (
                <div key={a.id} className="paper-card p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
                      <Icon className="w-5 h-5" style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-ink">{a.title}</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                        {a.category === 'holiday' && a.holidaySubtype && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-ink-soft" style={{ background: 'rgba(58,44,30,0.06)' }}>
                            {HOLIDAY_SUBTYPE_META[a.holidaySubtype].label}
                          </span>
                        )}
                        {!a.countsAsNonWorking && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-emerald-700" style={{ background: '#ecfdf5' }}>
                            Classes run as normal
                          </span>
                        )}
                        {!a.published && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-amber-700" style={{ background: '#fffbeb' }}>
                            Draft
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-soft mt-1 font-semibold">{formatRange(a)}</p>
                      {a.description && <p className="text-sm text-ink-soft mt-1.5 leading-relaxed whitespace-pre-wrap">{a.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(a)}
                        className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-black/5 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeEvent(a.id)}
                        disabled={removing === a.id}
                        className="p-1.5 rounded-lg text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {removing === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Event Modal */}
      <Modal open={showModal} onClose={closeModal} title={editingId ? 'Edit Calendar Event' : 'New Calendar Event'}>
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <div className="text-sm px-4 py-3 rounded-2xl" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid rgba(185,28,28,0.15)' }}>
              {createError}
            </div>
          )}

          <div>
            <label className="label">Category</label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(CATEGORY_META) as AcademicEvent['category'][]).map(cat => {
                const meta = CATEGORY_META[cat]
                const Icon = CATEGORY_ICON[cat]
                const active = form.category === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, category: cat }))}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors"
                    style={active
                      ? { background: meta.bg, color: meta.color, borderColor: meta.color }
                      : { background: 'transparent', borderColor: 'rgba(58,44,30,0.16)', color: 'var(--ink-soft)' }}
                  >
                    <Icon className="w-3.5 h-3.5" /> {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {form.category === 'holiday' && (
            <div className="rounded-2xl p-3.5" style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px dashed rgba(58,44,30,0.18)' }}>
              <label className="label">Holiday Type</label>
              <div className="flex gap-2 flex-wrap mb-3">
                {(Object.keys(HOLIDAY_SUBTYPE_META) as NonNullable<AcademicEvent['holidaySubtype']>[]).map(st => {
                  const active = form.holidaySubtype === st
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, holidaySubtype: st }))}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors"
                      style={active
                        ? { background: 'var(--ink)', color: 'var(--paper-soft)', borderColor: 'var(--ink)' }
                        : { background: 'transparent', borderColor: 'rgba(58,44,30,0.16)', color: 'var(--ink-soft)' }}
                    >
                      {HOLIDAY_SUBTYPE_META[st].label}
                    </button>
                  )
                })}
              </div>
              <label className="flex items-center gap-2.5 text-xs font-semibold text-ink-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={!form.countsAsNonWorking}
                  onChange={e => setForm(f => ({ ...f, countsAsNonWorking: !e.target.checked }))}
                  className="w-4 h-4"
                />
                Classes run as normal that day (doesn&apos;t block regular periods) — e.g. an Annual Day held alongside school
              </label>
            </div>
          )}

          <div>
            <label className="label">Title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Diwali, Term 1 Exams, Term 1"
              className="input-field"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date *</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">End Date *</label>
              <input
                type="date"
                required
                min={form.startDate}
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="label">{form.category === 'holiday' ? 'Reason' : 'Description'}</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={form.category === 'holiday' ? 'e.g. Sankranti break, Local festival...' : 'Optional details...'}
              className="input-field resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 py-3 rounded-2xl text-ink-soft font-bold text-sm active:scale-95 transition-transform"
              style={{ background: 'rgba(58,44,30,0.06)' }}
            >
              Cancel
            </button>
            <button type="submit" disabled={creating} className="flex-1 paper-btn-primary" style={{ opacity: creating ? 0.7 : 1 }}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? 'Save Changes' : 'Add Event'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
