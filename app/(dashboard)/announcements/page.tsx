'use client'
import { useState, useEffect } from 'react'
import { Megaphone, ClipboardList, AlertTriangle, PartyPopper } from 'lucide-react'
import type { Announcement } from '@/lib/types'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'

const CATEGORY_META: Record<Announcement['category'], { label: string; icon: typeof Megaphone; color: string; bg: string }> = {
  general: { label: 'General', icon: Megaphone,     color: '#3A2C1E', bg: '#F4E9D4' },
  exam:    { label: 'Exam',    icon: ClipboardList, color: '#b45309', bg: '#fffbeb' },
  urgent:  { label: 'Urgent',  icon: AlertTriangle, color: '#b91c1c', bg: '#fef2f2' },
  holiday: { label: 'Holiday', icon: PartyPopper,   color: '#0f766e', bg: '#f0fdfa' },
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/teacher/announcements')
      .then(r => r.json())
      .then(d => setAnnouncements(d.announcements ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="paper-page pb-28">

      <PageHeader
        eyebrow="From Your School"
        title="Announcements"
        subtitle={loading ? 'Loading…' : announcements.length > 0 ? `${announcements.length} announcement${announcements.length !== 1 ? 's' : ''}` : 'Nothing posted yet'}
      />

      <div className="px-4 pt-2 space-y-3 relative z-10">

        {loading && (
          <div className="paper-card p-8 text-center">
            <div className="w-8 h-8 border-4 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'rgba(58,44,30,0.15)', borderTopColor: 'var(--ink)' }} />
            <p className="text-sm text-ink-soft">Loading announcements…</p>
          </div>
        )}

        {!loading && announcements.length === 0 && (
          <div className="paper-card p-10 text-center">
            <Sticker tone="cream" size={72} radius={999} style={{ margin: '0 auto 16px' }}>
              <Megaphone size={30} className="text-ink-soft" />
            </Sticker>
            <p className="font-display font-bold text-ink text-lg">No announcements yet</p>
            <p className="text-sm text-ink-soft mt-1">Your school admin&apos;s notices — about exams, holidays, and other updates — will show up here.</p>
          </div>
        )}

        {announcements.map(a => {
          const meta = CATEGORY_META[a.category] ?? CATEGORY_META.general
          const Icon = meta.icon
          return (
            <div key={a.id} className="paper-card overflow-hidden p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
                  <Icon size={18} style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-ink text-sm">{a.title}</p>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-sm text-ink mt-1.5 leading-relaxed whitespace-pre-wrap">{a.body}</p>
                  <p className="text-[11px] text-ink-soft mt-2 font-medium">{a.adminName} · {timeAgo(a.createdAt)}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
