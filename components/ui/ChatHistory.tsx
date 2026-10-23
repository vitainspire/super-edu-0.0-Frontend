'use client'
import { useState } from 'react'
import Link from 'next/link'
import ConfirmCard from '@/components/ui/ConfirmCard'

export interface TraceStep {
  tool: string
  args: Record<string, unknown>
  ok: boolean
}

export interface PendingConfirmation {
  tool: string
  args: Record<string, unknown>
  label: string
}

export interface MessageLink {
  label: string
  href: string
}

export interface FeedbackRequest {
  classId: string
  className: string
  subject: string
  topic: string
  subtopic?: string | null
}

export type FeedbackAnswer = 'yes' | 'somewhat' | 'no'

export interface FeedbackSubmission {
  classId: string
  topic: string
  subtopic?: string
  engagement: FeedbackAnswer
  comprehension: FeedbackAnswer
  pacing: FeedbackAnswer
  otherFeedback?: string
}

export interface ChatMessage {
  id: string | null
  sender: 'admin' | 'headmaster_agent' | 'admin_agent' | 'teacher' | 'teacher_agent'
  content: string
  trace: TraceStep[]
  pendingConfirmation: PendingConfirmation | null
  link: MessageLink | null
  // Separate from `sender`: a performance-watch coaching message is still
  // sent as this teacher's own agent (sender stays 'teacher_agent', so it
  // lands in their one thread like everything else), but it originated from
  // the Headmaster Agent's own sweep. This is what lets the bubble below be
  // color-coded by where it actually came from, not just who's "speaking."
  sourcePersona: 'headmaster' | null
  feedbackRequest: FeedbackRequest | null
  feedbackSubmittedAt: string | null
  confirmedAt: string | null
  createdAt: string | null
}

// Same three questions, same wording, as Classroom Mode's own post-lesson
// reflection screen (app/(dashboard)/classroom-mode/[classId]/feedback/page.tsx)
// — a teacher should recognize this as the same check-in, not a different one,
// whichever surface they answer it from.
const FEEDBACK_QUESTIONS: { key: 'engagement' | 'comprehension' | 'pacing'; text: string }[] = [
  { key: 'engagement', text: 'Did students engage with the lesson?' },
  { key: 'comprehension', text: 'Was the topic too complex, or was it fine for this class?' },
  { key: 'pacing', text: 'Was the way we explained it relevant to the topic?' },
]
const FEEDBACK_OPTIONS: { value: FeedbackAnswer; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'somewhat', label: 'Somewhat' },
  { value: 'no', label: 'No' },
]

