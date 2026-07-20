'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Trophy, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, Users, RefreshCw,
} from 'lucide-react'
import { useApp } from '@/lib/context'
import { getMasteryLabel, getMasteryColor } from '@/lib/logic/mastery'
import PageHeader from '@/components/theme/PageHeader'
import clsx from 'clsx'

export default function YearSummaryPage() {
  const router  = useRouter()
  const {
    teacher, classes, students,
    getClassStudents, getClassSyllabus,
    getStudentAttendanceRate, getStudentAvgMastery,
    getStudentWarnings, getStudentMarks,
    clearAllData,
  } = useApp()

  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting,    setResetting]    = useState(false)
  const [filterClass,  setFilterClass]  = useState('all')

  const displayStudents = useMemo(() => {
    const src = filterClass === 'all'
      ? students.filter(s => s.isActive)
      : getClassStudents(filterClass)

    return src.map(s => {
      const marks       = getStudentMarks(s.id)
      const attendance  = getStudentAttendanceRate(s.id)
      const avgMastery  = getStudentAvgMastery(s.id)
      const warnings    = getStudentWarnings(s.id)
      const cls         = classes.find(c => c.id === s.classId)

      // Term-by-term averages
      const byTerm = new Map<string, { total: number; count: number }>()
      marks.forEach(m => {
        const term = m.term ?? 'Untagged'
        const rec  = byTerm.get(term) ?? { total: 0, count: 0 }
        rec.total += m.score / m.totalMarks
        rec.count += 1
        byTerm.set(term, rec)
      })
      const termAverages = [...byTerm.entries()].map(([term, v]) => ({
        term, avg: v.total / v.count,
      })).sort((a, b) => a.term.localeCompare(b.term))

      // Trend: compare first mark to last mark
      const sorted = [...marks].sort((a, b) => a.conductedOn.localeCompare(b.conductedOn))
      const trend = sorted.length >= 2
        ? sorted[sorted.length - 1].score / sorted[sorted.length - 1].totalMarks
          - sorted[0].score / sorted[0].totalMarks
        : 0

      return {
        student: s,
        className: cls ? `Grade ${cls.grade} Sec ${cls.section}` : '',
        marks: marks.length,
        attendance,
        avgMastery,
        warnings: warnings.length,
        criticals: warnings.filter(w => w.level === 'critical').length,
        termAverages,
        trend,
      }
    }).sort((a, b) => b.avgMastery - a.avgMastery)
  }, [students, filterClass, classes, getClassStudents, getStudentMarks,
      getStudentAttendanceRate, getStudentAvgMastery, getStudentWarnings])

  const handleReset = async () => {
    setResetting(true)
    await clearAllData()
    setResetting(false)
    router.replace('/home')
  }

  // Class-level summary
  const classSummaries = useMemo(() => classes.map(cls => {
    const clsStudents = getClassStudents(cls.id)
    const syllabus    = getClassSyllabus(cls.id)
    const done        = syllabus.filter(t => t.isCompleted).length
    const avgMastery  = clsStudents.length
      ? clsStudents.reduce((s, st) => s + getStudentAvgMastery(st.id), 0) / clsStudents.length
      : 0
    const avgAttendance = clsStudents.length
      ? clsStudents.reduce((s, st) => s + getStudentAttendanceRate(st.id), 0) / clsStudents.length
      : 0
    return { cls, done, total: syllabus.length, avgMastery, avgAttendance, count: clsStudents.length }
  }), [classes, getClassStudents, getClassSyllabus, getStudentAvgMastery, getStudentAttendanceRate])

  return (
    <div className="paper-page pb-20">
      <PageHeader
        title="Year Summary"
        subtitle={teacher?.academicYearStart
          ? `Started ${new Date(teacher.academicYearStart + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
          : 'Academic year overview'}
      />

      <div className="px-4 pt-2 space-y-4 relative z-10">

        {/* Class summaries */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Classes</p>
          {classSummaries.map(({ cls, done, total, avgMastery, avgAttendance, count }) => (
            <div key={cls.id} className="paper-card px-4 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-ink">Grade {cls.grade} · Sec {cls.section}</p>
                <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', getMasteryColor(avgMastery))}>
                  {getMasteryLabel(avgMastery)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl py-2" style={{ background: 'rgba(58,44,30,0.05)' }}>
                  <p className="text-sm font-black text-ink">{count}</p>
                  <p className="text-[10px] text-ink-soft font-semibold">Students</p>
                </div>
                <div className="rounded-xl py-2" style={{ background: 'rgba(58,44,30,0.05)' }}>
                  <p className="text-sm font-black text-ink">{done}/{total}</p>
                  <p className="text-[10px] text-ink-soft font-semibold">Topics done</p>
                </div>
                <div className="rounded-xl py-2" style={{ background: count > 0 && avgAttendance < 0.75 ? 'rgba(220,38,38,0.08)' : 'rgba(58,44,30,0.05)' }}>
                  <p className={clsx('text-sm font-black', count > 0 && avgAttendance < 0.75 ? 'text-red-700' : 'text-ink')}>
                    {count === 0 ? '—' : `${Math.round(avgAttendance * 100)}%`}
                  </p>
                  <p className="text-[10px] text-ink-soft font-semibold">Attendance</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Class filter */}
        <div>
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-2">Students</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setFilterClass('all')}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
              style={filterClass === 'all'
                ? { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' }
                : { background: '#fff', color: 'var(--ink-soft)', borderColor: 'rgba(58,44,30,0.15)' }}>
              All
            </button>
            {classes.map(c => (
              <button key={c.id} onClick={() => setFilterClass(c.id)}
                className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
                style={filterClass === c.id
                  ? { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' }
                  : { background: '#fff', color: 'var(--ink-soft)', borderColor: 'rgba(58,44,30,0.15)' }}>
                Gr {c.grade}·{c.section}
              </button>
            ))}
          </div>
        </div>

        {/* Student cards */}
        <div className="space-y-2">
          {displayStudents.map(({ student, className, marks: mCount, attendance, avgMastery, criticals, termAverages, trend }, rank) => (
            <div key={student.id} className="paper-card px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0',
                  rank === 0 ? 'bg-amber-100 text-amber-700' :
                  rank === 1 ? 'bg-black/[0.1] text-ink' :
                  rank === 2 ? 'bg-orange-100 text-orange-700' : 'bg-black/[0.05] text-ink-soft',
                )}>
                  {rank + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink truncate">{student.name}</p>
                  <p className="text-xs text-ink-soft">{className} · Roll #{student.rollNumber}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {trend > 0.05  && <TrendingUp  size={14} className="text-emerald-500" />}
                  {trend < -0.05 && <TrendingDown size={14} className="text-red-500" />}
                  {Math.abs(trend) <= 0.05 && <Minus size={14} className="text-ink-faint" />}
                  <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', getMasteryColor(avgMastery))}>
                    {getMasteryLabel(avgMastery)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center mb-2">
                <div className="rounded-xl py-1.5" style={{ background: 'rgba(58,44,30,0.05)' }}>
                  <p className="text-sm font-black text-ink">{Math.round(avgMastery * 100)}%</p>
                  <p className="text-[10px] text-ink-soft font-semibold">Avg score</p>
                </div>
                <div className="rounded-xl py-1.5" style={{ background: attendance < 0.75 ? 'rgba(220,38,38,0.08)' : 'rgba(58,44,30,0.05)' }}>
                  <p className={clsx('text-sm font-black', attendance < 0.75 ? 'text-red-700' : 'text-ink')}>
                    {Math.round(attendance * 100)}%
                  </p>
                  <p className="text-[10px] text-ink-soft font-semibold">Attendance</p>
                </div>
                <div className="rounded-xl py-1.5" style={{ background: 'rgba(58,44,30,0.05)' }}>
                  <p className="text-sm font-black text-ink">{mCount}</p>
                  <p className="text-[10px] text-ink-soft font-semibold">Tests</p>
                </div>
              </div>

              {/* Term averages */}
              {termAverages.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-1">
                  {termAverages.map(ta => (
                    <span key={ta.term} className="text-[10px] bg-[#E9E1F6] text-[#8069B0] font-bold px-2 py-0.5 rounded-full">
                      {ta.term}: {Math.round(ta.avg * 100)}%
                    </span>
                  ))}
                </div>
              )}

              {criticals > 0 && (
                <div className="flex items-center gap-1.5 mt-2 bg-red-50 rounded-xl px-3 py-1.5">
                  <AlertTriangle size={11} className="text-red-500 shrink-0" />
                  <p className="text-[10px] text-red-700 font-semibold">{criticals} critical warning{criticals > 1 ? 's' : ''} — needs attention</p>
                </div>
              )}
            </div>
          ))}

          {displayStudents.length === 0 && (
            <div className="text-center py-12">
              <Users size={32} className="text-ink-faint mx-auto mb-3" />
              <p className="font-semibold text-ink-soft">No students yet</p>
            </div>
          )}
        </div>

        {/* New academic year reset */}
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-amber-600" />
            <p className="font-bold text-amber-900">Start New Academic Year</p>
          </div>
          <p className="text-sm text-amber-800 leading-relaxed">
            Archive this year&apos;s data and reset for a new batch of students. This clears all classes, students, marks, sessions and attendance. The action cannot be undone.
          </p>
          {!confirmReset ? (
            <button type="button" onClick={() => setConfirmReset(true)}
              className="w-full py-3 rounded-2xl bg-amber-600 text-white font-bold text-sm active:scale-95 transition-all">
              Archive & Start New Year
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-bold text-red-700 text-center">Are you sure? This cannot be undone.</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setConfirmReset(false)}
                  className="flex-1 py-3 rounded-2xl bg-black/[0.08] text-ink font-bold text-sm">
                  Cancel
                </button>
                <button type="button" onClick={handleReset} disabled={resetting}
                  className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all">
                  {resetting ? <><RefreshCw size={14} className="animate-spin" /> Resetting…</> : 'Yes, Reset'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Proficiency legend */}
        <div className="paper-card px-4 py-3">
          <p className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-2">Score legend</p>
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'Strong', range: '≥75%', color: 'bg-emerald-100 text-emerald-700' },
              { label: 'Improving', range: '50–74%', color: 'bg-amber-100 text-amber-700' },
              { label: 'Needs Help', range: '<50%', color: 'bg-red-100 text-red-700' },
            ].map(l => (
              <div key={l.label} className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold', l.color)}>
                <CheckCircle2 size={11} /> {l.label} ({l.range})
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
