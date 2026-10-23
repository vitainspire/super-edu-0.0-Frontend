'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { BACKEND_URL } from '@/lib/backend'

interface SubjectRow {
  subjectName: string
  teacherName: string
  attendanceRate: number
  totalTests: number
  avgScore: number
  statusLabel: string
}

interface ExamScheduleEntry {
  examTitle: string
  startDate: string
  endDate: string
  subjects: Array<{
    subjectName: string
    teacherName: string
    status: 'scheduled' | 'completed'
    score?: number
    totalMarks?: number
  }>
}

interface PublicReport {
  student: { name: string; rollNumber?: string; grade: string; section: string }
  overall: { attendanceRate: number; avgScore: number; statusLabel: string }
  subjects: SubjectRow[]
  examSchedule: ExamScheduleEntry[]
}

const statusColor = (label: string) =>
  label === 'Doing well' ? '#047857' : label === 'Needs some help' ? '#B45309' : '#B91C1C'

export default function PublicReportPage() {
  const { token } = useParams<{ token: string }>()
  const [report, setReport] = useState<PublicReport | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    fetch(`${BACKEND_URL}/api/public/report/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.detail || 'This link has expired or is invalid.')
        }
        return res.json()
      })
      .then(setReport)
      .catch((e) => setError(e.message || 'Could not load this report.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', color: '#64748B' }}>
        Loading…
      </div>
    )
  }

  if (error || !report) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', padding: 24, textAlign: 'center' }}>
        <p style={{ color: '#475569', fontSize: 15 }}>{error || 'This link has expired or is invalid.'}</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F6F9', fontFamily: 'sans-serif', padding: '20px 16px 40px' }}>
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0 }}>{report.student.name}</h1>
        <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
          Grade {report.student.grade}{report.student.section ? ` · Section ${report.student.section}` : ''}
          {report.student.rollNumber ? ` · Roll No. ${report.student.rollNumber}` : ''}
        </p>

        {/* Overall */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <div style={{ flex: 1, background: '#fff', borderRadius: 14, padding: '14px 10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
            <p style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', margin: 0 }}>{Math.round(report.overall.attendanceRate * 100)}%</p>
            <p style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginTop: 2 }}>Attendance</p>
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: 14, padding: '14px 10px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
            <p style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', margin: 0 }}>{Math.round(report.overall.avgScore * 100)}%</p>
            <p style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginTop: 2 }}>Average Score</p>
          </div>
        </div>
        <p style={{ fontSize: 13, fontWeight: 700, marginTop: 10, color: statusColor(report.overall.statusLabel) }}>
          Overall: {report.overall.statusLabel}
        </p>

        {/* Per-subject */}
        <p style={{ fontSize: 12, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 24, marginBottom: 10 }}>
          Subject-wise
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {report.subjects.map((s, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>{s.subjectName}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: statusColor(s.statusLabel) }}>{s.statusLabel}</p>
              </div>
              <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>Teacher: {s.teacherName}</p>
              <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>
                Attendance {Math.round(s.attendanceRate * 100)}%
                {s.totalTests > 0 ? ` · Average score ${Math.round(s.avgScore * 100)}% · ${s.totalTests} test${s.totalTests === 1 ? '' : 's'}` : ' · No tests yet'}
              </p>
            </div>
          ))}
          {report.subjects.length === 0 && (
            <p style={{ fontSize: 13, color: '#64748B' }}>No subject data yet.</p>
          )}
        </div>

        {/* Scheduled exams */}
        {report.examSchedule.length > 0 && (
          <>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 24, marginBottom: 10 }}>
              Scheduled Exams
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {report.examSchedule.map((exam, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: 0 }}>{exam.examTitle}</p>
                    <p style={{ fontSize: 11, color: '#64748B' }}>
                      {new Date(exam.startDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {exam.subjects.map((s, si) => (
                      <div key={si} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>{s.subjectName}</p>
                        <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: s.status === 'completed' ? '#047857' : '#64748B' }}>
                          {s.status === 'completed' ? `${s.score}/${s.totalMarks}` : 'Scheduled'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          onClick={() => window.print()}
          style={{ marginTop: 24, width: '100%', padding: '12px 0', borderRadius: 14, border: 'none', background: '#0F172A', color: '#fff', fontWeight: 700, fontSize: 14 }}
        >
          Save as PDF / Print
        </button>
      </div>
    </div>
  )
}
