'use client'
import PageHeader from '@/components/theme/PageHeader'
import TeacherAgentPanel from '@/components/agent/TeacherAgentPanel'

export default function AgentPage() {
  // A chat screen stays put — only the message list scrolls, the same way
  // every real chat app behaves. Previously this used the normal scrolling
  // page every other dashboard page uses (.paper-page), which let the whole
  // page — header included — scroll along with the chat, so the header
  // would slide out of view and the chat card would visibly jump as you
  // scrolled. h-[calc(100dvh-72px)] is the real viewport height minus
  // BottomNav's own height (--nav-height in globals.css), so this fits
  // exactly above it with nothing left over to scroll; md:h-dvh drops that
  // subtraction on desktop, where BottomNav doesn't exist.
  return (
    <div className="relative min-h-0 flex flex-col h-[calc(100dvh-72px)] md:h-dvh overflow-hidden" style={{ background: 'transparent' }}>
      <div className="shrink-0">
        <PageHeader title="My Agent" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col px-4 pt-2 relative z-10">
        <TeacherAgentPanel />
      </div>
    </div>
  )
}
