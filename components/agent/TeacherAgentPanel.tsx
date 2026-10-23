'use client'
import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useApp } from '@/lib/context'
import { backendFetch } from '@/lib/backend'
import ChatHistory, { type ChatMessage, type FeedbackSubmission } from '@/components/ui/ChatHistory'

interface MemoryNote {
  id: string
  content: string
  createdAt: string | null
}

// Single-thread chat with this teacher's own Teacher Agent — no tab
// switcher, no contact list, since there's only one agent on this side
// (unlike the admin portal's Headmaster + Admin split). Same mechanics as
// the admin side's GroupChatPanel (load/send/confirm, optimistic send,
// ChatHistory + ConfirmCard), pointed at /api/teacher/agent/* instead.
export default function TeacherAgentPanel() {
  const { teacher, saveLessonFeedback } = useApp()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)
  const [submittingFeedbackKey, setSubmittingFeedbackKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<MemoryNote[]>([])
  const [memoryOpen, setMemoryOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  function load() {
    if (!teacher) { setLoading(false); return }
    backendFetch('/api/teacher/agent/messages')
      .then(r => r.json())
      .then(d => setMessages(d.messages ?? []))
      .finally(() => setLoading(false))
    backendFetch('/api/teacher/agent/memory')
      .then(r => r.json())
      .then(d => setNotes(d.notes ?? []))
      .catch(() => {})
  }

  async function forgetNote(noteId: string) {
    setNotes(prev => prev.filter(n => n.id !== noteId))
    try {
      await backendFetch('/api/teacher/agent/memory/forget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      })
    } catch (err) {
      console.error('[TeacherAgentPanel] forgetNote failed:', err)
    }
  }

  useEffect(() => { load() }, [teacher])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  // Same poll interval as app/(dashboard)/layout.tsx's app-wide one — that
  // one triggers period briefings regardless of page; this one just means a
  // teacher actually looking at My Agent sees a new briefing appear live
  // instead of needing to leave and reopen the page.
  useEffect(() => {
    if (!teacher) return
    const id = setInterval(load, 120_000)
    return () => clearInterval(id)
  }, [teacher])

  async function send() {
    const content = input.trim()
    if (!content || !teacher || sending) return
    setSending(true)
    setError(null)
    setInput('')
    const optimistic: ChatMessage = {
      id: null, sender: 'teacher', content, trace: [], pendingConfirmation: null, link: null,
      feedbackRequest: null, feedbackSubmittedAt: null, confirmedAt: null, createdAt: null,
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const res = await backendFetch('/api/teacher/agent/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      setMessages(prev => [...prev.slice(0, -1), data.adminMessage, ...(data.messages ?? [])])
    } catch (err) {
      console.error('[TeacherAgentPanel] send failed:', err)
      setError("Something went wrong sending that — try again.")
    } finally {
      setSending(false)
    }
  }

  async function confirm(message: ChatMessage) {
    if (!teacher || !message.pendingConfirmation) return
    const key = message.id ?? message.content
    setConfirmingKey(key)
    try {
      const res = await backendFetch('/api/teacher/agent/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          tool: message.pendingConfirmation.tool,
          args: message.pendingConfirmation.args,
        }),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      // Most actions always succeed or throw, but generate_prep_material can
      // legitimately refuse (no textbook match) without throwing — show that
      // as a real error, not a silent "Done".
      if (data.ok === false) {
        setError(data?.result?.error || "Couldn't complete that action — try again.")
        return
      }
      setMessages(prev => prev.map(m =>
        (m.id ?? m.content) === key ? { ...m, confirmedAt: new Date().toISOString() } : m,
      ))
    } catch (err) {
      console.error('[TeacherAgentPanel] confirm failed:', err)
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

  // The actual save (lesson_feedback, the interpret-feedback-only-when-flagged
  // cost rule, classes.feedback_profile) goes through the exact same
  // saveLessonFeedback Classroom Mode's own reflection screen already uses
  // (lib/context.tsx) — this just also tells the backend to mark the chat
  // message answered so the card doesn't keep rendering as interactive.
  async function submitFeedback(message: ChatMessage, submission: FeedbackSubmission) {
    if (!teacher || !message.id) return
    const key = message.id ?? message.content
    setSubmittingFeedbackKey(key)
    try {
      await saveLessonFeedback(submission)
      await backendFetch('/api/teacher/agent/feedback-submitted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id }),
      })
      setMessages(prev => prev.map(m =>
        (m.id ?? m.content) === key ? { ...m, feedbackSubmittedAt: new Date().toISOString() } : m,
      ))
    } catch (err) {
      console.error('[TeacherAgentPanel] submitFeedback failed:', err)
      setError("Couldn't save that feedback — try again.")
    } finally {
      setSubmittingFeedbackKey(null)
    }
  }

  // h-full, not its own height calc — the parent (app/(dashboard)/agent/page.tsx)
  // is now a fixed-viewport flex column that hands this exactly the space
  // above BottomNav, so there's one source of truth for the math instead of
  // two numbers that have to agree.
  return (
    <div className="admin-card flex flex-col overflow-hidden h-full">
      <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: '1px solid var(--card-border)' }}>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[13px] font-black text-white"
          style={{ background: 'var(--forest)' }}
        >
          M
        </div>
        <p className="text-sm font-black" style={{ color: 'var(--forest)' }}>My Agent</p>
      </div>

      {notes.length > 0 && (
        <div className="px-5 py-2" style={{ borderBottom: '1px solid var(--card-border)' }}>
          <button
            type="button"
            onClick={() => setMemoryOpen(o => !o)}
            className="text-[11px] font-bold flex items-center gap-1"
            style={{ color: 'var(--ink-faint)' }}
          >
            <span>{memoryOpen ? '▾' : '▸'}</span>
            What I remember ({notes.length})
          </button>
          {memoryOpen && (
            <div className="mt-2 space-y-1.5">
              {notes.map(n => (
                <div key={n.id} className="flex items-start justify-between gap-2 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                  <span className="flex-1">{n.content}</span>
                  <button
                    type="button"
                    onClick={() => forgetNote(n.id)}
                    className="shrink-0 text-[11px] font-bold px-1"
                    style={{ color: 'var(--ink-faint)' }}
                    aria-label="Forget this note"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4" style={{ background: 'var(--paper-bg)' }}>
        {loading ? (
          <p className="text-sm text-ink-faint italic">Loading…</p>
        ) : (
          <ChatHistory
            messages={messages}
            onConfirm={confirm}
            onCancelConfirm={cancelConfirm}
            confirmingId={confirmingKey}
            onSubmitFeedback={submitFeedback}
            submittingFeedbackId={submittingFeedbackKey}
            showSenderLabel={false}
          />
        )}
        {sending && <p className="text-sm text-ink-faint italic mt-3">Thinking…</p>}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-[12px] font-semibold px-5 pt-2" style={{ color: '#B91C1C' }}>{error}</p>}

      <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--card-border)' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="Message My Agent…"
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
