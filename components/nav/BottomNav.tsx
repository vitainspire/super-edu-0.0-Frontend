'use client'
import { useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, LayoutGrid, CalendarDays, ClipboardList, MoreHorizontal } from 'lucide-react'
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom"
      style={{ background: 'var(--paper-soft)', borderTop: '1.5px solid rgba(58,44,30,0.12)' }}>
      <div className="max-w-[480px] mx-auto flex items-center px-2 py-2">
        {NAV_ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(path)
          const badge  = href === '/more' ? alertCount : 0

          return (
            <button
              key={href}
              type="button"
              onClick={() => router.push(href)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 min-h-[56px]"
            >
              <div className="relative">
                <Icon
                  size={22}
                  strokeWidth={active ? 2.4 : 1.8}
                  style={{ color: active ? 'var(--ink)' : '#B7A489' }}
                />
                {badge > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center leading-none"
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span
                className={clsx('text-[10.5px] font-bold')}
                style={{ color: active ? 'var(--ink)' : '#B7A489' }}
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
