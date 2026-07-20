'use client'
import { useCallback, useEffect, useState } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, Repeat, Lightbulb } from 'lucide-react'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'
import type { Teacher } from '@/lib/types'

const REASON_LABEL: Record<string, string> = {
  on_leave: 'On Leave',
  late_arrival: 'Late Arrival',
  official_duty: 'Official Duty',
  other: 'Unavailable',
}
const REASON_OPTIONS = ['on_leave', 'late_arrival', 'official_duty', 'other'] as const

interface AvailabilityRow { teacherId: string; reason: string; note?: string; source: 'teacher' | 'admin' }
interface SubstitutionRow {
  id: string
  classId: string
  className: string
  dayOfWeek: number
  periodNumber: number
  subject?: string
  originalTeacherId: string
  originalTeacherName: string
  substituteTeacherId?: string
  substituteTeacherName?: string
  status: 'assigned' | 'unresolved' | 'manual' | 'assigned_fallback'
  suggestion?: {
    swapPeriodNumber: number
    swapSubject: string
    movingTeacherName: string
    freeingTeacherName: string
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
}

function addDays(d: string, delta: number) {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + delta)
  return dt.toISOString().slice(0, 10)
}

export default function SubstitutesPage() {
  const { school } = useAdmin()
  const [date, setDate] = useState(todayStr)
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [availability, setAvailability] = useState<AvailabilityRow[]>([])
  const [substitutions, setSubstitutions] = useState<SubstitutionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingTeacherId, setSavingTeacherId] = useState<string | null>(null)
  const [savingSubId, setSavingSubId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback((d: string) => {
    if (!school) return
    setLoading(true)
    fetch(`/api/admin/schools/${school.id}/substitutes?date=${d}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) { setError(data.error ?? 'Failed to load.'); return }
        setError('')
        setTeachers(data.teachers ?? [])
        setAvailability(data.availability ?? [])
        setSubstitutions(data.substitutions ?? [])
      })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false))
  }, [school])

  useEffect(() => { load(date) }, [load, date])

  const availabilityByTeacher = new Map(availability.map(a => [a.teacherId, a]))

  async function setStatus(teacherId: string, reason: string) {
    if (!school) return
    setSavingTeacherId(teacherId)
    try {
      const res = await fetch(`/api/admin/schools/${school.id}/substitutes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, teacherId, reason }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to update status.'); return }
      setError('')
      setAvailability(data.availability ?? [])
      setSubstitutions(data.substitutions ?? [])
    } catch {
      setError('Network error.')
    } finally {
      setSavingTeacherId(null)
    }
  }

  async function reassign(substitutionId: string, substituteTeacherId: string) {
    if (!school) return
    setSavingSubId(substitutionId)
    try {
      const res = await fetch(`/api/admin/schools/${school.id}/substitutes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ substitutionId, substituteTeacherId, date }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to reassign.'); return }
      setError('')
      setSubstitutions(data.substitutions ?? [])
    } catch {
      setError('Network error.')
    } finally {
      setSavingSubId(null)
    }
  }

  return (
    <div className="paper-page pb-16">
      <PageHeader
        title="Substitutes"
        back={false}
        subtitle="Mark teacher availability and manage substitute coverage"
      />

      <div className="px-5 pt-3 relative z-10 space-y-4">

        {error && (
          <div className="text-sm px-4 py-3 rounded-2xl" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid rgba(185,28,28,0.15)' }}>
            {error}
          </div>
        )}

        {/* Date navigator */}
        <div className="paper-card px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setDate(d => addDays(d, -1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl active:scale-90 transition-transform"
            style={{ background: 'rgba(58,44,30,0.06)' }}
          >
            <ChevronLeft size={18} className="text-ink-soft" />
          </button>
          <div className="text-center">
            <p className="font-display font-bold text-ink text-sm">{formatDate(date)}</p>
            {date !== todayStr() && (
              <button onClick={() => setDate(todayStr())} className="text-[11px] font-bold text-ink-soft underline">Jump to today</button>
            )}
          </div>
          <button
            onClick={() => setDate(d => addDays(d, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl active:scale-90 transition-transform"
            style={{ background: 'rgba(58,44,30,0.06)' }}
          >
            <ChevronRight size={18} className="text-ink-soft" />
          </button>
        </div>

        {loading ? (
          <div className="paper-card p-10 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-ink-soft mx-auto" />
          </div>
        ) : (
          <>
            {/* Teacher availability */}
            <div className="paper-card overflow-hidden">
              <div className="px-5 py-3" style={{ borderBottom: '1.5px solid rgba(58,44,30,0.12)' }}>
                <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Teacher Availability</p>
              </div>
              {teachers.length === 0 ? (
                <p className="text-sm text-ink-faint text-center py-8">No teachers yet.</p>
              ) : (
                <div>
                  {teachers.map((t, i) => {
                    const a = availabilityByTeacher.get(t.id)
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-3 px-5 py-3"
                        style={i < teachers.length - 1 ? { borderBottom: '1px solid rgba(58,44,30,0.08)' } : undefined}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}>
                            {t.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-ink truncate">{t.name}</p>
                            {t.subject && <p className="text-xs text-ink-faint truncate">{t.subject}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {a && (
                            <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wide">
                              {a.source === 'teacher' ? 'self-reported' : 'set by admin'}
                            </span>
                          )}
                          {savingTeacherId === t.id && <Loader2 size={14} className="animate-spin text-ink-faint" />}
                          <select
                            value={a?.reason ?? 'available'}
                            onChange={e => setStatus(t.id, e.target.value)}
                            disabled={savingTeacherId === t.id}
                            className="text-xs font-bold rounded-xl px-2.5 py-2 outline-none"
                            style={{
                              background: a ? '#FEF3C7' : 'rgba(58,44,30,0.06)',
                              color: a ? '#92400E' : 'var(--ink-soft)',
                              border: '1.5px solid ' + (a ? 'rgba(217,119,6,0.3)' : 'rgba(58,44,30,0.12)'),
                            }}
                          >
                            <option value="available">Available</option>
                            {REASON_OPTIONS.map(r => (
                              <option key={r} value={r}>{REASON_LABEL[r]}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Today's coverage */}
            <div className="paper-card overflow-hidden">
              <div className="px-5 py-3" style={{ borderBottom: '1.5px solid rgba(58,44,30,0.12)' }}>
                <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Coverage for {formatDate(date)}</p>
              </div>
              {substitutions.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Sticker tone="green" size={64} radius={999} style={{ margin: '0 auto 14px' }}>
                    <Repeat size={26} className="text-ink-soft" />
                  </Sticker>
                  <p className="font-display font-bold text-ink">No coverage needed</p>
                  <p className="text-sm text-ink-soft mt-1">Every teacher is available on this date.</p>
                </div>
              ) : (
                <div>
                  {substitutions
                    .sort((a, b) => a.periodNumber - b.periodNumber)
                    .map((s, i) => (
                      <div
                        key={s.id}
                        className="px-5 py-3.5"
                        style={i < substitutions.length - 1 ? { borderBottom: '1px solid rgba(58,44,30,0.08)' } : undefined}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-ink">
                              Period {s.periodNumber} · {s.className}{s.subject ? ` — ${s.subject}` : ''}
                            </p>
                            <p className="text-xs text-ink-faint mt-0.5">
                              <span className="line-through">{s.originalTeacherName}</span>
                              {s.substituteTeacherName && <> → <span className="font-bold text-ink-soft">{s.substituteTeacherName}</span></>}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {savingSubId === s.id && <Loader2 size={14} className="animate-spin text-ink-faint" />}
                            {s.status === 'unresolved' && (
                              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full" style={{ background: '#FEF2F2', color: '#B91C1C' }}>
                                <AlertTriangle size={10} /> Needs pick
                              </span>
                            )}
                            {s.status === 'assigned_fallback' && (
                              <span
                                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full"
                                style={{ background: '#FFFBEB', color: '#92400E' }}
                                title="No teacher who teaches this subject was free — filled with the best available teacher instead."
                              >
                                <AlertTriangle size={10} /> No subject match
                              </span>
                            )}
                            <select
                              value={s.substituteTeacherId ?? ''}
                              onChange={e => e.target.value && reassign(s.id, e.target.value)}
                              disabled={savingSubId === s.id}
                              className="text-xs font-bold rounded-xl px-2.5 py-2 outline-none"
                              style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)', border: '1.5px solid rgba(58,44,30,0.12)' }}
                            >
                              <option value="" disabled>{s.substituteTeacherId ? 'Reassign…' : 'Assign…'}</option>
                              {teachers.filter(t => t.id !== s.originalTeacherId).map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {s.status === 'unresolved' && s.suggestion && (
                          <p className="flex items-start gap-1.5 text-xs text-ink-soft mt-2 pl-0.5">
                            <Lightbulb size={13} className="shrink-0 mt-0.5" style={{ color: '#AD8A2C' }} />
                            <span>
                              Consider swapping with Period {s.suggestion.swapPeriodNumber} ({s.suggestion.swapSubject}) —{' '}
                              <span className="font-bold">{s.suggestion.freeingTeacherName}</span> is free then, and{' '}
                              <span className="font-bold">{s.suggestion.movingTeacherName}</span> is free at Period {s.periodNumber} to swap into.
                            </span>
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
