'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Loader2, ClipboardList, AlertCircle, CalendarPlus } from 'lucide-react'

interface ExamPlanRow {
  id: string
  name: string
  count: number
  orderIndex: number
}

interface Props {
  schoolId: string
  onSchedule?: (name: string) => void
}

// The common ones — most schools use some subset of these — plus "Other" for
// board/school-specific naming (SA1/SA2, Periodic Test, Term 1/Term 2, etc.)
// that doesn't fit this list.
const EXAM_TYPES = ['Unit Test', 'Quarterly Exam', 'Half-Yearly Exam', 'Final Exam']
const OTHER = '__other__'

export default function ExamPlanEditor({ schoolId, onSchedule }: Props) {
  const [items, setItems]       = useState<ExamPlanRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [newName, setNewName]   = useState('')
  const [customName, setCustomName] = useState('')
  const [newCount, setNewCount] = useState('1')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const availableTypes = EXAM_TYPES.filter(t => !items.some(i => i.name === t))
  const isOther = newName === OTHER

  const apiBase = `/api/admin/schools/${schoolId}/exam-plan`

  const load = useCallback(() => {
    setLoading(true)
    fetch(apiBase)
      .then(r => r.json())
      .then(d => setItems(d.items ?? []))
      .catch(() => setError('Failed to load exam plan'))
      .finally(() => setLoading(false))
  }, [apiBase])

  useEffect(() => { load() }, [load])

  // Keep the dropdown pointed at a still-available type as the list changes.
  useEffect(() => {
    if (newName !== OTHER && !availableTypes.includes(newName)) setNewName(availableTypes[0] ?? OTHER)
  }, [availableTypes, newName])

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    const name = isOther ? customName.trim() : newName
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, count: Number(newCount) || 1 }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Error ${res.status}`)
        return
      }
      setNewName(availableTypes.filter(t => t !== name)[0] ?? OTHER)
      setCustomName('')
      setNewCount('1')
      load()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  async function updateCount(row: ExamPlanRow, count: number) {
    setItems(prev => prev.map(i => i.id === row.id ? { ...i, count } : i))
    await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...row, count }),
    })
  }

  async function removeItem(id: string) {
    setDeletingId(id)
    await fetch(apiBase, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setDeletingId(null)
    load()
  }

  const totalExams = items.reduce((sum, i) => sum + i.count, 0)

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

      {items.length === 0 ? (
        <div className="text-center py-8 rounded-2xl" style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.12)' }}>
          <ClipboardList className="w-8 h-8 text-ink-faint mx-auto mb-2" />
          <p className="text-sm text-ink-soft font-semibold">No exam types added yet</p>
          <p className="text-xs text-ink-faint mt-0.5">e.g. Unit Test, Quarterly, Half-Yearly, Final</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white/70 divide-y divide-[rgba(58,44,30,0.1)] overflow-hidden" style={{ border: '1.5px solid rgba(58,44,30,0.14)' }}>
          {items.map(i => (
            <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 text-sm font-bold text-ink">{i.name}</span>
              <input
                type="number"
                min={1}
                max={20}
                value={i.count}
                onChange={e => updateCount(i, Math.max(1, Number(e.target.value) || 1))}
                className="w-16 px-2 py-1.5 rounded-xl border text-sm text-center bg-white focus:outline-none focus:ring-2"
                style={{ borderColor: 'rgba(58,44,30,0.18)' }}
              />
              <span className="text-xs text-ink-faint w-16 shrink-0">this year</span>
              {onSchedule && (
                <button
                  onClick={() => onSchedule(i.name)}
                  title="Add a dated exam block for this exam type"
                  className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-black/[0.04] transition-colors"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => removeItem(i.id)}
                disabled={deletingId === i.id}
                className="p-1.5 rounded-lg text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                {deletingId === i.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="text-xs text-ink-faint px-1">Total: {totalExams} exam{totalExams !== 1 ? 's' : ''} across {items.length} type{items.length !== 1 ? 's' : ''} this year</p>
      )}

      <form onSubmit={addItem} className="flex items-center gap-2 flex-wrap">
        <select
          value={newName}
          onChange={e => setNewName(e.target.value)}
          className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2"
          style={{ borderColor: 'rgba(58,44,30,0.18)' }}
        >
          {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
          <option value={OTHER}>Other (custom name)…</option>
        </select>
        {isOther && (
          <input
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            placeholder="e.g. Periodic Test, SA1"
            className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2"
            style={{ borderColor: 'rgba(58,44,30,0.18)' }}
          />
        )}
        <input
          type="number"
          min={1}
          max={20}
          value={newCount}
          onChange={e => setNewCount(e.target.value)}
          className="w-16 px-2 py-2 rounded-xl border text-sm text-center bg-white focus:outline-none focus:ring-2"
          style={{ borderColor: 'rgba(58,44,30,0.18)' }}
        />
        <button
          type="submit"
          disabled={saving || (isOther ? !customName.trim() : !newName)}
          className="px-3 py-2 rounded-xl disabled:opacity-50"
          style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </button>
      </form>
    </div>
  )
}
