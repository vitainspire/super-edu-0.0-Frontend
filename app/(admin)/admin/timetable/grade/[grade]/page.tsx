'use client'
import { useEffect, useState, useCallback } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { useParams } from 'next/navigation'
import { ArrowRight, Loader2, CalendarDays } from 'lucide-react'
import type { Class, SchoolTimetablePeriod, SchoolSchedule } from '@/lib/types'
import Link from 'next/link'
import clsx from 'clsx'
import PageHeader from '@/components/theme/PageHeader'

const DAYS_COUNT = 6

type Tone = 'blue' | 'green' | 'coral' | 'gold' | 'violet' | 'pink'
const PALETTE: { tone: Tone; stat: string; ink: string }[] = [
  { tone: 'blue',   stat: 'stat-card-blue',   ink: '#1E3A55' },
  { tone: 'green',  stat: 'stat-card-green',  ink: '#234A1D' },
  { tone: 'coral',  stat: 'stat-card-coral',  ink: '#5C2416' },
  { tone: 'gold',   stat: 'stat-card-gold',   ink: '#4A3809' },
  { tone: 'violet', stat: 'stat-card-violet', ink: '#31215C' },
  { tone: 'pink',   stat: 'stat-card-pink',   ink: '#5C1F38' },
]

export default function GradeTimetablePage() {
  const { school } = useAdmin()
  const params = useParams()
  const grade = decodeURIComponent(params.grade as string)

  const [schedule, setSchedule] = useState<SchoolSchedule | null>(null)
  const [periods, setPeriods] = useState<SchoolTimetablePeriod[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!school) { setLoading(false); return }
    Promise.all([
      fetch(`/api/admin/schools/${school.id}/schedule`).then(r => r.json()),
      fetch(`/api/admin/schools/${school.id}/timetable`).then(r => r.json()),
      fetch(`/api/admin/schools/${school.id}/classes`).then(r => r.json()),
    ]).then(([sd, tt, cd]) => {
      setSchedule(sd.schedule ?? null)
      setPeriods(tt.periods ?? [])
      setClasses((cd.classes ?? []).filter((c: Class) => c.grade === grade))
    }).finally(() => setLoading(false))
  }, [school, grade])

  useEffect(() => { load() }, [load])

  const classAssignedCount = (classId: string) => periods.filter(p => p.classId === classId).length
  const periodSlotsCount = schedule?.slots.filter(s => s.type === 'period').length ?? 0

  return (
    <div className="paper-page pb-16">
      <PageHeader
        title={`Grade ${grade} Timetable`}
        subtitle={`${classes.length} section${classes.length !== 1 ? 's' : ''}`}
      />

      <div className="px-5 md:px-6 max-w-5xl mx-auto relative z-10">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-ink" />
          </div>
        ) : classes.length === 0 ? (
          <div className="paper-card text-center py-16">
            <CalendarDays className="w-10 h-10 text-ink-faint mx-auto mb-3" />
            <p className="text-ink-soft font-bold">No sections yet for Grade {grade}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls, i) => {
              const palette = PALETTE[i % PALETTE.length]
              const assigned = classAssignedCount(cls.id)
              const total = periodSlotsCount * DAYS_COUNT
              const pct = total > 0 ? Math.round((assigned / total) * 100) : 0

              return (
                <div key={cls.id} className={clsx('stat-card', palette.stat)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display font-bold text-lg leading-tight" style={{ color: palette.ink }}>{cls.name}</p>
                      <p className="text-sm font-semibold mt-1" style={{ color: palette.ink, opacity: 0.75 }}>
                        Grade {cls.grade} · Section {cls.section}
                      </p>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-full shrink-0" style={{ background: 'rgba(255,255,255,0.5)', color: palette.ink }}>
                      {pct}%
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="stat-progress-track">
                      <div className="stat-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs font-semibold mt-2" style={{ color: palette.ink, opacity: 0.7 }}>
                      {assigned} of {total} period slots assigned
                    </p>
                  </div>

                  <Link href={`/admin/timetable/${cls.id}`}
                    className="w-full flex items-center justify-center gap-2 py-2.5 mt-4 rounded-xl text-sm font-bold active:scale-95 transition-transform"
                    style={{ background: 'rgba(255,255,255,0.55)', color: palette.ink }}>
                    {assigned > 0 ? 'Edit Timetable' : 'Set Up Timetable'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
