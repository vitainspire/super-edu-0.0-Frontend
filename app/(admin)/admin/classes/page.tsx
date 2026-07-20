'use client'
import { useEffect, useState } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { BookOpen, Plus, Loader2, X, ChevronRight } from 'lucide-react'
import type { Class } from '@/lib/types'
import Link from 'next/link'
import { buildClassCombos } from '@/lib/classCombos'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'
import clsx from 'clsx'

const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const PRESET_SECTIONS = ['A', 'B', 'C', 'D']

type Tone = 'blue' | 'green' | 'coral' | 'gold' | 'violet' | 'pink'
const PALETTE: { tone: Tone; stat: string; ink: string }[] = [
  { tone: 'blue',   stat: 'stat-card-blue',   ink: '#1E3A55' },
  { tone: 'green',  stat: 'stat-card-green',  ink: '#234A1D' },
  { tone: 'coral',  stat: 'stat-card-coral',  ink: '#5C2416' },
  { tone: 'gold',   stat: 'stat-card-gold',   ink: '#4A3809' },
  { tone: 'violet', stat: 'stat-card-violet', ink: '#31215C' },
  { tone: 'pink',   stat: 'stat-card-pink',   ink: '#5C1F38' },
]

export default function ClassesPage() {
  const { school } = useAdmin()
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [grades, setGrades] = useState<string[]>([])
  const [sections, setSections] = useState<string[]>([])
  const [customSections, setCustomSections] = useState<string[]>([])
  const [customInput, setCustomInput] = useState('')
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear().toString())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const allSections = [...PRESET_SECTIONS, ...customSections]
  const allCombos = buildClassCombos(grades, sections)

  function existsAlready(grade: string, section: string) {
    return classes.some(c => c.grade === grade && c.section.toLowerCase() === section.toLowerCase())
  }
  const duplicateCombos = allCombos.filter(c => existsAlready(c.grade, c.section))
  const combos = allCombos.filter(c => !existsAlready(c.grade, c.section))

  function toggleGrade(g: string) {
    setGrades(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  }

  function toggleSection(s: string) {
    setSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function addCustomSection() {
    const val = customInput.trim().toUpperCase()
    if (!val || allSections.includes(val)) { setCustomInput(''); return }
    setCustomSections(prev => [...prev, val])
    setSections(prev => [...prev, val])
    setCustomInput('')
  }

  function removeCustomSection(s: string) {
    setCustomSections(prev => prev.filter(x => x !== s))
    setSections(prev => prev.filter(x => x !== s))
  }

  function resetForm() {
    setGrades([]); setSections([]); setCustomSections([]); setCustomInput('')
    setAcademicYear(new Date().getFullYear().toString())
    setSaveError(null)
  }

  function load() {
    if (!school) { setLoading(false); return }
    fetch(`/api/admin/schools/${school.id}/classes`)
      .then(r => r.json())
      .then(cd => setClasses(cd.classes ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [school])

  async function createClasses(e: React.FormEvent) {
    e.preventDefault()
    if (!school || combos.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const results = await Promise.allSettled(
        combos.map(c =>
          fetch(`/api/admin/schools/${school.id}/classes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: c.name, grade: c.grade, section: c.section, academicYear }),
          }).then(async res => {
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.error ?? `${c.name}: ${res.status}`)
            }
          })
        )
      )
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed.length > 0) {
        setSaveError(
          failed.length === 1
            ? String(failed[0].reason)
            : `${failed.length} of ${combos.length} class${combos.length !== 1 ? 'es' : ''} failed to create.`
        )
      } else {
        setShowCreate(false)
        resetForm()
      }
      load()
    } catch {
      setSaveError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  // Group classes by grade — sections live under their grade
  const gradeGroups = Object.entries(
    classes.reduce((acc, c) => {
      (acc[c.grade] ??= []).push(c)
      return acc
    }, {} as Record<string, Class[]>)
  ).sort(([a], [b]) => Number(a) - Number(b) || a.localeCompare(b))

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <PageHeader
        title="Classes"
        back={false}
        subtitle={`${gradeGroups.length} grade${gradeGroups.length !== 1 ? 's' : ''} · ${classes.length} section${classes.length !== 1 ? 's' : ''} in ${school?.name ?? 'your school'}`}
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 font-bold px-4 py-2.5 rounded-2xl text-xs active:scale-95 transition-transform"
            style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
          >
            <Plus size={14} strokeWidth={2.5} /> Create Classes
          </button>
        }
      />

      <div className="px-5 pt-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-ink-soft" />
          </div>
        ) : gradeGroups.length === 0 ? (
          <div className="paper-card px-6 py-16 text-center">
            <Sticker tone="cream" size={72} radius={999} style={{ margin: '0 auto 16px' }}>
              <BookOpen size={30} className="text-ink-soft" />
            </Sticker>
            <p className="font-display font-bold text-ink text-lg">No classes yet</p>
            <p className="text-sm text-ink-soft mt-1">Create your first class to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {gradeGroups.map(([grade, secs], i) => {
              const palette = PALETTE[i % PALETTE.length]
              return (
                <Link
                  key={grade}
                  href={`/admin/classes/grade/${encodeURIComponent(grade)}`}
                  className={clsx('stat-card', palette.stat, 'block')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display font-bold text-xl leading-tight" style={{ color: palette.ink }}>Grade {grade}</p>
                      <p className="text-xs font-semibold mt-1" style={{ color: palette.ink, opacity: 0.75 }}>
                        {secs.length} section{secs.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <ChevronRight size={18} style={{ color: palette.ink, opacity: 0.5 }} className="shrink-0 mt-1" />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {secs.map(s => (
                      <span
                        key={s.id}
                        className="text-xs font-bold px-2 py-1 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.55)', color: palette.ink }}
                      >
                        {s.section || s.name}
                      </span>
                    ))}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="paper-card bg-[var(--paper-soft)] w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display font-bold text-ink text-lg mb-5">Create Classes</h2>
            <form onSubmit={createClasses} className="space-y-4">

              {/* Grade multiselect */}
              <div>
                <label className="block text-sm font-bold text-ink mb-1.5">Grades * <span className="text-ink-faint font-normal">(select one or more)</span></label>
                <div className="grid grid-cols-6 gap-1.5">
                  {GRADES.map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGrade(g)}
                      className="py-2 rounded-xl text-sm font-bold transition-colors"
                      style={grades.includes(g)
                        ? { background: 'var(--ink)', color: 'var(--paper-soft)' }
                        : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section multiselect + custom */}
              <div>
                <label className="block text-sm font-bold text-ink mb-1.5">Sections * <span className="text-ink-faint font-normal">(select one or more)</span></label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {allSections.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSection(s)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-bold transition-colors"
                      style={sections.includes(s)
                        ? { background: 'var(--ink)', color: 'var(--paper-soft)' }
                        : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
                    >
                      {s}
                      {customSections.includes(s) && (
                        <X className="w-3 h-3" onClick={e => { e.stopPropagation(); removeCustomSection(s) }} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSection())}
                    placeholder="Custom section e.g. Blue, Ganga…"
                    className="flex-1 px-4 py-2 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2"
                    style={{ borderColor: 'rgba(58,44,30,0.18)' }}
                  />
                  <button
                    type="button"
                    onClick={addCustomSection}
                    disabled={!customInput.trim()}
                    className="px-3 rounded-xl disabled:opacity-40"
                    style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-ink mb-1">Academic Year</label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={e => setAcademicYear(e.target.value)}
                  placeholder="2025"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2"
                  style={{ borderColor: 'rgba(58,44,30,0.18)' }}
                />
              </div>

              {/* Duplicate warning */}
              {duplicateCombos.length > 0 && (
                <div className="bg-amber-50 rounded-2xl p-3 border border-amber-200">
                  <p className="text-sm font-bold text-amber-800 mb-2">
                    {duplicateCombos.length} already exist{duplicateCombos.length === 1 ? 's' : ''} — will be skipped
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {duplicateCombos.map(c => (
                      <span key={c.name} className="text-xs font-medium text-amber-700 bg-white px-2 py-1 rounded-full border border-amber-200 line-through">
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
              {combos.length > 0 && (
                <div className="rounded-2xl p-3" style={{ background: 'rgba(58,44,30,0.05)', border: '1.5px solid rgba(58,44,30,0.14)' }}>
                  <p className="text-sm font-bold text-ink mb-2">
                    Will create {combos.length} class{combos.length !== 1 ? 'es' : ''}
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {combos.map(c => (
                      <span key={c.name} className="text-xs font-bold text-ink-soft bg-white px-2 py-1 rounded-full" style={{ border: '1.5px solid rgba(58,44,30,0.12)' }}>
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {allCombos.length > 0 && combos.length === 0 && duplicateCombos.length > 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                  All selected classes already exist — nothing new to create.
                </p>
              )}

              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{saveError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); resetForm() }}
                  className="flex-1 py-2.5 rounded-xl border text-sm font-bold text-ink-soft"
                  style={{ borderColor: 'rgba(58,44,30,0.18)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || combos.length === 0}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : combos.length > 1 ? `Create ${combos.length} Classes` : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
