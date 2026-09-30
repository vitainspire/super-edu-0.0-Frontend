'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, BookOpen, Library, CalendarDays, CalendarRange, LogOut, GraduationCap, ScanLine, Megaphone, Repeat, ClipboardList, BookMarked, School } from 'lucide-react'
import clsx from 'clsx'
import { useAdmin } from '@/lib/admin-context'
import AdminNotificationBell from '@/components/admin/AdminNotificationBell'

// The one accent color against an otherwise white/black sidebar -- the logo
// mark, the active nav item, and the avatar all read as one palette. Dark
// enough that anything sitting on top of it needs white, not --ink.
const ACCENT = '#0000CD'

// Ordered by what blocks what, not alphabetically or by how often a page is
// used. Every one of these works in isolation, which is exactly the problem:
// a timetable built before teachers are assigned to classes publishes only the
// staffed periods and still reports success. Reading top to bottom is the
// order that avoids that.
//
//   Academic Calendar  the term and the bell schedule live here, and every
//                      later session count is measured against them
//   Teachers           created here, and assigned to classes on Classes
//   Classes            grade/section, then the students in them
//   Timetable          needs teachers, classes, subjects and the bell schedule
//   Syllabus           session estimates need the calendar and the timetable
//   Textbooks          ingest and review; grounds prep material once published
//   Scanners           optional, for answer-sheet scanning staff
//
// Then the pages used once the school is running.
const NAV: { href: string; label: string; icon: typeof Users; group?: string }[] = [
  { href: '/admin/dashboard',         label: 'Dashboard',         icon: LayoutDashboard },

  { href: '/admin/academic-calendar', label: 'Academic Calendar', icon: CalendarRange, group: 'Set up' },
  { href: '/admin/teachers',          label: 'Teachers',          icon: Users },
  { href: '/admin/classes',           label: 'Classes',           icon: BookOpen },
  { href: '/admin/timetable',         label: 'Timetable',         icon: CalendarDays },
  { href: '/admin/syllabus',          label: 'Syllabus',          icon: Library },
  { href: '/admin/textbooks',         label: 'Textbooks',         icon: BookMarked },
  { href: '/admin/scanners',          label: 'Scanners',          icon: ScanLine },

  { href: '/admin/substitutes',       label: 'Substitutes',       icon: Repeat, group: 'Day to day' },
  { href: '/admin/prep-materials',    label: 'Prep Materials',    icon: ClipboardList },
  { href: '/admin/announcements',     label: 'Announcements',     icon: Megaphone },
]

export default function AdminSideNav() {
  const pathname = usePathname()
  const { admin, school, logout } = useAdmin()

  return (
    <aside
      className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 overflow-y-auto"
      style={{ background: 'var(--admin-paper-bg)', borderRight: '3px solid var(--card-border)' }}
    >
      <div className="flex items-center gap-3 px-6 py-6" style={{ borderBottom: '1px solid rgba(27,24,15,0.1)' }}>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: ACCENT, border: '1.5px solid var(--card-border)' }}>
          <GraduationCap size={20} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-ink text-base leading-none">EduTeach</p>
          <p className="text-[11px] text-ink-faint font-medium mt-1 truncate">Admin Portal</p>
        </div>
        <AdminNotificationBell />
      </div>

      {school && (
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 bg-white" style={{ border: '1.5px solid var(--card-border)' }}>
            <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(27,24,15,0.05)' }}>
              <School size={13} className="text-ink-soft" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-ink-faint leading-none mb-1">School</p>
              <p className="text-xs font-bold text-ink truncate leading-none">{school.name}</p>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon, group }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <div key={href}>
              {/* A heading above the first item of each group, so the ordering
                  reads as deliberate rather than arbitrary. */}
              {group && (
                <div className="px-4 pt-4 pb-1.5">
                  <div style={{ height: 1, background: 'rgba(27,24,15,0.1)' }} className="mb-2.5" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-ink-faint leading-none">
                    {group}
                  </p>
                </div>
              )}
              <Link href={href}>
                <div
                  // The guide rings these by name; see components/admin/AdminTour.tsx.
                  data-tour={`nav-${href.replace('/admin/', '')}`}
                  className={clsx(
                    'relative w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-2xl text-sm font-bold transition-all text-left',
                    active ? 'text-ink' : 'text-ink-soft hover:text-ink hover:bg-[rgba(27,24,15,0.04)]',
                  )}
                  style={{
                    border: active ? '2px solid var(--card-border)' : '2px solid transparent',
                    background: active ? 'rgba(0,0,205,0.08)' : undefined,
                  }}
                >
                  {/* Left accent bar reads as "you are here" at a glance, without
                      relying on the border ring alone to carry that signal. */}
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                      style={{ width: 3, height: 18, background: ACCENT }}
                    />
                  )}
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                    style={{ background: active ? ACCENT : 'rgba(27,24,15,0.05)' }}
                  >
                    <Icon size={16} strokeWidth={2.4} className={active ? 'text-white' : undefined} />
                  </span>
                  <span>{label}</span>
                </div>
              </Link>
            </div>
          )
        })}
      </nav>

      <div className="px-4 py-4" style={{ borderTop: '1px solid rgba(27,24,15,0.1)' }}>
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 text-white" style={{ background: ACCENT, border: '1.5px solid var(--card-border)' }}>
            {admin?.name?.charAt(0).toUpperCase() ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-ink truncate">{admin?.name ?? 'Admin'}</p>
            <p className="text-[10px] text-ink-faint truncate">{admin?.email ?? ''}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-ink-soft hover:text-[#B3261E] hover:bg-[rgba(179,38,30,0.08)] transition-colors"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  )
}