function FeedbackCard({
  request, busy, onSubmit,
}: {
  request: FeedbackRequest
  busy: boolean
  onSubmit: (submission: FeedbackSubmission) => void
}) {
  const [answers, setAnswers] = useState<Partial<Record<'engagement' | 'comprehension' | 'pacing', FeedbackAnswer>>>({})
  const [note, setNote] = useState('')
  const allAnswered = FEEDBACK_QUESTIONS.every(q => answers[q.key])

  return (
    <div className="p-3 rounded-2xl space-y-3" style={{ background: 'rgba(15,23,42,0.05)', border: '1.5px solid var(--card-border)' }}>
      {FEEDBACK_QUESTIONS.map(q => (
        <div key={q.key}>
          <p className="text-[12.5px] font-semibold text-ink mb-1.5">{q.text}</p>
          <div className="flex gap-1.5">
            {FEEDBACK_OPTIONS.map(opt => {
              const selected = answers[q.key] === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAnswers(prev => ({ ...prev, [q.key]: opt.value }))}
                  disabled={busy}
                  className="flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50"
                  style={{
                    background: selected ? 'var(--ink)' : 'white',
                    color: selected ? '#fff' : 'var(--ink-soft)',
                    border: '1px solid var(--card-border)',
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Anything else? (optional)"
        rows={2}
        disabled={busy}
        className="w-full text-[12.5px] text-ink placeholder-ink-faint bg-white rounded-xl px-2.5 py-2 border resize-none focus:outline-none disabled:opacity-50"
        style={{ borderColor: 'var(--card-border)' }}
      />
      <button
        type="button"
        onClick={() => onSubmit({
          classId: request.classId, topic: request.topic, subtopic: request.subtopic ?? undefined,
          engagement: answers.engagement!, comprehension: answers.comprehension!, pacing: answers.pacing!,
          otherFeedback: note.trim() || undefined,
        })}
        disabled={!allAnswered || busy}
        className="admin-btn-primary w-full h-9 rounded-xl text-xs font-bold text-white disabled:opacity-50"
      >
        {busy ? '…' : 'Submit feedback'}
      </button>
    </div>
  )
}

// This component is portal-agnostic (no useAdmin()/useApp() coupling) and is
// reused as-is on both the admin portal (admin/headmaster_agent/admin_agent)
// and the teacher portal (teacher/teacher_agent). Agent personas get their
// own color so a reader can tell at a glance who's talking without reading
// the label every time. --admin-accent and --forest resolve to the exact
// same navy (see globals.css), so Admin Agent instead reuses the "green" ink
// already established in the admin portal's own ADMIN_PALETTE
// (lib/admin-theme.ts) for tone-coding — a real second color already in
// this app's vocabulary, not a new one invented here.
export const SENDER_META: Record<ChatMessage['sender'], { label: string; color: string; initial: string }> = {
  admin: { label: 'You', color: 'var(--ink)', initial: 'Y' },
  headmaster_agent: { label: 'Headmaster Agent', color: 'var(--admin-accent)', initial: 'H' },
  admin_agent: { label: 'Admin Agent', color: '#234A1D', initial: 'A' },
  teacher: { label: 'You', color: 'var(--ink)', initial: 'Y' },
  teacher_agent: { label: 'My Agent', color: 'var(--forest)', initial: 'M' },
}

function summarizeArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).filter(([k]) => k !== 'tool')
  if (!entries.length) return ''
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(', ')
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function Avatar({ sender }: { sender: ChatMessage['sender'] }) {
  const meta = SENDER_META[sender]
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[12px] font-black text-white"
      style={{ background: meta.color }}
    >
      {meta.initial}
    </div>
  )
}

// WhatsApp-style bubbles: your own messages right-aligned in a tinted
// bubble, everyone else's left-aligned in a plain one, both with a slightly
// squared-off corner on the "pointing" side instead of a literal tail graphic
// (simpler to render, same read at a glance). `showSenderLabel` is on for
// Group Chat (more than one possible sender replying) and off for a 1:1
// Individual Messages thread, where who you're talking to is already the
// whole point of being in that thread.
export default function ChatHistory({
  messages,
  onConfirm,
  onCancelConfirm,
  confirmingId,
  onSubmitFeedback,
  submittingFeedbackId,
  showSenderLabel = true,
}: {
  messages: ChatMessage[]
  onConfirm: (message: ChatMessage) => void
  onCancelConfirm: (message: ChatMessage) => void
  confirmingId: string | null
  // Optional — only the teacher portal has anything to do with a feedback
  // request. Submitting it is the caller's job (TeacherAgentPanel, via the
  // real saveLessonFeedback from useApp()), not this component's — same
  // reason this file has no useApp()/useAdmin() of its own: it's shared
  // with the admin portal, which never sees a feedbackRequest at all.
  onSubmitFeedback?: (message: ChatMessage, submission: FeedbackSubmission) => void
  submittingFeedbackId?: string | null
  showSenderLabel?: boolean
}) {
  const [expandedTraces, setExpandedTraces] = useState<Record<string, boolean>>({})

  if (!messages.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-ink-faint">No messages yet — say something below.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((m, i) => {
        const meta = SENDER_META[m.sender]
        const key = m.id ?? `${m.sender}-${i}`
        const showConfirm = m.pendingConfirmation && !m.confirmedAt
        const outgoing = m.sender === 'admin' || m.sender === 'teacher'
        const traceExpanded = !!expandedTraces[key]
        const traceColor = outgoing ? 'rgba(255,255,255,0.75)' : 'var(--ink-faint)'
        const fromHeadmaster = !outgoing && m.sourcePersona === 'headmaster'

        return (
          <div key={key} className={`flex items-end gap-2 ${outgoing ? 'flex-row-reverse' : 'flex-row'}`}>
            {!outgoing && <Avatar sender={fromHeadmaster ? 'headmaster_agent' : m.sender} />}

            <div className="flex flex-col max-w-[78%]" style={{ alignItems: outgoing ? 'flex-end' : 'flex-start' }}>
              {!outgoing && (fromHeadmaster ? (
                <span className="text-[10px] font-black uppercase tracking-wide mb-0.5 ml-1" style={{ color: SENDER_META.headmaster_agent.color }}>
                  {SENDER_META.headmaster_agent.label}
                </span>
              ) : showSenderLabel && (
                <span className="text-[10px] font-black uppercase tracking-wide mb-0.5 ml-1" style={{ color: meta.color }}>
                  {meta.label}
                </span>
              ))}

              <div
                className="px-3.5 py-2.5 text-sm leading-snug whitespace-pre-wrap"
                style={{
                  background: outgoing ? 'var(--admin-accent)' : fromHeadmaster ? 'var(--admin-accent-soft)' : 'white',
                  color: outgoing ? 'white' : 'var(--ink)',
                  border: outgoing ? 'none' : fromHeadmaster ? '1.5px solid var(--admin-accent)' : '1px solid var(--admin-border)',
                  borderRadius: 16,
                  borderBottomRightRadius: outgoing ? 4 : 16,
                  borderBottomLeftRadius: outgoing ? 16 : 4,
                  boxShadow: 'var(--admin-shadow-sm)',
                }}
              >
                {m.content}

                {m.link && (
                  <div className="mt-2">
                    <Link
                      href={m.link.href}
                      className="inline-flex items-center gap-1 text-[12.5px] font-bold underline underline-offset-2"
                      style={{ color: outgoing ? 'white' : 'var(--admin-accent)' }}
                    >
                      {m.link.label} →
                    </Link>
                  </div>
                )}

                {m.trace.length > 0 && (
                  <div
                    className="mt-2 pt-2"
                    style={{ borderTop: `1px solid ${outgoing ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.08)'}` }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedTraces(prev => ({ ...prev, [key]: !prev[key] }))}
                      className="text-[10.5px] font-mono flex items-center gap-1"
                      style={{ color: traceColor }}
                    >
                      <span>{traceExpanded ? '▾' : '▸'}</span>
                      🔧 {m.trace.length} tool call{m.trace.length > 1 ? 's' : ''}
                    </button>
                    {traceExpanded && (
                      <div className="space-y-0.5 mt-1">
                        {m.trace.map((step, si) => (
                          <p key={si} className="text-[10.5px] font-mono" style={{ color: traceColor }}>
                            🔧 {step.tool}
                            {summarizeArgs(step.args) ? `(${summarizeArgs(step.args)})` : ''}
                            {step.ok ? '' : ' — error'}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {formatTime(m.createdAt) && (
                <span className="text-[10px] text-ink-faint mt-0.5 mx-1">{formatTime(m.createdAt)}</span>
              )}

              {showConfirm && m.pendingConfirmation && (
                <div className="mt-1 w-full">
                  <ConfirmCard
                    label={m.pendingConfirmation.label}
                    busy={confirmingId === key}
                    onConfirm={() => onConfirm(m)}
                    onCancel={() => onCancelConfirm(m)}
                  />
                </div>
              )}
              {m.confirmedAt && (
                <p className="text-[12px] font-semibold mt-1 mx-1" style={{ color: '#234A1D' }}>✅ Done</p>
              )}

              {m.feedbackRequest && !m.feedbackSubmittedAt && onSubmitFeedback && (
                <div className="mt-1 w-full">
                  <FeedbackCard
                    request={m.feedbackRequest}
                    busy={submittingFeedbackId === key}
                    onSubmit={submission => onSubmitFeedback(m, submission)}
                  />
                </div>
              )}
              {m.feedbackSubmittedAt && (
                <p className="text-[12px] font-semibold mt-1 mx-1" style={{ color: '#234A1D' }}>✅ Feedback saved</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
