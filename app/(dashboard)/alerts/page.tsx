'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, CheckCircle2, AlertTriangle, Info,
  BookOpen, CheckCheck, ChevronDown, ChevronUp,
  UserX, TrendingDown, ArrowRight,
} from 'lucide-react'
import { useApp } from '@/lib/context'
import clsx from 'clsx'
import CatchupModal from '@/components/catchup/CatchupModal'
import ViewPlanModal from '@/components/catchup/ViewPlanModal'
import type { CatchupMaterial, Warning } from '@/lib/types'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'

const LEVEL_CONFIG = {
  critical: {
    icon: AlertTriangle,
    gradient: '#dc2626',
    rowBg: '#fff5f5',
    rowBorder: '#fecaca',
    icon_color: 'text-red-500',
    badge: 'bg-red-100 text-red-700',
    accentBar: '#ef4444',
  },
  watch: {
    icon: Bell,
    gradient: '#d97706',
    rowBg: '#fffbeb',
    rowBorder: '#fde68a',
    icon_color: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    accentBar: '#f59e0b',
  },
  info: {
    icon: Info,
    gradient: '#6F9BC4',
    rowBg: '#eef5fb',
    rowBorder: '#cfe3f2',
    icon_color: 'text-[#1E3A55]',
    badge: 'bg-[#DCEBF8] text-[#1E3A55]',
    accentBar: '#AACDEA',
  },
}

interface CatchupTarget {
  studentId: string
  studentName: string
  topic: string
  score?: number
}

interface StudentAlerts {
  student: { id: string; name: string; rollNumber: string }
  absenceWarnings: Warning[]
  lowMarkWarnings: Warning[]
}

interface ClassGroup {
  classId: string
  label: string
  students: StudentAlerts[]
  absenceCount: number
  lowMarkCount: number
  hasCritical: boolean
}

