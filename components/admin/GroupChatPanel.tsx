'use client'
import { useEffect, useRef, useState } from 'react'
import { MessagesSquare, Send } from 'lucide-react'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'
import ChatHistory, { type ChatMessage } from '@/components/ui/ChatHistory'

// The shared room: one thread, both the Headmaster Agent and the Admin Agent
// can respond (routed automatically — see POST /group-chat/messages).
// Extracted from what was originally its own page (app/(admin)/admin/
// group-chat/page.tsx) so it can be one tab of the Agents page instead,
// alongside IndividualMessagesPanel. Argus (components/admin/
// AdminAskAssistant.tsx) stays exactly as it is; this is additive.
export default function GroupChatPanel() {
  const { school } = useAdmin()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  function load() {
    if (!school) { setLoading(false); return }
    backendFetch(`/api/admin/schools/${school.id}/group-chat/messages`)
      .then(r => r.json())
      .then(d => setMessages(d.messages ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [school])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

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
    setMessages(prev => [...prev, optimistic])

    try {
      const res = await backendFetch(`/api/admin/schools/${school.id}/group-chat/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      setMessages(prev => [...prev.slice(0, -1), data.adminMessage, ...(data.messages ?? [])])
    } catch (err) {
      console.error('[GroupChatPanel] send failed:', err)
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
      setMessages(prev => prev.map(m =>
        (m.id ?? m.content) === key ? { ...m, confirmedAt: new Date().toISOString() } : m,
      ))
    } catch (err) {
      console.error('[GroupChatPanel] confirm failed:', err)
      setError("Couldn't complete that action — try again.")
    } finally {
      setConfirmingKey(null)
    }
  }

  function cancelConfirm(message: ChatMessage) {
    const key = message.id ?? message.content
    setMessages(prev => prev.map(m =>
      (m.id ?? m.content) === key ? { ...m, pendingConfirmation: null } : m,
    ))
  }

  return (
    <div className="admin-card flex flex-col overflow-hidden" style={{ height: '70vh' }}>
      <div className="flex-1 overflow-y-auto px-5 py-4" style={{ background: 'var(--admin-bg)' }}>
        {loading ? (
          <p className="text-sm text-ink-faint italic">Loading…</p>
        ) : (
          <ChatHistory
            messages={messages}
            onConfirm={confirm}
            onCancelConfirm={cancelConfirm}
            confirmingId={confirmingKey}
          />
        )}
        {sending && <p className="text-sm text-ink-faint italic mt-3">Thinking…</p>}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-[12px] font-semibold px-5 pt-2" style={{ color: '#B91C1C' }}>{error}</p>}

      <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--admin-border)' }}>
        <MessagesSquare size={16} className="text-ink-faint shrink-0" />
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="Ask the Headmaster Agent or Admin Agent…"
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
  )
}
