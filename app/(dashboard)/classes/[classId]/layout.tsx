'use client'
import { useParams, usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users, CalendarCheck, BookOpen, Activity, BarChart3 } from 'lucide-react'
import { useApp } from '@/lib/context'
import clsx from 'clsx'

const TABS = [
  { label: 'Students',      Icon: Users,         path: 'students' },
  { label: 'Attendance',    Icon: CalendarCheck,  path: 'attendance' },
  { label: 'Syllabus',      Icon: BookOpen,       path: 'syllabus' },
  { label: 'Class Report',  Icon: Activity,       path: 'pulse' },
  { label: 'Understanding', Icon: BarChart3,      path: 'understanding' },
]

const CLASS_PALETTE = [
  { bg: '#AACDEA', ink: '#1E3A55' },
  { bg: '#AAD6A0', ink: '#234A1D' },
  { bg: '#F0A491', ink: '#5C2416' },
  { bg: '#EAC968', ink: '#4A3809' },
  { bg: '#C7B7E8', ink: '#31215C' },
  { bg: '#F0AFC6', ink: '#5C1F38' },
]

export default function ClassLayout({ children }: { children: React.ReactNode }) {
  const { classId } = useParams() as { classId: string }
  const pathname = usePathname()
  const router = useRouter()
  const { classes, students } = useApp()

  const clsIndex  = classes.findIndex(c => c.id === classId)
  const cls       = clsIndex >= 0 ? classes[clsIndex] : undefined
  const palette   = CLASS_PALETTE[clsIndex >= 0 ? clsIndex % CLASS_PALETTE.length : 0]
  const studentCount = students.filter(s => s.classId === classId && s.isActive).length

  return (
    <div className="paper-page">
      {/* Sticky header */}
      <div className="sticky top-0 z-20" style={{ background: palette.bg, borderBottom: '2px solid rgba(58,44,30,0.14)' }}>
        {/* Back + class info */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3">
          <button
            onClick={() => router.push('/classes')}
            className="w-9 h-9 flex items-center justify-center rounded-2xl flex-shrink-0 active:scale-90 transition-transform"
            style={{ background: 'rgba(255,255,255,0.5)' }}
          >
            <ArrowLeft size={18} style={{ color: palette.ink }} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-display font-bold leading-tight truncate" style={{ color: palette.ink }}>
              {cls?.name ?? 'Class'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-medium" style={{ color: palette.ink, opacity: 0.7 }}>Grade {cls?.grade ?? '?'}</span>
              {cls?.section && <span className="text-xs" style={{ color: palette.ink, opacity: 0.5 }}>·</span>}
              {cls?.section && <span className="text-xs font-medium" style={{ color: palette.ink, opacity: 0.7 }}>Sec {cls.section}</span>}
              <span className="text-xs" style={{ color: palette.ink, opacity: 0.5 }}>·</span>
              <span className="text-xs font-medium flex items-center gap-1" style={{ color: palette.ink, opacity: 0.7 }}>
                <Users size={10} /> {studentCount}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable tab bar */}
        <div className="flex overflow-x-auto no-scrollbar" style={{ borderTop: '1px solid rgba(58,44,30,0.1)' }}>
          {TABS.map(tab => {
            const tabPath = `/classes/${classId}/${tab.path}`
            const active  = pathname === tabPath || pathname.startsWith(tabPath + '/')
            return (
              <Link
                key={tab.path}
                href={tabPath}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-5 py-3 text-xs font-semibold transition-all border-b-2"
                style={{
                  color: palette.ink,
                  opacity: active ? 1 : 0.55,
                  borderColor: active ? palette.ink : 'transparent',
                  background: active ? 'rgba(255,255,255,0.35)' : 'transparent',
                }}
              >
                <tab.Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
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
