'use client'
import { useEffect, useState } from 'react'
import { CalendarCheck, CalendarOff, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'

const REASONS: { value: string; label: string }[] = [
  { value: 'available', label: "I'm in today" },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'late_arrival', label: 'Late Arrival' },
  { value: 'official_duty', label: 'Official Duty' },
]

/**
 * Floating circular button (matches the "Morning Briefing" button pattern
 * on this page) — always visible and clickable, not a one-shot dismissible
 * prompt. Lets a teacher check or change today's status at any time; the
 * icon/color reflects their current status at a glance.
 */
export default function AttendanceCircle() {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string | null>(null)   // null = available
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  function load() {
    fetch('/api/teacher/substitutes-today')
      .then(r => r.json())
      .then(data => setReason(data.onLeave ? (data.reason ?? 'other') : null))
      .catch(() => {})
  }

  useEffect(() => { load() }, [])

  async function answer(value: string) {
    setSaving(value)
    setError('')
    try {
      const res = await fetch('/api/teacher/substitutes-today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong — please try again.')
        return
      }
      setReason(value === 'available' ? null : value)
      setOpen(false)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-56 md:bottom-40 right-4 z-40 w-11 h-11 flex items-center justify-center rounded-full text-white active:scale-90 transition-transform"
        style={{ background: reason ? '#D97706' : '#5C8F52', border: '1.5px solid rgba(58,44,30,0.18)' }}
        title="Mark today's status"
      >
        {reason ? <CalendarOff size={17} /> : <CalendarCheck size={17} />}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Today's Status">
        <p className="text-sm text-ink-soft mb-4">Let the office know if you&apos;re in today — this updates any substitute coverage automatically.</p>
        {error && (
          <div className="text-sm px-4 py-3 rounded-2xl mb-3" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid rgba(185,28,28,0.15)' }}>
            {error}
          </div>
        )}
        <div className="space-y-2">
          {REASONS.map(r => {
            const active = r.value === 'available' ? reason === null : reason === r.value
            return (
              <button
                key={r.value}
                onClick={() => answer(r.value)}
                disabled={!!saving}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
                style={{
                  background: active ? 'var(--ink)' : 'rgba(58,44,30,0.06)',
                  color: active ? '#fff' : 'var(--ink-soft)',
                }}
              >
                {r.label}
                {saving === r.value && <Loader2 size={14} className="animate-spin" />}
              </button>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
