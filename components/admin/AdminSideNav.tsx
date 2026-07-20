'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, BookOpen, Library, CalendarDays, CalendarRange, LogOut, GraduationCap, ScanLine, Megaphone, Repeat } from 'lucide-react'
import clsx from 'clsx'
import { useAdmin } from '@/lib/admin-context'

const NAV = [
  { href: '/admin/dashboard',        label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/admin/teachers',         label: 'Teachers',         icon: Users },
  { href: '/admin/classes',          label: 'Classes',          icon: BookOpen },
  { href: '/admin/syllabus',         label: 'Syllabus',         icon: Library },
  { href: '/admin/timetable',        label: 'Timetable',        icon: CalendarDays },
  { href: '/admin/academic-calendar', label: 'Academic Calendar', icon: CalendarRange },
  { href: '/admin/substitutes',      label: 'Substitutes',      icon: Repeat },
  { href: '/admin/announcements',    label: 'Announcements',    icon: Megaphone },
  { href: '/admin/scanners',         label: 'Scanners',         icon: ScanLine },
]

export default function AdminSideNav() {
  const pathname = usePathname()
  const { admin, school, logout } = useAdmin()

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
          <p className="text-[11px] text-ink-soft font-medium mt-1 truncate">Admin Portal</p>
        </div>
      </div>

      {school && (
        <div className="px-4 pt-4">
          <div className="rounded-2xl px-3 py-2.5" style={{ background: 'rgba(58,44,30,0.05)', border: '1.5px solid rgba(58,44,30,0.08)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest text-ink-faint mb-0.5">School</p>
            <p className="text-xs font-bold text-ink truncate">{school.name}</p>
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href}>
              <div
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all text-left',
                  active ? 'text-white' : 'hover:bg-black/[0.04]',
                )}
                style={active ? { background: 'var(--ink)' } : { color: 'var(--ink-soft)' }}
              >
                <Icon size={18} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
                <span>{label}</span>
              </div>
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4" style={{ borderTop: '1.5px solid rgba(58,44,30,0.08)' }}>
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0" style={{ background: 'var(--ink)' }}>
            {admin?.name?.charAt(0).toUpperCase() ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-ink truncate">{admin?.name ?? 'Admin'}</p>
            <p className="text-[10px] text-ink-soft truncate">{admin?.email ?? ''}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-ink-soft hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  )
}
