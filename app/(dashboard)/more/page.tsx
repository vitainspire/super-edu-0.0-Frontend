'use client'
import { useRouter } from 'next/navigation'
import { ChevronRight, Megaphone, Bell, CalendarDays } from 'lucide-react'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker, NotebookSticker, GearSticker, ChatQuestionSticker } from '@/components/theme/StickerIcon'

const ROWS = [
  { href: '/profile',           label: 'Profile',           Icon: NotebookSticker,      tone: 'coral' as const },
  { href: '/academic-calendar', label: 'Academic Calendar', Icon: CalendarDays,         tone: 'blue' as const, lucide: true },
  { href: '/settings',          label: 'Settings',          Icon: GearSticker,          tone: 'cream' as const },
  { href: '/announcements',     label: 'Announcements',     Icon: Megaphone,            tone: 'blue' as const, lucide: true },
  { href: '/alerts',            label: 'Alerts',             Icon: Bell,                 tone: 'gold' as const, lucide: true },
  { href: '/support',           label: 'Support',           Icon: ChatQuestionSticker,  tone: 'gold' as const },
]

export default function MorePage() {
  const router = useRouter()

  return (
    <div className="paper-page pb-28">
      <PageHeader title="Menu" back={false} />

      <div className="px-5 pt-4 relative z-10">
        <div className="paper-card overflow-hidden">
          {ROWS.map(({ href, label, Icon, tone, lucide }, i) => (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              className="menu-row"
              style={{ borderBottom: i < ROWS.length - 1 ? '1px solid rgba(58,44,30,0.08)' : 'none' }}
            >
              <Sticker tone={tone} size={44} radius={14}>
                {lucide ? <Icon size={20} className="text-ink-soft" /> : <Icon size={24} />}
              </Sticker>
              <span className="flex-1 font-bold text-ink text-[15px]">{label}</span>
              <ChevronRight size={16} className="text-ink-faint shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
