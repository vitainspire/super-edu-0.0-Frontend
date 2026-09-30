'use client'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, AlertTriangle } from 'lucide-react'

export interface Readiness {
  classesWithoutTeacher: number
  classesWithoutStudents: number
  classesWithoutSyllabus: number
  unstaffedPeriods: number
  publishedPeriods: number
}

/**
 * What is stopping this school from working, as a list of gaps to close.
 *
 * The stat tiles above it count what exists — teachers, classes, students —
 * and none of those numbers moves week to week or asks anything of the admin.
 * Worse, they can read healthy while the school is unusable: 40 classes, 36 of
 * them with nobody teaching them, nobody in them and no syllabus.
 *
 * So this counts the gap instead. Every row is a number that should be zero,
 * links to the page that fixes it, and disappears when it is done — which
 * makes the panel empty itself out as the school gets set up, and turns into a
 * quiet "all set" rather than permanent furniture.
 */
export default function SchoolReadiness({
  readiness,
  classCount,
}: {
  readiness: Readiness
  classCount: number
}) {
  const router = useRouter()

  const gaps = [
    {
      key: 'teacher',
      count: readiness.classesWithoutTeacher,
      noun: (n: number) => `class${n === 1 ? '' : 'es'} with no teacher`,
      hint: 'Nobody can open these on the teacher portal',
      href: '/admin/classes',
      action: 'Assign',
    },
    {
      key: 'students',
      count: readiness.classesWithoutStudents,
      noun: (n: number) => `class${n === 1 ? '' : 'es'} with no students`,
      hint: 'No attendance, marks or reports until someone is enrolled',
      href: '/admin/classes',
      action: 'Add students',
    },
    {
      key: 'syllabus',
      count: readiness.classesWithoutSyllabus,
      noun: (n: number) => `class${n === 1 ? '' : 'es'} with no syllabus`,
      hint: 'Prep material and pacing need topics to work from',
      href: '/admin/syllabus',
      action: 'Add syllabus',
    },
    {
      key: 'periods',
      count: readiness.unstaffedPeriods,
      noun: (n: number) => `timetable period${n === 1 ? '' : 's'} unstaffed`,
      hint: 'Unstaffed periods are skipped when the timetable is published',
      href: '/admin/timetable',
      action: 'Staff',
    },
  ].filter(g => g.count > 0)

  const allSet = gaps.length === 0 && classCount > 0

  return (
    <div className={gaps.length > 0 ? 'admin-alert-amber p-5 mb-6' : 'admin-card p-5 mb-6'}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: gaps.length > 0 ? '#92400E' : 'var(--ink-soft)' }}>
          School Readiness
        </p>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={
            allSet
              ? { background: '#DCFCE7', color: '#166534' }
              : { background: '#FEF3C7', color: '#92400E' }
          }
        >
          {allSet ? 'All set' : `${gaps.length} to fix`}
        </span>
      </div>

      {allSet && (
        <div className="flex items-center gap-2.5">
          <Check size={16} style={{ color: '#16A34A' }} />
          <p className="text-sm" style={{ color: '#64748B' }}>
            Every class has a teacher, students and a syllabus, and the timetable is fully staffed.
          </p>
        </div>
      )}

      {classCount === 0 && (
        <p className="text-sm" style={{ color: '#64748B' }}>
          No classes yet — create the first one and this will track what it still needs.
        </p>
      )}

      {gaps.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {gaps.map(gap => (
            <button
              key={gap.key}
              type="button"
              onClick={() => router.push(gap.href)}
              // White insets on the amber panel -- the panel itself carries the
              // "this needs attention" signal, so each tile inside stays neutral.
              className="admin-card-hover flex flex-col text-left rounded-2xl p-4 h-full"
            >
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={13} className="shrink-0" style={{ color: '#D97706' }} />
                {/* The number carries the pane. It is the thing being scanned
                    for, and stacking four sentences made the panel a wall of
                    text where every row started with a digit. */}
                <span
                  className="font-display font-extrabold leading-none"
                  style={{ fontSize: 26, letterSpacing: '-0.02em', color: '#0F172A' }}
                >
                  {gap.count}
                </span>
              </span>
              <p className="text-[13px] font-bold text-ink mt-1.5 leading-snug">{gap.noun(gap.count)}</p>
              <p className="text-[11px] mt-1 leading-snug flex-1" style={{ color: '#94A3B8' }}>{gap.hint}</p>
              <span className="flex items-center gap-1 text-xs font-bold mt-3" style={{ color: 'var(--admin-accent)' }}>
                {gap.action} <ArrowRight size={12} />
              </span>
            </button>
          ))}
        </div>
      )}

      {readiness.publishedPeriods > 0 && (
        <p className="text-[11px] text-ink-faint mt-3">
          {readiness.publishedPeriods} period{readiness.publishedPeriods === 1 ? '' : 's'} published to teachers.
        </p>
      )}
    </div>
  )
}
