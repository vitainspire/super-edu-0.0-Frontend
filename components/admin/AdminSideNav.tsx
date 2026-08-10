'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, BookOpen, Library, CalendarDays, CalendarRange, LogOut, GraduationCap, ScanLine, Megaphone, Repeat, ClipboardList, BookMarked } from 'lucide-react'
import clsx from 'clsx'
import { useAdmin } from '@/lib/admin-context'
import AdminNotificationBell from '@/components/admin/AdminNotificationBell'

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
      className="hidden flex-col w-64 shrink-0 h-screen sticky top-0 overflow-y-auto text-white"
      style={{ background: 'var(--ink)', borderRight: '3px solid var(--card-border)' }}
    >
      <div className="flex items-center gap-3 px-6 py-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }}>
          <GraduationCap size={20} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-white text-base leading-none">EduTeach</p>
          <p className="text-[11px] text-white/55 font-medium mt-1 truncate">Admin Portal</p>
        </div>
        <AdminNotificationBell />
      </div>

      {school && (
        <div className="px-4 pt-4">
          <div className="rounded-2xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/50 mb-0.5">School</p>
            <p className="text-xs font-bold text-white truncate">{school.name}</p>
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
                <p className="text-[9px] font-black uppercase tracking-widest text-white/35 px-4 pt-4 pb-1.5">
                  {group}
                </p>
              )}
              <Link href={href}>
                <div
                  // The guide rings these by name; see components/admin/AdminTour.tsx.
                  data-tour={`nav-${href.replace('/admin/', '')}`}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all text-left',
                    active ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/[0.06]',
                  )}
                  style={{
                    border: active ? '2px solid var(--card-border)' : '2px solid transparent',
                    background: active ? 'var(--ink-soft)' : undefined,
                  }}
                >
                  <Icon size={18} strokeWidth={active ? 2.4 : 2} className="shrink-0" />
                  <span>{label}</span>
                </div>
              </Link>
            </div>
          )
        })}
      </nav>

      <div className="px-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0" style={{ background: '#F7EFC4', color: 'var(--ink)' }}>
            {admin?.name?.charAt(0).toUpperCase() ?? 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{admin?.name ?? 'Admin'}</p>
            <p className="text-[10px] text-white/55 truncate">{admin?.email ?? ''}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  )
}
