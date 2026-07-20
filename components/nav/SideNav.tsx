'use client'
import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import {
  Home, LayoutGrid, GraduationCap, LogOut, Settings2, ClipboardList,
  CalendarDays, Megaphone, UserRound, HelpCircle,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '@/lib/context'
import { useRouter } from 'next/navigation'

// Alerts intentionally has no dedicated nav item — it surfaces via the
// "students need attention" card on Home instead, so it doesn't need a
// permanent slot in a nav that's meant to stay short.
const NAV_ITEMS = [
  { href: '/home',          label: 'Home',          Icon: Home },
  { href: '/classes',       label: 'Classes',       Icon: LayoutGrid },
  { href: '/timetable',     label: 'Timetable',     Icon: CalendarDays },
  { href: '/tests',         label: 'Tests',         Icon: ClipboardList },
  { href: '/announcements', label: 'Announcements', Icon: Megaphone },
]

const MORE_ITEMS = [
  { href: '/profile',  label: 'Profile',  Icon: UserRound },
  { href: '/settings', label: 'Settings', Icon: Settings2 },
  { href: '/support',  label: 'Support',  Icon: HelpCircle },
]

export default function SideNav() {
  const path = usePathname()
  const router = useRouter()
  const { teacher, classes, students, tests, marks, logout } = useApp()

  const pendingTestCount = useMemo(() => {
    const myClassIds = new Set(
      classes.filter(c => c.teacherId === teacher?.id).map(c => c.id)
    )
    return tests.filter(t => {
      if (!t.classId || !myClassIds.has(t.classId)) return false
      const classStudentCount = students.filter(s => s.classId === t.classId && s.isActive).length
      const enteredCount = new Set(marks.filter(m => m.testId === t.id).map(m => m.studentId)).size
      return classStudentCount > 0 && enteredCount < classStudentCount
    }).length
  }, [tests, marks, classes, students, teacher])

  const handleLogout = async () => { await logout(); router.replace('/teacher/login') }

  function renderItem({ href, label, Icon }: { href: string; label: string; Icon: typeof Home }) {
    const active = path === href || path.startsWith(href + '/')
    const isTests = href === '/tests'
    const badge = isTests ? pendingTestCount : 0

    return (
      <button
        key={href}
        type="button"
        onClick={() => router.push(href)}
        className={clsx(
          'w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all text-left',
          active ? 'text-white' : 'hover:bg-black/[0.04]',
        )}
        style={active
          ? { background: 'var(--ink)' }
          : { color: 'var(--ink-soft)' }}
      >
        <div className="relative shrink-0">
          <Icon size={18} strokeWidth={active ? 2.4 : 2} />
          {badge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center leading-none">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </div>
        <span>{label}</span>
        {badge > 0 && !active && (
          <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center"
            style={{ background: '#F8ECC9', color: '#AD8A2C' }}>
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <aside
      className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 overflow-y-auto"
      style={{ background: 'var(--paper-soft)', borderRight: '1.5px solid rgba(58,44,30,0.1)' }}
    >
      <div className="flex items-center gap-3 px-6 py-6" style={{ borderBottom: '1.5px solid rgba(58,44,30,0.08)' }}>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--ink)' }}>
          <GraduationCap size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-display font-bold text-ink text-base leading-none">EduTeach</p>
          <p className="text-[11px] text-ink-soft font-medium mt-1 truncate">{teacher?.schoolName ?? ''}</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(renderItem)}
        <div className="h-px my-2 mx-2" style={{ background: 'rgba(58,44,30,0.1)' }} />
        {MORE_ITEMS.map(renderItem)}
      </nav>

      <div className="px-4 py-4" style={{ borderTop: '1.5px solid rgba(58,44,30,0.08)' }}>
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
            style={{ background: 'var(--ink)' }}>
            {teacher?.name?.[0]?.toUpperCase() ?? 'T'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-ink truncate">{teacher?.name}</p>
            <p className="text-[10px] text-ink-soft truncate">{teacher?.subject}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-ink-soft hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  )
}
