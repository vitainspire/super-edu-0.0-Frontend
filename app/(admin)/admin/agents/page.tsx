'use client'
import { useState } from 'react'
import PageHeader from '@/components/theme/PageHeader'
import GroupChatPanel from '@/components/admin/GroupChatPanel'
import IndividualMessagesPanel from '@/components/admin/IndividualMessagesPanel'
import AgentActivityPanel from '@/components/admin/AgentActivityPanel'

type Tab = 'group' | 'individual' | 'activity'

const TABS: { key: Tab; label: string }[] = [
  { key: 'group', label: 'Group Chat' },
  { key: 'individual', label: 'Individual Messages' },
  { key: 'activity', label: 'Agent to Agent' },
]

export default function AgentsPage() {
  const [tab, setTab] = useState<Tab>('group')

  return (
    <div className="pb-10">
      <PageHeader
        title="Agents"
        eyebrow="Headmaster Agent & Admin Agent"
        subtitle={
          tab === 'group'
            ? 'Talk to both agents at once in one shared thread — every tool call they make is shown inline.'
            : tab === 'individual'
            ? 'A private thread with each agent — including what they bring up on their own, twice a day.'
            : "What the agents discuss among themselves — not sent to you directly, but visible here."
        }
        variant="admin"
      />

      <div className="px-5 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-4 p-1 rounded-2xl w-fit" style={{ background: 'rgba(15,23,42,0.05)' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="h-9 px-4 rounded-xl text-xs font-bold transition-colors"
              style={{
                background: tab === t.key ? 'white' : 'transparent',
                color: tab === t.key ? 'var(--ink)' : 'var(--ink-soft)',
                boxShadow: tab === t.key ? 'var(--admin-shadow-sm)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'group' ? <GroupChatPanel /> : tab === 'individual' ? <IndividualMessagesPanel /> : <AgentActivityPanel />}
      </div>
    </div>
  )
}
