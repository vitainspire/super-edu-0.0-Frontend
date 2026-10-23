'use client'
import PageHeader from '@/components/theme/PageHeader'
import TeacherAgentPanel from '@/components/agent/TeacherAgentPanel'

export default function AgentPage() {
  return (
    <div className="paper-page pb-28">
      <PageHeader
        eyebrow="Just For You"
        title="My Agent"
        subtitle="Ask about your classes and students — every tool call it makes is shown inline."
      />
      <div className="px-4 pt-2 relative z-10">
        <TeacherAgentPanel />
      </div>
    </div>
  )
}
