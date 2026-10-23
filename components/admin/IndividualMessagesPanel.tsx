'use client'
import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'
import ChatHistory, { type ChatMessage } from '@/components/ui/ChatHistory'

type Persona = 'headmaster' | 'admin'

const PERSONA_META: Record<Persona, { label: string; color: string; placeholder: string }> = {
  headmaster: { label: 'Headmaster Agent', color: 'var(--admin-accent)', placeholder: 'Message the Headmaster Agent…' },
  admin: { label: 'Admin Agent', color: '#234A1D', placeholder: 'Message the Admin Agent…' },
}

interface ThreadState {
  messages: ChatMessage[]
  loading: boolean
}

const EMPTY_THREADS: Record<Persona, ThreadState> = {
  headmaster: { messages: [], loading: true },
  admin: { messages: [], loading: true },
}

// WhatsApp-shaped: a contact list on the left (one row per agent, with a
// preview of its last message), one open conversation on the right at a
// time. Both threads are fetched up front (for the previews + instant
// switching), but only the active one renders its full bubble history.
// No routing classifier involved — opening a contact already says which
// agent you mean (GET/POST /agent-messages/{persona}).
export default function IndividualMessagesPanel() {
  const { school } = useAdmin()
  const [active, setActive] = useState<Persona>('headmaster')
  const [threads, setThreads] = useState<Record<Persona, ThreadState>>(EMPTY_THREADS)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  function loadThread(persona: Persona) {
    if (!school) return
    backendFetch(`/api/admin/schools/${school.id}/agent-messages/${persona}`)
      .then(r => r.json())
      .then(d => setThreads(prev => ({ ...prev, [persona]: { messages: d.messages ?? [], loading: false } })))
      .catch(() => setThreads(prev => ({ ...prev, [persona]: { ...prev[persona], loading: false } })))
  }

  useEffect(() => {
    if (!school) return
    loadThread('headmaster')
    loadThread('admin')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threads[active].messages.length, active])

  async function send() {
    const content = input.trim()
    if (!content || !school || sending) return
    setSending(true)
    setError(null)
    setInput('')
    const optimistic: ChatMessage = {
      id: null, sender: 'admin', content, trace: [], pendingConfirmation: null, link: null,
      feedbackRequest: null, feedbackSubmittedAt: null, confirmedAt: null, createdAt: null,
    }
    setThreads(prev => ({ ...prev, [active]: { ...prev[active], messages: [...prev[active].messages, optimistic] } }))

    try {
      const res = await backendFetch(`/api/admin/schools/${school.id}/agent-messages/${active}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      setThreads(prev => ({
        ...prev,
        [active]: {
          ...prev[active],
          messages: [...prev[active].messages.slice(0, -1), data.adminMessage, ...(data.messages ?? [])],
        },
      }))
    } catch (err) {
      console.error(`[IndividualMessages:${active}] send failed:`, err)
      setError("Something went wrong sending that — try again.")
    } finally {
      setSending(false)
    }
  }

  async function confirm(message: ChatMessage) {
    if (!school || !message.pendingConfirmation) return
    const key = message.id ?? message.content
    setConfirmingKey(key)
    try {
      const res = await backendFetch(`/api/admin/schools/${school.id}/group-chat/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          tool: message.pendingConfirmation.tool,
          args: message.pendingConfirmation.args,
        }),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      setThreads(prev => ({
        ...prev,
        [active]: {
          ...prev[active],
          messages: prev[active].messages.map(m => (m.id ?? m.content) === key ? { ...m, confirmedAt: new Date().toISOString() } : m),
        },
      }))
    } catch (err) {
      console.error(`[IndividualMessages:${active}] confirm failed:`, err)
      setError("Couldn't complete that action — try again.")
    } finally {
      setConfirmingKey(null)
    }
  }

  function cancelConfirm(message: ChatMessage) {
    const key = message.id ?? message.content
    setThreads(prev => ({
      ...prev,
      [active]: {
        ...prev[active],
        messages: prev[active].messages.map(m => (m.id ?? m.content) === key ? { ...m, pendingConfirmation: null } : m),
      },
    }))
  }

  const activeMeta = PERSONA_META[active]
  const activeThread = threads[active]

  return (
    <div className="admin-card flex overflow-hidden" style={{ height: '70vh' }}>
      {/* Contact list */}
      <div className="w-[240px] shrink-0 flex flex-col py-2" style={{ borderRight: '1px solid var(--admin-border)' }}>
        {(Object.keys(PERSONA_META) as Persona[]).map(persona => {
          const meta = PERSONA_META[persona]
          const thread = threads[persona]
          const last = thread.messages[thread.messages.length - 1]
          const isActive = persona === active
          return (
            <button
              key={persona}
              type="button"
              onClick={() => setActive(persona)}
              className="flex items-center gap-3 px-4 py-3 text-left relative transition-colors"
              style={{ background: isActive ? 'var(--admin-accent-soft)' : 'transparent' }}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                  style={{ width: 3, height: 28, background: meta.color }}
                />
              )}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-black text-white"
                style={{ background: meta.color }}
              >
                {meta.label.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink truncate">{meta.label}</p>
                <p className="text-[11px] text-ink-faint truncate">
                  {thread.loading ? 'Loading…' : last ? last.content : 'No messages yet'}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Active conversation */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: '1px solid var(--admin-border)' }}>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[13px] font-black text-white"
            style={{ background: activeMeta.color }}
          >
            {activeMeta.label.charAt(0)}
          </div>
          <p className="text-sm font-black" style={{ color: activeMeta.color }}>{activeMeta.label}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ background: 'var(--admin-bg)' }}>
          {activeThread.loading ? (
            <p className="text-sm text-ink-faint italic">Loading…</p>
          ) : (
            <ChatHistory
              messages={activeThread.messages}
              onConfirm={confirm}
              onCancelConfirm={cancelConfirm}
              confirmingId={confirmingKey}
              showSenderLabel={false}
            />
          )}
          {sending && <p className="text-sm text-ink-faint italic mt-3">Thinking…</p>}
          <div ref={bottomRef} />
        </div>

        {error && <p className="text-[12px] font-semibold px-5 pt-2" style={{ color: '#B91C1C' }}>{error}</p>}

        <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--admin-border)' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send() }}
            placeholder={activeMeta.placeholder}
            className="admin-input flex-1 h-10 px-4 rounded-full text-sm"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !input.trim()}
            className="admin-btn-primary w-10 h-10 shrink-0 rounded-full flex items-center justify-center disabled:opacity-50"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
