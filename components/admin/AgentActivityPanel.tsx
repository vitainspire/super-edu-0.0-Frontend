'use client'
import { useEffect, useState } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'

interface ActivityEntry {
  id: string
  fromPersona: 'headmaster_agent' | 'admin_agent'
  toLabel: string
  toTeacherId: string | null
  question: string
  answer: string | null
  status: string
  createdAt: string | null
}

// Color-coding matches components/ui/ChatHistory.tsx's SENDER_META exactly,
// so "Headmaster Agent" reads the same navy here as it does in the other two
// tabs, and "Admin Agent" the same green.
const FROM_META: Record<ActivityEntry['fromPersona'], { label: string; color: string }> = {
  headmaster_agent: { label: 'Headmaster Agent', color: 'var(--admin-accent)' },
  admin_agent: { label: 'Admin Agent', color: '#234A1D' },
}

const STATUS_LABEL: Record<string, string> = {
  answered: 'Answered',
  pending_confirmation: 'Proposed an action',
  error: 'Error',
  step_limit: 'Took too long',
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// Read-only — this is a log of what the agents discuss among themselves
// (Headmaster <-> Admin via message_admin_agent/message_headmaster_agent,
// Headmaster -> a specific teacher's own agent via invoke_teacher_agent),
// not a thread an admin posts into. Same poll interval used elsewhere this
// session (~2 min) so it stays current without a manual refresh.
export default function AgentActivityPanel() {
  const { school } = useAdmin()
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  function load() {
    if (!school) { setLoading(false); return }
    backendFetch(`/api/admin/schools/${school.id}/agent-activity`)
      .then(r => r.json())
      .then(d => setActivity(d.activity ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [school])

  useEffect(() => {
    if (!school) return
    const id = setInterval(load, 120_000)
    return () => clearInterval(id)
  }, [school])

  return (
    <div className="admin-card flex flex-col overflow-hidden" style={{ height: '70vh' }}>
      <div className="flex-1 overflow-y-auto px-5 py-4" style={{ background: 'var(--paper-bg)' }}>
        {loading ? (
          <p className="text-sm text-ink-faint italic">Loading…</p>
        ) : activity.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-ink-faint">Nothing yet — this fills in as the agents coordinate with each other.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activity.map(a => {
              const from = FROM_META[a.fromPersona]
              return (
                <div
                  key={a.id}
                  className="px-4 py-3 rounded-2xl"
                  style={{ background: 'white', border: '1px solid var(--admin-border)', boxShadow: 'var(--admin-shadow-sm)' }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: from.color }}>
                      {from.label} <span style={{ color: 'var(--ink-faint)' }}>→</span> {a.toLabel}
                    </p>
                    <span className="text-[10px] text-ink-faint shrink-0">{formatTime(a.createdAt)}</span>
                  </div>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>{a.question}</p>
                  {a.answer && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{a.answer}</p>}
                  <p className="text-[10.5px] font-mono mt-1.5" style={{ color: a.status === 'error' ? '#B91C1C' : 'var(--ink-faint)' }}>
                    {STATUS_LABEL[a.status] || a.status}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
