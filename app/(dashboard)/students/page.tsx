'use client'
import { useState, useMemo } from 'react'
import { Search, ChevronRight, AlertTriangle, Users } from 'lucide-react'
import Link from 'next/link'
import { useApp } from '@/lib/context'
import { getMasteryColor, getMasteryLabel } from '@/lib/logic/mastery'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'
import clsx from 'clsx'

const AVATAR_GRADIENTS = [
  '#5B87AD', // sticker blue (dark)
  '#5C8F52', // sticker green (dark)
  '#C46B54', // sticker coral (dark)
  '#AD8A2C', // sticker gold (dark)
  '#8069B0', // sticker violet (dark)
  '#BD6D8B', // sticker pink (dark)
]

function avatarGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

export default function StudentsPage() {
  const { students, getStudentAvgMastery, getStudentWarnings } = useApp()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return students
      .filter(s => s.isActive)
      .filter(s => s.name.toLowerCase().includes(q) || s.rollNumber.includes(q))
  }, [students, search])

  const activeCount = students.filter(s => s.isActive).length
  const criticalCount = useMemo(() =>
    students.filter(s => s.isActive && getStudentWarnings(s.id).some(w => w.level === 'critical')).length,
  [students, getStudentWarnings])

  return (
    <div className="paper-page pb-28">

      <PageHeader
        eyebrow="Students"
        title={`${activeCount} Enrolled`}
        subtitle="Manage via individual class pages"
      />

      <div className="px-5 pt-2 space-y-3 relative z-10">
        {criticalCount > 0 && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-red-600"
            style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.15)' }}>
            <AlertTriangle size={11} /> {criticalCount} critical alert{criticalCount > 1 ? 's' : ''}
          </div>
        )}
        {/* Search bar */}
        <div className="paper-card px-4 py-3 flex items-center gap-3">
          <Search size={18} className="text-ink-faint shrink-0" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or roll number…"
            className="flex-1 text-sm font-medium text-ink placeholder:text-ink-faint bg-transparent border-0 outline-none"
          />
        </div>

        {/* Empty */}
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Sticker tone="violet" size={64} radius={999} style={{ margin: '0 auto 16px' }}>
              <Users size={28} className="text-ink-soft" />
            </Sticker>
            <p className="font-display font-bold text-ink text-lg">
              {search ? 'No students found' : 'No students yet'}
            </p>
            {search && <p className="text-sm text-ink-soft mt-1">Try a different search term</p>}
          </div>
        )}

        {/* Student cards */}
        {filtered.map(student => {
          const avgMastery = getStudentAvgMastery(student.id)
          const warnings   = getStudentWarnings(student.id)
          const hasCritical = warnings.some(w => w.level === 'critical')
          const hasWatch    = !hasCritical && warnings.some(w => w.level === 'watch')

          return (
            <Link
              key={student.id}
              href={`/students/${student.id}`}
              className="paper-card-interactive flex items-center gap-3.5 p-4 block"
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-base"
                  style={{
                    background: hasCritical ? '#dc2626' : avatarGradient(student.name),
                  }}
                >
                  {student.name[0].toUpperCase()}
                </div>
                {hasCritical && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                    <AlertTriangle size={9} className="text-white" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-ink truncate">{student.name}</p>
                </div>
                <p className="text-xs text-ink-soft font-medium mt-0.5">Roll #{student.rollNumber}</p>

                {/* Mastery bar */}
                {avgMastery > 0 && (
                  <div className="mt-2">
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.round(avgMastery * 100)}%`,
                          background: avgMastery >= 0.75
                            ? '#5C8F52'
                            : avgMastery >= 0.5
                            ? '#AD8A2C'
                            : '#dc2626',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Right side */}
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {avgMastery > 0 ? (
                  <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-full', getMasteryColor(avgMastery))}>
                    {getMasteryLabel(avgMastery)}
                  </span>
                ) : (
                  <span className="text-xs text-ink-faint font-semibold">No data</span>
                )}
                {warnings.length > 0 && (
                  <span className={clsx(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full',
                    hasCritical ? 'bg-red-50 text-red-600' :
                    hasWatch    ? 'bg-amber-50 text-amber-600' : 'bg-[#DCEBF8] text-[#1E3A55]'
                  )}>
                    {warnings.length} alert{warnings.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <ChevronRight size={16} className="text-ink-faint shrink-0" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
