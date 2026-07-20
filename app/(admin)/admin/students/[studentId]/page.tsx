'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAdmin } from '@/lib/admin-context'
import {
  Loader2, GraduationCap, BookOpen, HelpCircle, ClipboardList, Hourglass, AlertTriangle,
} from 'lucide-react'
import PageHeader from '@/components/theme/PageHeader'

interface SubjectRecord {
  classId: string
  subjectName: string
  teacherName: string
  attendanceRate: number
  totalSessions: number
  avgScore: number
  totalTests: number
  marks: { topic: string; score: number; totalMarks: number; date: string }[]
  mastery: { topic: string; mastery: number; attempts: number }[]
  syllabus: { done: number; total: number }
}
interface FullRecord {
  student: { id: string; name: string; rollNumber: string; studentCode: string | null; grade: string; section: string }
  subjects: SubjectRecord[]
  doubts: { subject?: string; question: string; answer?: string; status: string; createdAt: string }[]
  interventionNotes: { note: string; date: string; teacherName: string }[]
  catchupMaterials: { topic: string; subject?: string; status: string; createdAt: string }[]
}

function pctColor(p: number): string {
  return p >= 0.75 ? '#059669' : p >= 0.5 ? '#D97706' : '#dc2626'
}

export default function StudentFullRecordPage() {
  const { school } = useAdmin()
  const params = useParams()
  const studentId = params.studentId as string

  const [record, setRecord] = useState<FullRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!school) return
    setLoading(true)
    setError('')
    fetch(`/api/admin/schools/${school.id}/students/${studentId}/full-record`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Failed to load')
        return r.json()
      })
      .then(setRecord)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load student record'))
      .finally(() => setLoading(false))
  }, [school, studentId])

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-ink-soft" /></div>
  }
  if (error || !record) {
    return (
      <div className="paper-page pb-16">
        <PageHeader title="Student Record" />
        <div className="px-5 pt-6 max-w-3xl mx-auto">
          <div className="paper-card p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-ink">{error || 'Could not load this student.'}</p>
          </div>
        </div>
      </div>
    )
  }

  const { student, subjects, doubts, interventionNotes, catchupMaterials } = record
  const overallAttendance = subjects.length
    ? subjects.reduce((s, x) => s + x.attendanceRate, 0) / subjects.length
    : 0
  const overallScore = subjects.filter(s => s.totalTests > 0).length
    ? subjects.filter(s => s.totalTests > 0).reduce((s, x) => s + x.avgScore, 0) / subjects.filter(s => s.totalTests > 0).length
    : 0

  return (
    <div className="paper-page pb-16">
      <PageHeader eyebrow={`Grade ${student.grade}${student.section ? ` · Sec ${student.section}` : ''}`} title={student.name} subtitle={`Roll No. ${student.rollNumber}${student.studentCode ? ` · Code ${student.studentCode}` : ''}`} />

      <div className="px-5 pt-2 max-w-3xl mx-auto space-y-5 relative z-10">

        {/* ── Snapshot ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="paper-card p-4 text-center">
            <p className="text-2xl font-black" style={{ color: pctColor(overallAttendance) }}>{Math.round(overallAttendance * 100)}%</p>
            <p className="text-[11px] font-semibold text-ink-soft mt-1">Attendance</p>
          </div>
          <div className="paper-card p-4 text-center">
            <p className="text-2xl font-black" style={{ color: pctColor(overallScore) }}>{subjects.some(s => s.totalTests > 0) ? `${Math.round(overallScore * 100)}%` : '—'}</p>
            <p className="text-[11px] font-semibold text-ink-soft mt-1">Avg Score</p>
          </div>
          <div className="paper-card p-4 text-center">
            <p className="text-2xl font-black text-ink">{subjects.length}</p>
            <p className="text-[11px] font-semibold text-ink-soft mt-1">Subjects</p>
          </div>
        </div>

        {/* ── Per-subject breakdown ── */}
        <div className="paper-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-ink-soft" />
            <h2 className="font-display font-bold text-ink">By Subject</h2>
          </div>
          {subjects.length === 0 ? (
            <p className="text-sm text-ink-soft text-center py-4">No subject data yet.</p>
          ) : (
            <div className="space-y-5">
              {subjects.map(s => (
                <div key={s.classId} className="rounded-2xl p-4" style={{ background: 'rgba(58,44,30,0.03)', border: '1.5px solid rgba(58,44,30,0.1)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-bold text-ink text-sm">{s.subjectName}</p>
                      <p className="text-xs text-ink-soft">{s.teacherName}</p>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="text-sm font-black" style={{ color: pctColor(s.attendanceRate) }}>{Math.round(s.attendanceRate * 100)}%</p>
                        <p className="text-[10px] text-ink-faint">Attendance</p>
                      </div>
                      <div>
                        <p className="text-sm font-black" style={{ color: s.totalTests > 0 ? pctColor(s.avgScore) : '#A8977F' }}>{s.totalTests > 0 ? `${Math.round(s.avgScore * 100)}%` : '—'}</p>
                        <p className="text-[10px] text-ink-faint">Avg Score</p>
                      </div>
                      <div>
                        <p className="text-sm font-black text-ink">{s.syllabus.total > 0 ? `${s.syllabus.done}/${s.syllabus.total}` : '—'}</p>
                        <p className="text-[10px] text-ink-faint">Syllabus</p>
                      </div>
                    </div>
                  </div>

                  {s.mastery.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-black text-ink-soft uppercase tracking-wide mb-1.5">Topic mastery</p>
                      <div className="flex flex-wrap gap-1.5">
                        {s.mastery.map(m => (
                          <span key={m.topic} className="text-[11px] font-semibold px-2 py-1 rounded-full"
                            style={{ background: `${pctColor(m.mastery)}18`, color: pctColor(m.mastery) }}>
                            {m.topic} · {Math.round(m.mastery * 100)}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {s.marks.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-ink-soft uppercase tracking-wide mb-1.5">Test results ({s.marks.length})</p>
                      <div className="space-y-1">
                        {s.marks.map((m, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-ink-soft truncate flex-1">{m.topic}</span>
                            <span className="font-bold text-ink shrink-0 ml-2">{m.score}/{m.totalMarks}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Doubts asked ── */}
        {doubts.length > 0 && (
          <div className="paper-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle className="w-4 h-4 text-ink-soft" />
              <h2 className="font-display font-bold text-ink">Doubts Asked ({doubts.length})</h2>
            </div>
            <div className="space-y-2">
              {doubts.map((d, i) => (
                <div key={i} className="rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(58,44,30,0.03)' }}>
                  <p className="text-sm font-semibold text-ink">{d.question}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {d.subject && <span className="text-[10px] font-bold text-ink-soft bg-black/[0.05] px-2 py-0.5 rounded-full">{d.subject}</span>}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.status === 'answered' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {d.status === 'answered' ? 'Answered' : 'Pending'}
                    </span>
                  </div>
                  {d.answer && <p className="text-xs text-ink-soft mt-1.5">{d.answer}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Teacher notes across all subjects ── */}
        {interventionNotes.length > 0 && (
          <div className="paper-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-ink-soft" />
              <h2 className="font-display font-bold text-ink">Teacher Notes ({interventionNotes.length})</h2>
            </div>
            <div className="space-y-2">
              {interventionNotes.map((n, i) => (
                <div key={i} className="rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(58,44,30,0.03)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-ink-soft">{new Date(n.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className="text-[10px] font-bold text-ink-faint">· {n.teacherName}</span>
                  </div>
                  <p className="text-sm text-ink">{n.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Catch-up materials ── */}
        {catchupMaterials.length > 0 && (
          <div className="paper-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Hourglass className="w-4 h-4 text-ink-soft" />
              <h2 className="font-display font-bold text-ink">Catch-Up Materials ({catchupMaterials.length})</h2>
            </div>
            <div className="space-y-2">
              {catchupMaterials.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(58,44,30,0.03)' }}>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink truncate">{c.topic}</p>
                    {c.subject && <p className="text-xs text-ink-soft">{c.subject}</p>}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${c.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {c.status === 'done' ? 'Done' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {subjects.length === 0 && doubts.length === 0 && interventionNotes.length === 0 && catchupMaterials.length === 0 && (
          <div className="paper-card p-6 text-center">
            <GraduationCap className="w-8 h-8 text-ink-faint mx-auto mb-3" />
            <p className="text-sm text-ink-soft">No activity recorded for this student yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
