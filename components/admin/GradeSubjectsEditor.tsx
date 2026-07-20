'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Loader2, BookMarked, AlertCircle } from 'lucide-react'

interface GradeSubjectRow {
  id: string
  grade: string
  subject: string
  periodsPerWeek: number
  category: 'core' | 'special'
  orderIndex: number
}

const CATEGORY_META: Record<'core' | 'special', { label: string; color: string; bg: string }> = {
  core:    { label: 'Core',    color: '#31215C', bg: '#f5f3ff' },
  special: { label: 'Special', color: '#0f766e', bg: '#f0fdfa' },
}

interface Props {
  schoolId: string
  grade: string
}

export default function GradeSubjectsEditor({ schoolId, grade }: Props) {
  const [subjects, setSubjects] = useState<GradeSubjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newSubject, setNewSubject] = useState('')
  const [newPeriods, setNewPeriods] = useState('4')
  const [newCategory, setNewCategory] = useState<'core' | 'special'>('core')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const apiBase = `/api/admin/schools/${schoolId}/grade-subjects`

  const load = useCallback(() => {
    if (!grade) { setLoading(false); return }
    setLoading(true)
    fetch(`${apiBase}?grade=${encodeURIComponent(grade)}`)
      .then(r => r.json())
      .then(d => setSubjects(d.subjects ?? []))
      .catch(() => setError('Failed to load subjects'))
      .finally(() => setLoading(false))
  }, [apiBase, grade])

  useEffect(() => { load() }, [load])

  async function addSubject(e: React.FormEvent) {
    e.preventDefault()
    if (!newSubject.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, subject: newSubject.trim(), periodsPerWeek: Number(newPeriods) || 0, category: newCategory }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Error ${res.status}`)
        return
      }
      setNewSubject('')
      setNewPeriods('4')
      setNewCategory('core')
      load()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  async function updatePeriods(row: GradeSubjectRow, periodsPerWeek: number) {
    setSubjects(prev => prev.map(s => s.id === row.id ? { ...s, periodsPerWeek } : s))
    await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...row, periodsPerWeek }),
    })
  }

  async function updateCategory(row: GradeSubjectRow, category: 'core' | 'special') {
    setSubjects(prev => prev.map(s => s.id === row.id ? { ...s, category } : s))
    await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...row, category }),
    })
  }

  async function removeSubject(id: string) {
    setDeletingId(id)
    await fetch(apiBase, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setDeletingId(null)
    load()
  }

  const totalPeriods = subjects.reduce((sum, s) => sum + s.periodsPerWeek, 0)
  const corePeriods = subjects.filter(s => s.category === 'core').reduce((sum, s) => sum + s.periodsPerWeek, 0)
  const specialPeriods = totalPeriods - corePeriods

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-ink-soft" /></div>
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      {subjects.length === 0 ? (
        <div className="text-center py-8 rounded-2xl" style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.12)' }}>
          <BookMarked className="w-8 h-8 text-ink-faint mx-auto mb-2" />
          <p className="text-sm text-ink-soft font-semibold">No subjects yet for Grade {grade}</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white/70 divide-y divide-[rgba(58,44,30,0.1)] overflow-hidden" style={{ border: '1.5px solid rgba(58,44,30,0.14)' }}>
          {subjects.map(s => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 text-sm font-bold text-ink truncate">{s.subject}</span>
              <button
                type="button"
                onClick={() => updateCategory(s, s.category === 'core' ? 'special' : 'core')}
                title="Click to switch between Core and Special"
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0"
                style={{ background: CATEGORY_META[s.category].bg, color: CATEGORY_META[s.category].color }}
              >
                {CATEGORY_META[s.category].label}
              </button>
              <input
                type="number"
                min={0}
                max={40}
                value={s.periodsPerWeek}
                onChange={e => updatePeriods(s, Math.max(0, Number(e.target.value) || 0))}
                className="w-16 px-2 py-1.5 rounded-xl border text-sm text-center bg-white focus:outline-none focus:ring-2"
                style={{ borderColor: 'rgba(58,44,30,0.18)' }}
              />
              <span className="text-xs text-ink-faint w-16 shrink-0">/week</span>
              <button
                onClick={() => removeSubject(s.id)}
                disabled={deletingId === s.id}
                className="p-1.5 rounded-lg text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                {deletingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {subjects.length > 0 && (
        <p className="text-xs text-ink-faint px-1">
          Total: {totalPeriods} periods/week across {subjects.length} subject{subjects.length !== 1 ? 's' : ''} ({corePeriods} core · {specialPeriods} special)
        </p>
      )}

      <form onSubmit={addSubject} className="flex items-center gap-2 flex-wrap">
        <input
          value={newSubject}
          onChange={e => setNewSubject(e.target.value)}
          placeholder="e.g. Mathematics, Sports, Library..."
          className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2"
          style={{ borderColor: 'rgba(58,44,30,0.18)' }}
        />
        <div className="flex rounded-xl overflow-hidden shrink-0" style={{ border: '1.5px solid rgba(58,44,30,0.18)' }}>
          {(['core', 'special'] as const).map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setNewCategory(cat)}
              className="px-2.5 py-2 text-xs font-bold transition-colors"
              style={newCategory === cat
                ? { background: CATEGORY_META[cat].color, color: 'white' }
                : { background: 'white', color: 'var(--ink-soft)' }}
            >
              {CATEGORY_META[cat].label}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          max={40}
          value={newPeriods}
          onChange={e => setNewPeriods(e.target.value)}
          className="w-16 px-2 py-2 rounded-xl border text-sm text-center bg-white focus:outline-none focus:ring-2"
          style={{ borderColor: 'rgba(58,44,30,0.18)' }}
        />
        <button
          type="submit"
          disabled={saving || !newSubject.trim()}
          className="px-3 py-2 rounded-xl disabled:opacity-50"
          style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </button>
      </form>
    </div>
  )
}
