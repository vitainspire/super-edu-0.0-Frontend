'use client'
import { useParams, usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users, CalendarCheck, BookOpen, Activity, BarChart3 } from '@/components/ui/icons'
import { useApp } from '@/lib/context'

const TABS = [
  { label: 'Students',      Icon: Users,         path: 'students' },
  { label: 'Attendance',    Icon: CalendarCheck,  path: 'attendance' },
  { label: 'Syllabus',      Icon: BookOpen,       path: 'syllabus' },
  { label: 'Class Report',  Icon: Activity,       path: 'pulse' },
  { label: 'Understanding', Icon: BarChart3,      path: 'understanding' },
]

// A small per-class identity dot keeps classes distinguishable without the old
// full-width colored header bar.
const CLASS_DOTS = ['#5B87AD', '#3E7A57', '#C46B54', '#AD8A2C', '#8069B0', '#BD6D8B']

export default function ClassLayout({ children }: { children: React.ReactNode }) {
  const { classId } = useParams() as { classId: string }
  const pathname = usePathname()
  const router = useRouter()
  const { classes, students } = useApp()

  const clsIndex  = classes.findIndex(c => c.id === classId)
  const cls       = clsIndex >= 0 ? classes[clsIndex] : undefined
  const dot       = CLASS_DOTS[clsIndex >= 0 ? clsIndex % CLASS_DOTS.length : 0]
  const studentCount = students.filter(s => s.classId === classId && s.isActive).length

  return (
    <div className="paper-page">
      {/* Sticky header — cream, bold-outlined */}
      <div className="sticky top-0 z-20" style={{ background: 'var(--paper-bg)', borderBottom: '2px solid var(--card-border)' }}>
        {/* Back + class info */}
        <div className="px-4 md:px-6 pt-5 pb-4 flex items-center gap-3">
          <button
            onClick={() => router.push('/classes')}
            className="w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0 bg-white active:scale-90 transition-transform"
            style={{ border: '1.75px solid var(--card-border)' }}
          >
            <ArrowLeft size={18} className="text-ink" />
          </button>
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: dot, border: '1.5px solid var(--card-border)' }} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-display font-extrabold text-ink leading-tight truncate" style={{ letterSpacing: '-0.01em' }}>
              {cls?.name ?? 'Class'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5 text-ink-soft">
              <span className="text-xs font-medium">Grade {cls?.grade ?? '?'}</span>
              {cls?.section && <span className="text-xs opacity-50">·</span>}
              {cls?.section && <span className="text-xs font-medium">Sec {cls.section}</span>}
              <span className="text-xs opacity-50">·</span>
              <span className="text-xs font-medium flex items-center gap-1"><Users size={11} /> {studentCount}</span>
            </div>
          </div>
        </div>

        {/* Scrollable tab bar */}
        <div className="flex overflow-x-auto no-scrollbar px-2" style={{ borderTop: '1.5px solid rgba(27,24,15,0.1)' }}>
          {TABS.map(tab => {
            const tabPath = `/classes/${classId}/${tab.path}`
            const active  = pathname === tabPath || pathname.startsWith(tabPath + '/')
            return (
              <Link
                key={tab.path}
                href={tabPath}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-4 py-3 text-xs font-bold transition-all"
                style={{
                  color: active ? 'var(--forest)' : 'var(--ink-faint)',
                  borderBottom: active ? '2.5px solid var(--forest)' : '2.5px solid transparent',
                }}
              >
                <tab.Icon size={17} weight={active ? 'fill' : 'regular'} />
                <span>{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="pb-28">{children}</div>
    </div>
  )
}