export default function AlertsPage() {
  const router = useRouter()
  const { classes, students, getStudentWarnings, getCatchupForStudent, updateCatchupStatus } = useApp()
  const [catchupTarget, setCatchupTarget] = useState<CatchupTarget | null>(null)
  const [viewPlan, setViewPlan]           = useState<CatchupMaterial | null>(null)
  const [expandedClass, setExpandedClass] = useState<string | null>(null)

  const classGroups = useMemo((): ClassGroup[] => {
    return classes
      .map(cls => {
        const classStudents = students.filter(s => s.classId === cls.id && s.isActive)
        const studentAlerts: StudentAlerts[] = classStudents
          .map(s => {
            const warnings = getStudentWarnings(s.id)
            return {
              student: { id: s.id, name: s.name, rollNumber: s.rollNumber },
              absenceWarnings: warnings.filter(w => w.category === 'absence'),
              lowMarkWarnings: warnings.filter(w => w.category === 'low_marks' || w.category === 'struggling'),
            }
          })
          .filter(sa => sa.absenceWarnings.length > 0 || sa.lowMarkWarnings.length > 0)

        const absenceCount = studentAlerts.filter(sa => sa.absenceWarnings.length > 0).length
        const lowMarkCount = studentAlerts.filter(sa => sa.lowMarkWarnings.length > 0).length
        const hasCritical  = studentAlerts.some(sa =>
          [...sa.absenceWarnings, ...sa.lowMarkWarnings].some(w => w.level === 'critical')
        )
        return {
          classId: cls.id,
          label: `Grade ${cls.grade}${cls.section ? ` · ${cls.section}` : ''}`,
          students: studentAlerts,
          absenceCount,
          lowMarkCount,
          hasCritical,
        }
      })
      .filter(g => g.students.length > 0)
      .sort((a, b) => (b.hasCritical ? 1 : 0) - (a.hasCritical ? 1 : 0))
  }, [classes, students, getStudentWarnings])

  const totalStudents   = classGroups.reduce((n, g) => n + g.students.length, 0)
  const criticalClasses = classGroups.filter(g => g.hasCritical).length

  const HeroIcon = criticalClasses > 0 ? AlertTriangle : classGroups.length > 0 ? Bell : CheckCircle2
  const heroTone  = criticalClasses > 0 ? 'coral' : classGroups.length > 0 ? 'gold' : 'green'

  return (
    <>
    <div className="paper-page pb-28">

      <PageHeader
        eyebrow="Early Warnings"
        title={classGroups.length === 0 ? 'All Clear!' : `${totalStudents} Need${totalStudents === 1 ? 's' : ''} Attention`}
        subtitle={classGroups.length === 0
          ? 'No alerts right now — great work!'
          : `${classGroups.length} class${classGroups.length !== 1 ? 'es' : ''} affected${criticalClasses > 0 ? ` · ${criticalClasses} critical` : ''}`}
        action={
          <Sticker tone={heroTone as 'coral' | 'gold' | 'green'} size={44} radius={14}>
            <HeroIcon size={20} className="text-ink" />
          </Sticker>
        }
      />

      <div className="px-4 pt-2 space-y-3 relative z-10">

        {/* ── All clear ── */}
        {classGroups.length === 0 && (
          <div className="paper-card p-8 text-center">
            <Sticker tone="green" size={80} radius={999} style={{ margin: '0 auto 20px' }}>
              <CheckCircle2 size={36} className="text-ink" />
            </Sticker>
            <p className="text-xl font-display font-bold text-ink">All students on track!</p>
            <p className="text-ink-soft text-sm mt-2 max-w-xs mx-auto leading-relaxed">
              No warnings right now. Keep up the great teaching work!
            </p>
          </div>
        )}

        {/* ── Class accordion cards ── */}
        {classGroups.map(group => {
          const isOpen = expandedClass === group.classId
          const accentColor = group.hasCritical ? '#ef4444' : '#f59e0b'

          return (
            <div
              key={group.classId}
              className="paper-card overflow-hidden"
              style={{
                border: `1px solid ${group.hasCritical ? '#fecaca' : '#fde68a'}`,
              }}
            >
              {/* Tap target — full class row */}
              <button
                type="button"
                onClick={() => setExpandedClass(isOpen ? null : group.classId)}
                className="w-full flex items-center gap-3 px-4 text-left active:bg-black/[0.03] transition-colors"
                style={{ minHeight: 64 }}
              >
                {/* Coloured accent bar */}
                <div className="w-1 self-stretch rounded-full my-3 flex-shrink-0"
                  style={{ background: accentColor }} />

                <div className="flex-1 min-w-0 py-3.5">
                  <p className="font-display font-bold text-ink text-base leading-tight">{group.label}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {group.absenceCount > 0 && (
                      <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                        <UserX size={10} /> {group.absenceCount} absent
                      </span>
                    )}
                    {group.lowMarkCount > 0 && (
                      <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full">
                        <TrendingDown size={10} /> {group.lowMarkCount} low marks
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: 'rgba(58,44,30,0.06)' }}>
                  {isOpen
                    ? <ChevronUp size={16} className="text-ink-soft" />
                    : <ChevronDown size={16} className="text-ink-soft" />}
                </div>
              </button>

              {/* Expanded body */}
              {isOpen && (
                <div className="border-t" style={{ borderColor: 'rgba(58,44,30,0.08)' }}>

                  {/* Absences section */}
                  {group.absenceCount > 0 && (
                    <div className="px-4 pt-3 pb-2">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <UserX size={12} className="text-amber-700" />
                        </div>
                        <p className="text-xs font-black uppercase tracking-wider text-amber-700">
                          Absences · {group.absenceCount} student{group.absenceCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="space-y-2.5">
                        {group.students
                          .filter(sa => sa.absenceWarnings.length > 0)
                          .map(sa => (
                            <StudentWarningRow
                              key={sa.student.id + '-abs'}
                              sa={sa}
                              warnings={sa.absenceWarnings}
                              router={router}
                              getCatchupForStudent={getCatchupForStudent}
                              updateCatchupStatus={updateCatchupStatus}
                              onCatchup={setCatchupTarget}
                              onViewPlan={setViewPlan}
                            />
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Divider between sections */}
                  {group.absenceCount > 0 && group.lowMarkCount > 0 && (
                    <div className="mx-4 border-t border-dashed my-1" style={{ borderColor: 'rgba(58,44,30,0.15)' }} />
                  )}

                  {/* Low marks section */}
                  {group.lowMarkCount > 0 && (
                    <div className="px-4 pt-3 pb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                          <TrendingDown size={12} className="text-red-700" />
                        </div>
                        <p className="text-xs font-black uppercase tracking-wider text-red-700">
                          Low Marks · {group.lowMarkCount} student{group.lowMarkCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="space-y-2.5">
                        {group.students
                          .filter(sa => sa.lowMarkWarnings.length > 0)
                          .map(sa => (
                            <StudentWarningRow
                              key={sa.student.id + '-low'}
                              sa={sa}
                              warnings={sa.lowMarkWarnings}
                              router={router}
                              getCatchupForStudent={getCatchupForStudent}
                              updateCatchupStatus={updateCatchupStatus}
                              onCatchup={setCatchupTarget}
                              onViewPlan={setViewPlan}
                            />
                          ))}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          )
        })}


      </div>
    </div>

    {catchupTarget && (
      <CatchupModal
        studentId={catchupTarget.studentId}
        studentName={catchupTarget.studentName}
        topic={catchupTarget.topic}
        score={catchupTarget.score}
        onClose={() => setCatchupTarget(null)}
      />
    )}
    {viewPlan && (
      <ViewPlanModal plan={viewPlan} onClose={() => setViewPlan(null)} />
    )}
    </>
  )
}

// ── Student warning row ───────────────────────────────────────────────────────
function StudentWarningRow({
  sa, warnings, router, getCatchupForStudent, updateCatchupStatus, onCatchup, onViewPlan,
}: {
  sa: StudentAlerts
  warnings: Warning[]
  router: ReturnType<typeof useRouter>
  getCatchupForStudent: (id: string) => CatchupMaterial[]
  updateCatchupStatus: (id: string, status: CatchupMaterial['status']) => Promise<void>
  onCatchup: (t: CatchupTarget) => void
  onViewPlan: (p: CatchupMaterial) => void
}) {
  const topLevel = warnings.some(w => w.level === 'critical') ? 'critical'
    : warnings.some(w => w.level === 'watch') ? 'watch' : 'info'
  const cfg = LEVEL_CONFIG[topLevel]

  const STATUS_LABEL: Record<string, string>               = { approved: 'Plan ready', given: 'Given to student', done: 'Completed' }
  const STATUS_NEXT:  Record<string, string>               = { approved: 'Mark as Given', given: 'Mark as Done' }
  const STATUS_NEXT_VAL: Record<string, 'given' | 'done'> = { approved: 'given', given: 'done' }

  const hasDonePlan = getCatchupForStudent(sa.student.id).filter(m => warnings.some(w => w.topic === m.topic)).some(m => m.status === 'done')

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${cfg.rowBorder}`, background: cfg.rowBg }}
    >
      {/* Student header — taps to profile */}
      <button
        type="button"
        onClick={() => router.push(`/students/${sa.student.id}`)}
        className="w-full flex items-center gap-3 px-3.5 py-3 active:opacity-70 transition-opacity"
      >
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-base flex-shrink-0"
          style={{ background: cfg.gradient }}
        >
          {(sa.student.name?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="font-bold text-ink text-sm leading-tight truncate">{sa.student.name}</p>
          <p className="text-xs text-ink-soft font-medium mt-0.5">Roll #{sa.student.rollNumber}</p>
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold text-ink-soft flex-shrink-0">
          Profile <ArrowRight size={12} />
        </div>
      </button>

      {/* Warnings */}
      <div className="px-3.5 pb-3 space-y-2.5 border-t border-black/5">
        {warnings.map((w, i) => {
          const wCfg    = LEVEL_CONFIG[w.level]
          const scoreMatch = /(\d+)%/.exec(w.action)
          const score   = scoreMatch ? parseInt(scoreMatch[1]) : undefined
          const existing = w.topic ? getCatchupForStudent(sa.student.id).find(m => m.topic === w.topic) : null

          return (
            <div key={i} className="pt-2.5">
              {/* Reason + date */}
              <div className="flex items-start gap-2 mb-2">
                <wCfg.icon size={13} className={clsx('mt-0.5 flex-shrink-0', wCfg.icon_color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-ink leading-snug">{w.reason}</p>
                    {w.date && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/70 text-ink-soft border border-black/10">
                        {formatWarningDate(w.date)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-soft mt-0.5 leading-snug">{w.action}</p>
                </div>
              </div>

              {/* Action button — full width, large tap target */}
              {w.topic && (
                existing ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onViewPlan(existing)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-center active:opacity-70 transition-opacity"
                      style={{
                        background: existing.status === 'done' ? '#d1fae5' : '#DCEBF8',
                        color: existing.status === 'done' ? '#065f46' : '#1E3A55',
                      }}
                    >
                      {STATUS_LABEL[existing.status]} — View Plan
                    </button>
                    {existing.status !== 'done' && (
                      <button
                        type="button"
                        onClick={() => { updateCatchupStatus(existing.id, STATUS_NEXT_VAL[existing.status]).catch(() => {}) }}
                        className="py-2.5 px-3 rounded-xl text-xs font-bold text-ink-soft bg-white border border-black/10 active:bg-black/[0.03]"
                      >
                        {STATUS_NEXT[existing.status]}
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onCatchup({ studentId: sa.student.id, studentName: sa.student.name, topic: w.topic!, score })}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-[#1E3A55] bg-white border border-[#AACDEA] active:bg-[#DCEBF8] transition-colors"
                  >
                    <BookOpen size={13} /> Create Catch-up Plan
                  </button>
                )
              )}
            </div>
          )
        })}
      </div>

      {/* Done badge */}
      {hasDonePlan && (
        <div className="flex items-center gap-1.5 px-3.5 py-2 border-t border-black/5 bg-emerald-50">
          <CheckCheck size={13} className="text-emerald-600" />
          <span className="text-xs font-bold text-emerald-700">Catch-up plan completed</span>
        </div>
      )}
    </div>
  )
}

function formatWarningDate(dateStr: string): string {
  const d     = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
