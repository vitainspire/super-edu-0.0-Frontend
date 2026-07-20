'use client'
import { useEffect, useState, useCallback } from 'react'
import { useAdmin } from '@/lib/admin-context'
import {
  CalendarDays, Plus, Trash2, Loader2, Send, X, Wand2,
  Coffee, UtensilsCrossed, ChevronRight, Check, Edit2, ArrowRight, Shuffle,
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'
import type { Class, SchoolTimetablePeriod, ScheduleSlot, SchoolSchedule } from '@/lib/types'
import GradeSubjectsEditor from '@/components/admin/GradeSubjectsEditor'
import PageHeader from '@/components/theme/PageHeader'

const DAYS_COUNT = 6

function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function minsToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function generateSlots(
  startTime: string, endTime: string, periodMins: number,
  breaks: { label: string; startTime: string; endTime: string }[]
): ScheduleSlot[] {
  const end = timeToMins(endTime)
  const sortedBreaks = [...breaks].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime))
  const slots: ScheduleSlot[] = []
  let cursor = timeToMins(startTime)
  let periodNumber = 1
  while (cursor + periodMins <= end) {
    const clash = sortedBreaks.find(b => {
      const bs = timeToMins(b.startTime), be = timeToMins(b.endTime)
      return (bs >= cursor && bs < cursor + periodMins) || (cursor >= bs && cursor < be)
    })
    if (clash) {
      const bs = timeToMins(clash.startTime)
      if (bs > cursor && bs - cursor >= periodMins) {
        slots.push({ type: 'period', periodNumber, label: `Period ${periodNumber}`, startTime: minsToTime(cursor), endTime: minsToTime(cursor + periodMins) })
        periodNumber++; cursor += periodMins
      } else { cursor = bs }
      if (!slots.find(s => s.type === 'break' && s.label === clash.label))
        slots.push({ type: 'break', label: clash.label, startTime: clash.startTime, endTime: clash.endTime })
      cursor = timeToMins(clash.endTime)
    } else {
      slots.push({ type: 'period', periodNumber, label: `Period ${periodNumber}`, startTime: minsToTime(cursor), endTime: minsToTime(cursor + periodMins) })
      periodNumber++; cursor += periodMins
    }
  }
  return slots
}

interface BreakInput { label: string; startTime: string; endTime: string }
interface SetupForm { startTime: string; endTime: string; periodMins: number; breaks: BreakInput[] }
const DEFAULT_FORM: SetupForm = {
  startTime: '09:00', endTime: '17:00', periodMins: 45,
  breaks: [
    { label: 'Short Break', startTime: '10:30', endTime: '10:45' },
    { label: 'Lunch Break', startTime: '13:00', endTime: '13:45' },
  ],
}

type Tone = 'blue' | 'green' | 'coral' | 'gold' | 'violet' | 'pink'
const PALETTE: { tone: Tone; stat: string; ink: string }[] = [
  { tone: 'blue',   stat: 'stat-card-blue',   ink: '#1E3A55' },
  { tone: 'green',  stat: 'stat-card-green',  ink: '#234A1D' },
  { tone: 'coral',  stat: 'stat-card-coral',  ink: '#5C2416' },
  { tone: 'gold',   stat: 'stat-card-gold',   ink: '#4A3809' },
  { tone: 'violet', stat: 'stat-card-violet', ink: '#31215C' },
  { tone: 'pink',   stat: 'stat-card-pink',   ink: '#5C1F38' },
]

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SUBJECT_COLORS = [
  { bg: '#C7B7E8', text: '#31215C' },
  { bg: '#AACDEA', text: '#1E3A55' },
  { bg: '#AAD6A0', text: '#234A1D' },
  { bg: '#EAC968', text: '#4A3809' },
  { bg: '#F0AFC6', text: '#5C1F38' },
  { bg: '#F0A491', text: '#5C2416' },
]
function colorForLabel(label: string) {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length]
}

