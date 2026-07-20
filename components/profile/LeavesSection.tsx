'use client'
import { useEffect, useState } from 'react'
import { CalendarOff, Plus, Loader2, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'

interface LeaveRow {
  id: string
  date: string   // YYYY-MM-DD
  reason: string
  note?: string
  source: 'teacher' | 'admin'
}

interface LeaveRange {
  startDate: string
  endDate: string
  reason: string
  note?: string
  source: 'teacher' | 'admin'
}

const REASON_LABEL: Record<string, string> = {
  on_leave: 'On Leave',
  late_arrival: 'Late Arrival',
  official_duty: 'Official Duty',
  other: 'Other',
}
const REASON_OPTIONS = ['on_leave', 'late_arrival', 'official_duty', 'other'] as const

// Stays in local-calendar terms throughout — toISOString() converts to UTC,
// which silently shifts a date back a day whenever the browser's local
// timezone is ahead of UTC (e.g. IST). Reading the Date's local fields
// directly avoids that.
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayStr() {
  return toDateStr(new Date())
}

function addDaysStr(d: string, delta: number) {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + delta)
  return toDateStr(dt)
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// The API stores one row per date; group consecutive same-reason days into a
// single visual entry so a multi-day request reads as one leave, not N rows.
function groupIntoRanges(rows: LeaveRow[]): LeaveRange[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const ranges: LeaveRange[] = []
  for (const row of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && last.reason === row.reason && last.note === row.note && last.source === row.source && addDaysStr(last.endDate, 1) === row.date) {
      last.endDate = row.date
    } else {
      ranges.push({ startDate: row.date, endDate: row.date, reason: row.reason, note: row.note, source: row.source })
    }
  }
  return ranges
}

export default function LeavesSection() {
  const [leaves, setLeaves] = useState<LeaveRow[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState(todayStr)
  const [endDate, setEndDate] = useState(todayStr)
  const [reason, setReason] = useState<string>('on_leave')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [cancelingKey, setCancelingKey] = useState<string | null>(null)

  function load() {
    fetch('/api/teacher/leaves')
      .then(r => r.json())
      .then(data => { setLeaves(data.leaves ?? []); setError(data.error ? (data.error as string) : '') })
      .catch(() => setError('Could not load your leave requests.'))
  }

  useEffect(() => { load() }, [])

  function openModal() {
    setStartDate(todayStr()); setEndDate(todayStr()); setReason('on_leave'); setNote(''); setFormError('')
    setOpen(true)
  }

  async function submit() {
    setSaving(true); setFormError('')
    try {
      const res = await fetch('/api/teacher/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, reason, note: note.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(data.error ?? 'Could not submit leave request.'); return }
      setLeaves(data.leaves ?? [])
      setOpen(false)
    } catch {
      setFormError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelRange(range: LeaveRange) {
    const key = `${range.startDate}-${range.endDate}`
    setCancelingKey(key)
    try {
      const res = await fetch('/api/teacher/leaves', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: range.startDate, endDate: range.endDate }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setLeaves(data.leaves ?? [])
    } finally {
      setCancelingKey(null)
    }
  }

  const ranges = leaves ? groupIntoRanges(leaves) : []

  return (
    <div className="paper-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-ink flex items-center gap-2">
          <CalendarOff size={16} className="text-ink-soft" /> Leaves
        </h2>
        <button
          type="button"
          onClick={openModal}
          className="flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
          style={{ background: 'var(--ink)' }}
        >
          <Plus size={13} /> Request
        </button>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {leaves === null ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-ink-soft" /></div>
      ) : ranges.length === 0 ? (
        <p className="text-sm text-ink-soft text-center py-4">No upcoming leave requests.</p>
      ) : (
        <div className="space-y-2">
          {ranges.map(range => {
            const key = `${range.startDate}-${range.endDate}`
            return (
              <div key={key} className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(58,44,30,0.04)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    {REASON_LABEL[range.reason] ?? range.reason}
                    {range.source === 'admin' && <span className="ml-2 text-[10px] font-bold text-ink-faint uppercase tracking-wide align-middle">set by admin</span>}
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {range.startDate === range.endDate ? formatDate(range.startDate) : `${formatDate(range.startDate)} – ${formatDate(range.endDate)}`}
                  </p>
                  {range.note && <p className="text-xs text-ink-faint mt-0.5 italic truncate">{range.note}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => cancelRange(range)}
                  disabled={cancelingKey === key}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 disabled:opacity-50"
                  title="Cancel"
                >
                  {cancelingKey === key ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Request Leave">
        <p className="text-sm text-ink-soft mb-4">
          Let the school know which dates you&apos;ll be out — this takes effect right away and updates substitute coverage automatically.
        </p>

        {formError && (
          <div className="text-sm px-4 py-3 rounded-2xl mb-3" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid rgba(185,28,28,0.15)' }}>
            {formError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">From</label>
            <input
              type="date"
              value={startDate}
              min={todayStr()}
              onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value) }}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">To</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <label className="label">Reason</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {REASON_OPTIONS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className="px-3 py-2 rounded-xl text-sm font-bold transition-colors"
              style={{
                background: reason === r ? 'var(--ink)' : 'rgba(58,44,30,0.06)',
                color: reason === r ? '#fff' : 'var(--ink-soft)',
              }}
            >
              {REASON_LABEL[r]}
            </button>
          ))}
        </div>

        <label className="label">Note (optional)</label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g. Family function"
          className="input-field mb-4"
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-1 py-2.5 rounded-2xl border border-[rgba(58,44,30,0.15)] text-sm font-bold text-ink-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex-1 paper-btn-primary disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Submit
          </button>
        </div>
      </Modal>
    </div>
  )
}
