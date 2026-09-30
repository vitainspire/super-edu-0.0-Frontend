'use client'
import { useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, LayoutGrid, CalendarDays, ClipboardList, MoreHorizontal } from '@/components/ui/icons'
import clsx from 'clsx'
import { useApp } from '@/lib/context'
import { computeHomeAlerts } from '@/lib/logic/home-alerts'

const NAV_ITEMS = [
  { href: '/home',      label: 'Home',      Icon: Home,          match: (p: string) => p === '/home' },
  { href: '/classes',   label: 'Classes',   Icon: LayoutGrid,    match: (p: string) => p.startsWith('/classes') },
  { href: '/timetable', label: 'Timetable', Icon: CalendarDays,  match: (p: string) => p.startsWith('/timetable') },
  { href: '/tests',     label: 'Tests',     Icon: ClipboardList, match: (p: string) => p.startsWith('/tests') },
  { href: '/more',      label: 'More',      Icon: MoreHorizontal, match: (p: string) =>
      p.startsWith('/more') || p.startsWith('/settings') || p.startsWith('/profile') ||
      p.startsWith('/support') || p.startsWith('/announcements') || p.startsWith('/alerts') },
]

export default function BottomNav() {
  const path   = usePathname()
  const router = useRouter()
  const { classes, sessions, students, getStudentWarnings } = useApp()

  const alertCount = useMemo(
    () => computeHomeAlerts(classes, sessions, students, getStudentWarnings).length,
    [classes, sessions, students, getStudentWarnings],
  )

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom bg-white"
      style={{ borderTop: '1px solid var(--card-border)', boxShadow: '0 -2px 8px rgba(15,23,42,0.04)' }}>
      <div className="max-w-[480px] mx-auto flex items-center px-2 py-2">
        {NAV_ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(path)
          const badge  = href === '/more' ? alertCount : 0

          return (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-xl"
            >
              <div className="relative flex items-center justify-center h-7 w-14 rounded-full transition-colors"
                style={{ background: active ? 'var(--forest)' : 'transparent' }}>
                <Icon
                  size={21}
                  strokeWidth={active ? 2.4 : 1.8}
                  style={{ color: active ? '#fff' : '#94A3B8' }}
                />
                {badge > 0 && (
                  <span
                    className="absolute -top-1 right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center leading-none"
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span
                className="text-[10.5px] font-bold"
                style={{ color: active ? 'var(--forest)' : '#94A3B8' }}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
