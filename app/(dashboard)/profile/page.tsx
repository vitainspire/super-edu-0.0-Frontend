'use client'
import { useRouter } from 'next/navigation'
import { LogOut, CalendarDays, ChevronRight, Sparkles } from '@/components/ui/icons'
import { useApp } from '@/lib/context'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker, NotebookSticker } from '@/components/theme/StickerIcon'
import LeavesSection from '@/components/profile/LeavesSection'
import { teachingProfileCompletion, isTeachingProfileComplete } from '@/lib/logic/teaching-profile'

export default function ProfilePage() {
  const { teacher, logout } = useApp()
  const router = useRouter()

  const handleLogout = async () => { await logout(); router.replace('/teacher/login') }

  const rows = [
    { label: 'Name',    value: teacher?.name },
    { label: 'School',  value: teacher?.schoolName },
    { label: 'Subject', value: teacher?.subject },
    { label: 'Grade',   value: teacher?.grade },
  ]

  return (
    <div className="paper-page pb-28">
      <PageHeader title="Profile" />

      <div className="px-5 pt-2 space-y-4 relative z-10">

        <div className="paper-card p-5 flex items-center gap-4">
          <Sticker tone="coral" size={64} radius={20}>
            <NotebookSticker size={34} />
          </Sticker>
          <div className="min-w-0">
            <p className="font-display font-bold text-ink text-lg leading-tight truncate">{teacher?.name ?? 'Teacher'}</p>
            <p className="text-sm text-ink-soft font-medium truncate">{teacher?.subject ?? '—'} · {teacher?.schoolName ?? '—'}</p>
          </div>
        </div>

        {/* Teaching Profile — reminder until complete, quick link afterward */}
        <button
          type="button"
          onClick={() => router.push('/profile/teaching')}
          className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl text-left"
          style={isTeachingProfileComplete(teacher?.teachingProfile)
            ? { background: 'rgba(58,44,30,0.04)', border: '2px solid var(--card-border)' }
            : { background: 'rgba(31,61,44,0.08)', border: '2px solid var(--card-border)' }}
        >
          <Sparkles size={18} style={{ color: 'var(--forest)' }} className="shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold" style={{ color: 'var(--forest)' }}>Teaching Profile</span>
            <span className="block text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
              {isTeachingProfileComplete(teacher?.teachingProfile)
                ? 'Complete — every lesson is personalized to you'
                : `${teachingProfileCompletion(teacher?.teachingProfile)}% complete — finish it for more personalized lessons`}
            </span>
          </span>
          <ChevronRight size={16} style={{ color: 'var(--forest)' }} className="shrink-0" />
        </button>

        <div className="paper-card p-5">
          {rows.map((row, i) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-3"
              style={{ borderBottom: i < rows.length - 1 ? '1px solid rgba(58,44,30,0.08)' : 'none' }}
            >
              <span className="text-xs font-bold text-ink-soft uppercase tracking-wide">{row.label}</span>
              <span className="text-sm font-bold text-ink">{row.value || '—'}</span>
            </div>
          ))}
        </div>

        <LeavesSection />

        <button
          type="button"
          onClick={() => router.push('/academic-calendar')}
          className="paper-card p-5 w-full flex items-center gap-3 text-left"
        >
          <Sticker tone="blue" size={36} radius={14}>
            <CalendarDays size={16} className="text-ink-soft" />
          </Sticker>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-ink leading-none">Academic Calendar</p>
            <p className="text-[11px] text-ink-soft mt-1">Holidays, exams, and term dates published by your school</p>
          </div>
          <ChevronRight size={16} className="text-ink-faint shrink-0" />
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-red-600 active:scale-95 transition-transform"
          style={{ background: 'rgba(220,38,38,0.08)' }}
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  )
}