export default function TimetablePage() {
  const { school } = useAdmin()
  const [schedule, setSchedule] = useState<SchoolSchedule | null>(null)
  const [periods, setPeriods] = useState<SchoolTimetablePeriod[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState('')

  // Setup form state
  const [setupForm, setSetupForm] = useState<SetupForm>(DEFAULT_FORM)
  const [previewSlots, setPreviewSlots] = useState<ScheduleSlot[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [showAiPanel, setShowAiPanel] = useState(false)

  // Whole-school generation — schedules every grade/section together so
  // teachers covering multiple grades are treated as one shared resource.
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generateResult, setGenerateResult] = useState<{
    classStats: { classId: string; className: string; placed: number; kept: number; skipped: number }[]
    teacherWarnings: { teacherId: string; teacherName?: string; requiredPeriods: number; availableSlots: number; overBy: number }[]
    unplaced: { classId: string; className: string; subject: string; teacherId?: string; reason: string }[]
    keptCount: number
    placedCount: number
  } | null>(null)
  const [genSixDayWeek, setGenSixDayWeek] = useState(true)

  // Subject lineup & shuffle
  const [selectedGrade, setSelectedGrade] = useState('')
  const [shuffling, setShuffling] = useState(false)
  const [shuffleError, setShuffleError] = useState<string | null>(null)
  const [shuffleResult, setShuffleResult] = useState<{ classId: string; className: string; placed: number; skipped: number }[] | null>(null)
  const [activeShuffleTab, setActiveShuffleTab] = useState<string | null>(null)
  const [publishingShuffled, setPublishingShuffled] = useState(false)
  const [shufflePublishMsg, setShufflePublishMsg] = useState('')

  const load = useCallback(() => {
    if (!school) { setLoading(false); return }
    Promise.all([
      fetch(`/api/admin/schools/${school.id}/schedule`).then(r => r.json()),
      fetch(`/api/admin/schools/${school.id}/timetable`).then(r => r.json()),
      fetch(`/api/admin/schools/${school.id}/classes`).then(r => r.json()),
    ]).then(([sd, tt, cd]) => {
      setSchedule(sd.schedule ?? null)
      setPeriods(tt.periods ?? [])
      setClasses(cd.classes ?? [])
    }).finally(() => setLoading(false))
  }, [school])

  useEffect(() => { load() }, [load])

  function handleGenerate() {
    setPreviewSlots(generateSlots(setupForm.startTime, setupForm.endTime, setupForm.periodMins, setupForm.breaks))
    setShowPreview(true)
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/admin/schedule-ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      })
      const data = await res.json()
      if (data.form) {
        setSetupForm(data.form)
        setPreviewSlots(generateSlots(data.form.startTime, data.form.endTime, data.form.periodMins, data.form.breaks))
        setShowPreview(true)
        setShowAiPanel(false)
      }
    } finally { setAiLoading(false) }
  }

  async function saveSchedule() {
    if (!school || previewSlots.length === 0) return
    setSavingSchedule(true)
    try {
      const res = await fetch(`/api/admin/schools/${school.id}/schedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: previewSlots }),
      })
      const data = await res.json()
      setSchedule(data.schedule)
      setShowPreview(false)
      setEditingTemplate(false)
    } finally { setSavingSchedule(false) }
  }

  async function publish() {
    if (!school) return
    setPublishing(true)
    const res = await fetch(`/api/admin/schools/${school.id}/timetable/publish`, { method: 'POST' })
    if (res.ok) { setPublishMsg('Timetable published to all teachers!'); setTimeout(() => setPublishMsg(''), 4000) }
    setPublishing(false)
  }

  async function generateFullTimetable() {
    if (!school) return
    if (!confirm('This will (re)generate the school timetable. Periods that haven\'t changed stay exactly as they are — only new or changed requirements get placed. Continue?')) return
    setGenerating(true)
    setGenerateError(null)
    setGenerateResult(null)
    try {
      const res = await fetch(`/api/admin/schools/${school.id}/timetable/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sixDayWeek: genSixDayWeek }),
      })
      const data = await res.json()
      if (!res.ok) { setGenerateError(data.error ?? 'Failed to generate timetable'); return }
      setGenerateResult(data)
      load()
    } catch {
      setGenerateError('Network error — please try again')
    } finally {
      setGenerating(false)
    }
  }

  async function publishShuffled() {
    if (!school || !shuffleResult || shuffleResult.length === 0) return
    setPublishingShuffled(true)
    try {
      const res = await fetch(`/api/admin/schools/${school.id}/timetable/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classIds: shuffleResult.map(s => s.classId) }),
      })
      if (res.ok) {
        setShufflePublishMsg(`Grade ${selectedGrade} timetable published to teachers!`)
        setTimeout(() => setShufflePublishMsg(''), 4000)
      }
    } finally {
      setPublishingShuffled(false)
    }
  }

  async function shuffle() {
    if (!school || !selectedGrade) return
    if (!confirm(`This will replace the current timetable for all Grade ${selectedGrade} sections. Continue?`)) return
    setShuffling(true)
    setShuffleError(null)
    setShuffleResult(null)
    try {
      const res = await fetch(`/api/admin/schools/${school.id}/timetable/shuffle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: selectedGrade }),
      })
      const data = await res.json()
      if (!res.ok) { setShuffleError(data.error ?? 'Failed to shuffle'); return }
      const sections = data.sections ?? []
      setShuffleResult(sections)
      setActiveShuffleTab(sections[0]?.classId ?? null)
      load()
    } catch {
      setShuffleError('Network error — please try again')
    } finally {
      setShuffling(false)
    }
  }

  // Per-class helpers
  const classAssignedCount = (classId: string) => periods.filter(p => p.classId === classId).length
  const periodSlotsCount = schedule?.slots.filter(s => s.type === 'period').length ?? 0
  const grades = [...new Set(classes.map(c => c.grade))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
  const gradeGroups = Object.entries(
    classes.reduce((acc, c) => {
      (acc[c.grade] ??= []).push(c)
      return acc
    }, {} as Record<string, Class[]>)
  ).sort(([a], [b]) => Number(a) - Number(b) || a.localeCompare(b))

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-ink" /></div>

  // ── SETUP VIEW ───────────────────────────────────────────────────────────────
  if (!schedule || editingTemplate) {
    return (
      <div className="paper-page pb-16">
        <PageHeader
          title={editingTemplate ? 'Edit Schedule Template' : 'Set Up School Schedule'}
          subtitle="Define your school's daily period structure"
          back={false}
          action={editingTemplate ? (
            <button
              onClick={() => { setEditingTemplate(false); setShowPreview(false) }}
              className="w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-transform"
              style={{ background: 'rgba(58,44,30,0.08)' }}
            >
              <X className="w-4 h-4 text-ink" />
            </button>
          ) : undefined}
        />

        <div className="px-5 md:px-6 max-w-3xl mx-auto relative z-10 space-y-5">

          {/* AI panel */}
          <div className="paper-card p-5" style={{ background: 'rgba(199,183,232,0.16)' }}>
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-sticker-violet">
                  <Wand2 className="w-4 h-4" style={{ color: '#31215C' }} />
                </div>
                <p className="text-sm font-bold" style={{ color: '#31215C' }}>Generate with AI</p>
              </div>
              <button onClick={() => setShowAiPanel(v => !v)} className="text-xs font-bold underline" style={{ color: '#31215C' }}>
                {showAiPanel ? 'Hide' : 'Describe your schedule'}
              </button>
            </div>
            {showAiPanel ? (
              <div className="space-y-3">
                <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3}
                  placeholder='e.g. "School 9am–4pm, 45-min periods, short break 10:30–10:45, lunch 1pm–1:45pm"'
                  className="w-full px-3 py-2.5 rounded-2xl border-[1.5px] border-[rgba(58,44,30,0.16)] text-sm focus:outline-none bg-white/70 resize-none"
                />
                <button onClick={handleAiGenerate} disabled={aiLoading || !aiPrompt.trim()}
                  className="paper-btn-primary disabled:opacity-50">
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Generate Schedule
                </button>
              </div>
            ) : (
              <p className="text-xs font-medium" style={{ color: '#31215C', opacity: 0.75 }}>Describe your school hours and breaks in plain text — AI will build the period structure for you.</p>
            )}
          </div>

          {/* Manual form */}
          <div className="paper-card p-6 space-y-5">
            <p className="text-sm font-bold text-ink">Or configure manually</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'School Start', key: 'startTime' as const },
                { label: 'School End', key: 'endTime' as const },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-bold text-ink-soft mb-1.5">{f.label}</label>
                  <input type="time" value={setupForm[f.key] as string}
                    onChange={e => setSetupForm(s => ({ ...s, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-2xl border-[1.5px] border-[rgba(58,44,30,0.16)] text-sm focus:outline-none bg-white/70"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold text-ink-soft mb-1.5">Period Duration (min)</label>
                <input type="number" min={20} max={120} value={setupForm.periodMins}
                  onChange={e => setSetupForm(s => ({ ...s, periodMins: +e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-2xl border-[1.5px] border-[rgba(58,44,30,0.16)] text-sm focus:outline-none bg-white/70"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-black text-ink-soft uppercase tracking-widest">Breaks</label>
                <button onClick={() => setSetupForm(s => ({ ...s, breaks: [...s.breaks, { label: 'Break', startTime: '12:00', endTime: '12:15' }] }))}
                  className="flex items-center gap-1 text-xs font-bold text-ink">
                  <Plus className="w-3.5 h-3.5" /> Add Break
                </button>
              </div>
              <div className="space-y-2">
                {setupForm.breaks.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={b.label} placeholder="Break name"
                      onChange={e => setSetupForm(s => ({ ...s, breaks: s.breaks.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))}
                      className="flex-1 px-3 py-2 rounded-xl border-[1.5px] border-[rgba(58,44,30,0.14)] text-sm focus:outline-none bg-white/70"
                    />
                    <input type="time" value={b.startTime}
                      onChange={e => setSetupForm(s => ({ ...s, breaks: s.breaks.map((x, j) => j === i ? { ...x, startTime: e.target.value } : x) }))}
                      className="px-3 py-2 rounded-xl border-[1.5px] border-[rgba(58,44,30,0.14)] text-sm focus:outline-none bg-white/70"
                    />
                    <span className="text-ink-faint text-xs">to</span>
                    <input type="time" value={b.endTime}
                      onChange={e => setSetupForm(s => ({ ...s, breaks: s.breaks.map((x, j) => j === i ? { ...x, endTime: e.target.value } : x) }))}
                      className="px-3 py-2 rounded-xl border-[1.5px] border-[rgba(58,44,30,0.14)] text-sm focus:outline-none bg-white/70"
                    />
                    <button onClick={() => setSetupForm(s => ({ ...s, breaks: s.breaks.filter((_, j) => j !== i) }))}
                      className="p-1.5 text-ink-faint hover:text-red-500 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleGenerate} className="paper-btn-primary w-full">
              <ChevronRight className="w-4 h-4" /> Generate Period Slots
            </button>
          </div>

          {/* Preview */}
          {showPreview && previewSlots.length > 0 && (
            <div className="paper-card overflow-hidden">
              <div className="px-5 py-3.5 flex items-center justify-between border-b-[1.5px] border-[rgba(58,44,30,0.12)]">
                <p className="font-bold text-ink text-sm">
                  Preview — {previewSlots.filter(s => s.type === 'period').length} periods/day
                </p>
                <p className="text-xs text-ink-faint">{setupForm.startTime} – {setupForm.endTime}</p>
              </div>
              <div className="divide-y divide-[rgba(58,44,30,0.08)]">
                {previewSlots.map((slot, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3" style={slot.type === 'break' ? { background: 'rgba(234,201,104,0.16)' } : undefined}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${slot.type === 'break' ? 'bg-sticker-gold' : 'bg-sticker-blue'}`}>
                      {slot.type === 'break'
                        ? (slot.label.toLowerCase().includes('lunch') ? <UtensilsCrossed className="w-3.5 h-3.5" style={{ color: '#4A3809' }} /> : <Coffee className="w-3.5 h-3.5" style={{ color: '#4A3809' }} />)
                        : <span className="text-[10px] font-black" style={{ color: '#1E3A55' }}>{slot.periodNumber}</span>}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold" style={{ color: slot.type === 'break' ? '#4A3809' : 'var(--ink)' }}>{slot.label}</p>
                      <p className="text-xs text-ink-faint">{slot.startTime} – {slot.endTime}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 flex gap-3 border-t-[1.5px] border-[rgba(58,44,30,0.12)]">
                <button onClick={() => setShowPreview(false)} className="flex-1 py-2.5 rounded-2xl border-[1.5px] border-[rgba(58,44,30,0.16)] text-sm font-bold text-ink-soft">Edit</button>
                <button onClick={saveSchedule} disabled={savingSchedule}
                  className="flex-1 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                  {savingSchedule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save Schedule
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── OVERVIEW VIEW ────────────────────────────────────────────────────────────
  return (
    <div className="paper-page pb-16">
      <PageHeader
        title="Timetable"
        subtitle={`${periodSlotsCount} periods/day · ${classes.length} classes`}
        back={false}
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditingTemplate(true); setShowPreview(false); setPreviewSlots([]) }}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border-[1.5px] border-[rgba(58,44,30,0.16)] text-xs font-bold text-ink-soft active:scale-95 transition-transform">
              <Edit2 className="w-3.5 h-3.5" /> Edit Template
            </button>
            <button onClick={publish} disabled={publishing || periods.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-60 active:scale-95 transition-transform">
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Publish to Teachers
            </button>
          </div>
        }
      />

      <div className="px-5 md:px-6 max-w-5xl mx-auto relative z-10 space-y-5">

        {publishMsg && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-semibold rounded-2xl px-4 py-3 flex items-center justify-between">
            {publishMsg} <button onClick={() => setPublishMsg('')}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Whole-school generation ── */}
        <div className="paper-card p-5" style={{ background: 'rgba(16,185,129,0.06)', border: '1.5px solid rgba(16,185,129,0.25)' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <div>
              <p className="text-sm font-bold text-ink flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-emerald-700" /> Generate Full School Timetable
              </p>
              <p className="text-xs text-ink-faint mt-0.5">
                Schedules every grade and section together in one pass — teachers covering multiple grades/subjects are treated as one shared resource, not scheduled per-grade in isolation. Safe to re-run any time: periods that haven&apos;t changed are left exactly as they are — only new or changed requirements get placed.
              </p>
            </div>
            <div className="flex rounded-xl overflow-hidden shrink-0" style={{ border: '1.5px solid rgba(58,44,30,0.16)' }}>
              {[{ label: '6-Day Week', value: true }, { label: '5-Day Week', value: false }].map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setGenSixDayWeek(opt.value)}
                  className="px-3 py-1.5 text-[11px] font-bold transition-colors"
                  style={genSixDayWeek === opt.value
                    ? { background: 'var(--ink)', color: 'var(--paper-soft)' }
                    : { background: 'transparent', color: 'var(--ink-soft)' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={generateFullTimetable}
            disabled={generating}
            className="paper-btn-primary w-full mt-2 disabled:opacity-60"
            style={{ background: '#059669' }}
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {generating ? 'Generating…' : 'Generate Full School Timetable'}
          </button>

          {generateError && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-3">{generateError}</p>
          )}

          {generateResult && (
            <div className="mt-4 space-y-3">
              <div className="bg-white/70 rounded-2xl px-4 py-3">
                <p className="text-sm font-bold text-ink mb-1.5">
                  {generateResult.keptCount} periods unchanged · {generateResult.placedCount} newly placed across {generateResult.classStats.length} classes
                  {generateResult.unplaced.length > 0 && <span className="text-amber-700"> · {generateResult.unplaced.length} could not be placed</span>}
                </p>
              </div>

              {generateResult.teacherWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                  <p className="text-xs font-black text-amber-800 uppercase tracking-wide mb-2">Overcommitted teachers</p>
                  <div className="space-y-1">
                    {generateResult.teacherWarnings.map(w => (
                      <p key={w.teacherId} className="text-xs text-amber-800">
                        <strong>{w.teacherName ?? w.teacherId}</strong> needs {w.requiredPeriods} periods/week but only {w.availableSlots} slots are available — over by {w.overBy}.
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {generateResult.unplaced.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                  <p className="text-xs font-black text-red-700 uppercase tracking-wide mb-2">Could not be placed</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {generateResult.unplaced.map((u, i) => (
                      <p key={i} className="text-xs text-red-700">
                        <strong>{u.className}</strong> — {u.subject}: {u.reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Schedule summary strip */}
        <div className="paper-card p-4 overflow-x-auto">
          <p className="text-xs font-black text-ink-soft uppercase tracking-widest mb-3">Daily Schedule</p>
          <div className="flex items-center gap-2 flex-nowrap">
            {schedule.slots.map((slot, i) => (
              <div key={i} className={clsx(
                'flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border-[1.5px]',
                slot.type === 'break'
                  ? 'bg-sticker-gold/30 text-[#4A3809] border-[rgba(173,138,44,0.35)]'
                  : 'bg-sticker-blue/30 text-[#1E3A55] border-[rgba(91,135,173,0.35)]'
              )}>
                {slot.type === 'period' ? `P${slot.periodNumber}` : slot.label}
                <span className="block text-[10px] font-semibold opacity-70">{slot.startTime}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Subject lineup & shuffle */}
        <div className="paper-card p-5">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold text-ink flex items-center gap-2">
                <Shuffle className="w-4 h-4" style={{ color: '#31215C' }} /> Subject Lineup &amp; Shuffle
              </p>
              <p className="text-xs text-ink-faint mt-0.5">
                Set periods/week per subject once for a grade, then auto-generate every section's timetable at once
              </p>
            </div>
            <select
              value={selectedGrade}
              onChange={e => { setSelectedGrade(e.target.value); setShuffleResult(null); setShuffleError(null); setShufflePublishMsg('') }}
              className="px-3 py-2.5 rounded-2xl border-[1.5px] border-[rgba(58,44,30,0.16)] text-sm text-ink focus:outline-none bg-white/70"
            >
              <option value="">Select grade…</option>
              {grades.map(g => <option key={g} value={g}>Grade {g}</option>)}
            </select>
          </div>

          {selectedGrade && school && (
            <>
              <GradeSubjectsEditor schoolId={school.id} grade={selectedGrade} />

              {shuffleError && (
                <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-3">{shuffleError}</p>
              )}

              {shuffleResult && (
                <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                  <p className="text-sm font-bold text-emerald-800 mb-1.5">
                    Shuffled {shuffleResult.length} section{shuffleResult.length !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-0.5">
                    {shuffleResult.map(s => (
                      <p key={s.classId} className="text-xs font-medium text-emerald-700">
                        {s.className}: {s.placed} placed{s.skipped > 0 ? `, ${s.skipped} skipped (conflicts)` : ''}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {shuffleResult && shuffleResult.length > 0 && schedule && (
                <div className="mt-3 rounded-2xl overflow-hidden border-[1.5px] border-[rgba(58,44,30,0.14)]">
                  {/* Section tabs */}
                  <div className="flex flex-wrap gap-1.5 p-3 border-b-[1.5px] border-[rgba(58,44,30,0.1)]" style={{ background: 'rgba(58,44,30,0.03)' }}>
                    {shuffleResult.map(s => (
                      <button
                        key={s.classId}
                        onClick={() => setActiveShuffleTab(s.classId)}
                        className={clsx(
                          'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors',
                          activeShuffleTab === s.classId
                            ? 'text-white'
                            : 'bg-white/70 text-ink-soft border-[1.5px] border-[rgba(58,44,30,0.14)]'
                        )}
                        style={activeShuffleTab === s.classId ? { background: 'var(--ink)' } : undefined}
                      >
                        {s.className}
                      </button>
                    ))}
                  </div>

                  {/* Preview grid for the active tab */}
                  {activeShuffleTab && (() => {
                    const periodSlots = schedule.slots.filter(s => s.type === 'period')
                    const classPeriods = periods.filter(p => p.classId === activeShuffleTab)
                    const cellFor = (day: number, periodNumber: number) =>
                      classPeriods.find(p => p.dayOfWeek === day && p.periodNumber === periodNumber)

                    return (
                      <div className="overflow-x-auto p-3">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr>
                              <th className="text-left text-ink-faint font-semibold px-2 py-1.5 w-14">Period</th>
                              {DAY_NAMES.slice(1).map(d => (
                                <th key={d} className="text-center text-ink-soft font-bold px-2 py-1.5">{d}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {periodSlots.map(slot => (
                              <tr key={slot.periodNumber}>
                                <td className="text-ink-faint font-semibold px-2 py-1 whitespace-nowrap">P{slot.periodNumber}</td>
                                {[1, 2, 3, 4, 5, 6].map(day => {
                                  const cell = cellFor(day, slot.periodNumber!)
                                  const color = cell?.label ? colorForLabel(cell.label) : null
                                  return (
                                    <td key={day} className="px-1 py-1">
                                      {cell?.label ? (
                                        <div
                                          className="rounded-lg px-2 py-1.5 text-center font-bold truncate"
                                          style={{ background: color!.bg, color: color!.text }}
                                          title={cell.label}
                                        >
                                          {cell.label}
                                        </div>
                                      ) : (
                                        <div className="rounded-lg px-2 py-1.5 text-center text-ink-faint" style={{ background: 'rgba(58,44,30,0.05)' }}>—</div>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <Link
                          href={`/admin/timetable/${activeShuffleTab}`}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-ink underline underline-offset-2"
                        >
                          Edit this section's timetable <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    )
                  })()}
                </div>
              )}

              {shufflePublishMsg && (
                <div className="mt-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-semibold rounded-2xl px-4 py-3 flex items-center justify-between">
                  {shufflePublishMsg} <button onClick={() => setShufflePublishMsg('')}><X className="w-4 h-4" /></button>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button
                  onClick={shuffle}
                  disabled={shuffling}
                  className="paper-btn-primary flex-1 disabled:opacity-60"
                >
                  {shuffling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
                  Shuffle Timetable for Grade {selectedGrade}
                </button>
                {shuffleResult && shuffleResult.length > 0 && (
                  <button
                    onClick={publishShuffled}
                    disabled={publishingShuffled}
                    className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {publishingShuffled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Publish Grade {selectedGrade} to Teachers
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Grade cards */}
        {gradeGroups.length === 0 ? (
          <div className="paper-card text-center py-16">
            <CalendarDays className="w-10 h-10 text-ink-faint mx-auto mb-3" />
            <p className="text-ink-soft font-bold">No classes yet</p>
            <p className="text-sm text-ink-faint mt-1">Create classes first, then assign their timetables</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {gradeGroups.map(([grade, secs], i) => {
              const palette = PALETTE[i % PALETTE.length]
              const assigned = secs.reduce((sum, c) => sum + classAssignedCount(c.id), 0)
              const total = periodSlotsCount * DAYS_COUNT * secs.length
              const pct = total > 0 ? Math.round((assigned / total) * 100) : 0

              return (
                <Link
                  key={grade}
                  href={`/admin/timetable/grade/${encodeURIComponent(grade)}`}
                  className={clsx('stat-card block', palette.stat)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display font-bold text-xl leading-tight" style={{ color: palette.ink }}>Grade {grade}</p>
                      <p className="text-sm font-semibold mt-1" style={{ color: palette.ink, opacity: 0.75 }}>
                        {secs.length} section{secs.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.5)', color: palette.ink }}>
                      {pct}%
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="stat-progress-track">
                      <div className="stat-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs font-semibold" style={{ color: palette.ink, opacity: 0.7 }}>
                        {assigned} of {total} slots assigned
                      </span>
                      <span className="text-xs font-black underline underline-offset-2 flex items-center gap-1 shrink-0" style={{ color: palette.ink }}>
                        View <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
