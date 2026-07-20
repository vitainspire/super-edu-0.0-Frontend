'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Sparkles, AlertTriangle, Fingerprint,
  RefreshCw, FileText, CheckCircle2, BookX, Calendar,
  ClipboardList, Trash2, Plus, Mic, MicOff, ScanLine,
  LayoutGrid, TrendingUp, Users2, Copy, Check,
} from 'lucide-react'
import { useApp } from '@/lib/context'
import LearningFingerprint from '@/components/fingerprint/LearningFingerprint'
import WarningCard from '@/components/alerts/WarningCard'
import RecoveryEngine from '@/components/recovery/RecoveryEngine'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import ScoreChart from '@/components/charts/ScoreChart'
import AttendanceChart from '@/components/charts/AttendanceChart'
import { getMasteryColor, getMasteryLabel } from '@/lib/logic/mastery'
import type { RecoveryAttempt, InterventionNote } from '@/lib/types'
import * as sbq from '@/lib/supabase-queries'
import { aiKey, getAiCache, setAiCache, TTL } from '@/lib/ai-cache'

interface StudentReport {
  summary: string
  strengths: string
  growth: string
  recommendation: string
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const {
    students, teacher, attendance, sessions,
    getStudentMastery, getStudentWarnings, getStudentMarks,
    getStudentFingerprint, getStudentAttendanceRate, getStudentAvgMastery,
    getStudentPotential,
  } = useApp()

  const missedTopics = useMemo(() => {
    const absences = attendance.filter(a => a.studentId === id && a.status === 'absent')
    return absences
      .map(a => {
        const session = sessions.find(s => s.id === a.sessionId)
        if (!session) return null
        return { topic: session.topic, date: session.date, id: a.id }
      })
      .filter((x): x is { topic: string; date: string; id: string } => x !== null)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [attendance, sessions, id])

  const [activeTab, setActiveTab] = useState<'overview' | 'missed' | 'fingerprint' | 'recovery' | 'log' | 'report' | 'allsubjects'>('overview')

  // Cross-subject overview state
  interface SubjectOverview {
    classId: string
    subjectName: string
    teacherName: string
    attendanceRate: number
    totalSessions: number
    avgScore: number
    totalTests: number
    recentMarks: Array<{ topic: string; score: number; totalMarks: number; date: string }>
  }
  const [subjectOverview, setSubjectOverview] = useState<SubjectOverview[] | null>(null)
  const [subjectOverviewLoading, setSubjectOverviewLoading] = useState(false)
  const [recoveryAttempts, setRecoveryAttempts] = useState<RecoveryAttempt[]>([])
  const [interventionNotes, setInterventionNotes] = useState<InterventionNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0])
  const [savingNote, setSavingNote] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const [potentialSentence, setPotentialSentence] = useState('')
  const [loadingPotential, setLoadingPotential] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    })
  }

  // AI Report state
  const [report, setReport]               = useState<StudentReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError]     = useState('')

  const student = students.find((s) => s.id === id)

  useEffect(() => {
    if (!id) return
    sbq.fetchInterventionsByStudent(id)
      .then(notes => setInterventionNotes([...notes].sort((a, b) => b.date.localeCompare(a.date))))
      .catch(console.error)
  }, [id])

  const saveNote = async () => {
    if (!noteText.trim() || !teacher) return
    setSavingNote(true)
    const note: InterventionNote = {
      id: crypto.randomUUID(),
      studentId: id,
      teacherId: teacher.id,
      note: noteText.trim(),
      date: noteDate,
      createdAt: new Date().toISOString(),
    }
    setInterventionNotes(prev => [note, ...prev].sort((a, b) => b.date.localeCompare(a.date)))
    setNoteText('')
    setSavingNote(false)
    sbq.upsertIntervention(note).catch(console.error)
  }

  const deleteNote = async (noteId: string) => {
    setInterventionNotes(prev => prev.filter(n => n.id !== noteId))
    sbq.deleteIntervention(noteId).catch(console.error)
  }

  const toggleVoice = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop()
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = 'en-IN'
    rec.onresult = (e: { results: SpeechRecognitionResultList; resultIndex: number }) => {
      const transcript = Array.from(e.results)
        .slice(e.resultIndex)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join(' ')
      setNoteText(prev => prev + (prev ? ' ' : '') + transcript)
    }
    rec.onend = () => setIsRecording(false)
    rec.onerror = () => { setIsRecording(false); recognitionRef.current = null }
    recognitionRef.current = rec
    rec.start()
    setIsRecording(true)
  }, [isRecording])

  useEffect(() => {
    const fetchPotential = async () => {
      if (!student) return
      const signal = getStudentPotential(student.id)
      if (!signal) return
      const ck = aiKey('potential', { type: signal.type, data: signal.data })
      const cached = getAiCache<string>(ck)
      if (cached) { setPotentialSentence(cached); return }
      setLoadingPotential(true)
      try {
        const res = await fetch('/api/potential', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signal, studentName: student.name }),
        })
        if (!res.ok) return
        const { sentence } = await res.json()
        setPotentialSentence(sentence)
        setAiCache(ck, sentence, TTL.ONE_WEEK)
      } catch { /* no-op */ }
      finally { setLoadingPotential(false) }
    }
    fetchPotential()
  }, [student, getStudentPotential])

  const fetchReport = useCallback(async (force = false) => {
    if (!student || !teacher) return
    const mastery = getStudentMastery(student.id)
    const marks   = getStudentMarks(student.id)
    const warnings = getStudentWarnings(student.id)
    const attendanceRate = getStudentAttendanceRate(student.id)
    const attBucket = attendanceRate < 0.6 ? 'low' : attendanceRate < 0.85 ? 'mid' : 'high'
    const ck = aiKey('student-report', {
      roll: student.rollNumber, grade: teacher.grade, subject: teacher.subject,
      mc: marks.length, tc: mastery.length, att: attBucket, wc: warnings.length,
    })
    if (!force) {
      const cached = getAiCache<StudentReport>(ck)
      if (cached) { setReport(cached); return }
    }
    setReportLoading(true)
    setReportError('')
    try {
      const res = await fetch('/api/student-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: { name: student.name, interests: student.interests, goal: student.goal, rollNumber: student.rollNumber },
          marks: marks.map(m => ({ topic: m.topic, score: m.score, totalMarks: m.totalMarks, conductedOn: m.conductedOn })),
          mastery: mastery.map(m => ({ topic: m.topic, mastery: m.mastery, attempts: m.attempts })),
          attendanceRate,
          warnings: warnings.map(w => ({ reason: w.reason, action: w.action, level: w.level })),
          subject: teacher.subject,
          grade: teacher.grade,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setReport(data)
      setAiCache(ck, data, TTL.ONE_WEEK)
    } catch {
      setReportError('Could not generate report. Please try again.')
    } finally {
      setReportLoading(false)
    }
  }, [student, teacher, getStudentMastery, getStudentMarks, getStudentWarnings, getStudentAttendanceRate])

  // AI insight only fetched on demand — report tab is data-driven by default

  if (!student) {
    return (
      <div className="paper-page flex items-center justify-center">
        <p className="text-ink-soft">Student not found</p>
      </div>
    )
  }

  const mastery       = getStudentMastery(student.id)
  const warnings      = getStudentWarnings(student.id)
  const fingerprint   = getStudentFingerprint(student.id)
  const attendanceRate = getStudentAttendanceRate(student.id)
  const avgMastery    = getStudentAvgMastery(student.id)
  const marks         = getStudentMarks(student.id)
  const signal        = getStudentPotential(student.id)

  // Score chart: each test as a point, sorted by date
  const scorePoints = [...marks]
    .sort((a, b) => a.conductedOn.localeCompare(b.conductedOn))
    .map(m => ({
      label: new Date(m.conductedOn + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      pct: m.score / m.totalMarks,
      topic: m.topic,
      term: (m as { term?: string }).term,
    }))

  // Attendance chart: group sessions by week, compute attendance rate per week
  const weekBars = (() => {
    const studentAtt = attendance.filter(a => a.studentId === id)
    const weekMap    = new Map<string, { present: number; total: number }>()
    sessions.forEach(s => {
      const att = studentAtt.find(a => a.sessionId === s.id)
      if (!att) return
      const d   = new Date(s.date + 'T00:00:00')
      const mon = new Date(d)
      mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = mon.toISOString().split('T')[0]
      const rec = weekMap.get(key) ?? { present: 0, total: 0 }
      rec.total += 1
      if (att.status === 'present' || att.status === 'late') rec.present += 1
      weekMap.set(key, rec)
    })
    return [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10)
      .map(([key, v]) => ({
        week: new Date(key + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        rate: v.total > 0 ? v.present / v.total : 0,
        present: v.present,
        total: v.total,
      }))
  })()
  const saveFeedback = async (attempt: RecoveryAttempt) => {
    setRecoveryAttempts(prev => [...prev, attempt])
    sbq.upsertRecoveryAttempt(attempt).catch(console.error)
  }

  const loadSubjectOverview = async () => {
    if (subjectOverview || subjectOverviewLoading) return
    setSubjectOverviewLoading(true)
    try {
      const res = await fetch(`/api/teacher/student-overview/${id}`)
      if (!res.ok) return
      const data = await res.json()
      setSubjectOverview(data.subjects ?? [])
    } catch { /* no-op */ }
    finally { setSubjectOverviewLoading(false) }
  }

  const TABS = [
    { key: 'overview',     label: 'Overview' },
    { key: 'allsubjects',  label: 'All Subjects' },
    { key: 'missed',       label: `Missed${missedTopics.length > 0 ? ` (${missedTopics.length})` : ''}` },
    { key: 'fingerprint',  label: 'Learning Profile' },
    { key: 'recovery',     label: 'Extra Help' },
    { key: 'log',          label: `Log${interventionNotes.length > 0 ? ` (${interventionNotes.length})` : ''}` },
    { key: 'report',       label: 'Progress Report' },
  ] as const

  const avatarGradients = [
    '#5B87AD',
    '#5C8F52',
    '#C46B54',
    '#AD8A2C',
    '#8069B0',
    '#BD6D8B',
  ]
  let hash = 0
  for (let i = 0; i < student.name.length; i++) hash = student.name.charCodeAt(i) + ((hash << 5) - hash)
  const avatarBg = warnings.some(w => w.level === 'critical')
    ? '#dc2626'
    : avatarGradients[Math.abs(hash) % avatarGradients.length]

  return (
    <div className="paper-page">
      {/* Header */}
      <div className="px-4 pt-5 pb-0 relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-transform"
            style={{ background: 'rgba(58,44,30,0.08)' }}
          >
            <ArrowLeft size={18} className="text-ink" />
          </button>
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-base shrink-0"
            style={{ background: avatarBg }}
          >
            {student.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-base font-bold text-ink leading-tight truncate">{student.name}</h1>
            <p className="text-xs text-ink-soft font-medium">Roll #{student.rollNumber} · {marks.length} assessments</p>
          </div>
          <div className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${getMasteryColor(avgMastery)}`}>
            {getMasteryLabel(avgMastery)}
          </div>
        </div>

        {student.studentCode && (
          <button
            onClick={() => copyCode(student.studentCode!)}
            className="flex items-center gap-1.5 bg-[#E9E1F6] px-2.5 py-1 rounded-lg text-[11px] font-black text-[#8069B0] tracking-wider active:scale-95 transition-transform mb-3"
            title="Copy Student ID"
          >
            <span className="font-bold tracking-wide opacity-70">STUDENT CODE</span>
            {student.studentCode}
            {codeCopied
              ? <Check size={11} className="text-emerald-500" />
              : <Copy size={11} className="text-[#8069B0]" />}
          </button>
        )}

        {/* Tabs */}
        <div className="flex overflow-x-auto no-scrollbar gap-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key)
                if (t.key === 'allsubjects') loadSubjectOverview()
              }}
              className={`shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                activeTab === t.key
                  ? 'text-ink'
                  : 'border-transparent text-ink-faint'
              }`}
              style={activeTab === t.key ? { borderBottomColor: 'var(--ink)' } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3 pb-24 relative z-10">

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <>
            {warnings.length > 0 && (
              <WarningCard studentName={student.name} rollNumber={student.rollNumber} warnings={warnings} />
            )}
            {(signal || loadingPotential) && (
              <div className="rounded-2xl p-4" style={{ background: '#E9E1F6', border: '1px solid rgba(49,33,92,0.15)' }}>
                <p className="text-sm font-semibold flex items-center gap-2 mb-1" style={{ color: '#31215C' }}>
                  <Sparkles size={14} /> Hidden Potential Detected
                </p>
                {loadingPotential ? (
                  <div className="flex items-center gap-2" style={{ color: '#5B4A85' }}>
                    <RefreshCw size={14} className="animate-spin" />
                    <span className="text-sm">Analysing…</span>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: '#4A3A73' }}>{potentialSentence}</p>
                )}
              </div>
            )}
            {/* Score progress chart */}
            {scorePoints.length > 0 && (
              <div className="paper-card p-4">
                <p className="font-semibold text-ink mb-1">Score Progress</p>
                <p className="text-xs text-ink-soft mb-3">{scorePoints.length} test{scorePoints.length !== 1 ? 's' : ''} this year</p>
                <ScoreChart points={scorePoints} />
              </div>
            )}

            {/* Attendance trend chart */}
            {weekBars.length > 0 && (
              <div className="paper-card p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-ink">Attendance by Week</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    attendanceRate >= 0.9 ? 'bg-emerald-100 text-emerald-700' :
                    attendanceRate >= 0.75 ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {Math.round(attendanceRate * 100)}% overall
                  </span>
                </div>
                <AttendanceChart weeks={weekBars} />
              </div>
            )}

            {/* Recent assessments list */}
            {marks.length > 0 ? (
              <div className="paper-card p-4">
                <p className="font-semibold text-ink mb-3">Recent Assessments</p>
                <div className="space-y-3">
                  {marks.slice(-5).reverse().map((m) => {
                    const pct = m.score / m.totalMarks
                    return (
                      <div key={m.id} className="flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-ink">{m.topic}</p>
                          <p className="text-xs text-ink-soft">{new Date(m.conductedOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <p className="font-bold text-ink">{m.score}/{m.totalMarks}</p>
                            {m.source === 'ai_scanned' && (
                              <span title="AI Scanned"><ScanLine size={12} className="text-ink-faint shrink-0" /></span>
                            )}
                          </div>
                          <p className={`text-xs font-semibold ${pct >= 0.75 ? 'text-green-600' : pct >= 0.5 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {Math.round(pct * 100)}%
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="paper-card text-center py-6 px-4 text-ink-soft">
                <p>No assessments yet</p>
                <p className="text-sm mt-1">Enter marks to see this student&apos;s performance</p>
              </div>
            )}
          </>
        )}

        {/* ALL SUBJECTS */}
        {activeTab === 'allsubjects' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(58,44,30,0.08)' }}>
                <LayoutGrid size={15} className="text-ink" />
              </div>
              <div>
                <p className="font-bold text-ink">All Subjects</p>
                <p className="text-xs text-ink-soft">Cross-subject view for {student.name.split(' ')[0]}</p>
              </div>
            </div>

            {subjectOverviewLoading && (
              <div className="paper-card text-center py-10">
                <RefreshCw size={22} className="text-ink-soft mx-auto mb-3 animate-spin" />
                <p className="text-sm text-ink-soft">Loading subject data…</p>
              </div>
            )}

            {!subjectOverviewLoading && subjectOverview && subjectOverview.length === 0 && (
              <div className="paper-card text-center py-10">
                <Users2 size={28} className="text-ink-faint mx-auto mb-3" />
                <p className="font-semibold text-ink">No other subjects found</p>
                <p className="text-xs text-ink-soft mt-1">This student appears in only one class.</p>
              </div>
            )}

            {!subjectOverviewLoading && subjectOverview && subjectOverview.map((s, idx) => {
              const attColor = s.attendanceRate >= 0.9 ? 'text-emerald-600' : s.attendanceRate >= 0.75 ? 'text-amber-600' : 'text-red-500'
              const scoreColor = s.avgScore >= 0.75 ? 'text-emerald-600' : s.avgScore >= 0.5 ? 'text-amber-600' : 'text-red-500'
              const SUBJ_COLORS = ['#5B87AD', '#5C8F52', '#C46B54', '#AD8A2C', '#8069B0', '#BD6D8B']
              return (
                <div key={s.classId} className="paper-card space-y-3 p-4">
                  {/* Subject header */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                      style={{ background: SUBJ_COLORS[idx % SUBJ_COLORS.length] }}>
                      {s.subjectName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-ink text-sm">{s.subjectName}</p>
                      <p className="text-xs text-ink-soft">{s.teacherName}</p>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(58,44,30,0.06)' }}>
                      <p className={`text-lg font-black ${attColor}`}>
                        {s.totalSessions > 0 ? `${Math.round(s.attendanceRate * 100)}%` : '—'}
                      </p>
                      <p className="text-[10px] font-semibold text-ink-soft mt-0.5">Attendance</p>
                    </div>
                    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(58,44,30,0.06)' }}>
                      <p className={`text-lg font-black ${s.totalTests > 0 ? scoreColor : 'text-ink-faint'}`}>
                        {s.totalTests > 0 ? `${Math.round(s.avgScore * 100)}%` : '—'}
                      </p>
                      <p className="text-[10px] font-semibold text-ink-soft mt-0.5">Avg Score</p>
                    </div>
                    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(58,44,30,0.06)' }}>
                      <p className="text-lg font-black text-ink">{s.totalTests}</p>
                      <p className="text-[10px] font-semibold text-ink-soft mt-0.5">Tests</p>
                    </div>
                  </div>

                  {/* Recent marks */}
                  {s.recentMarks.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black text-ink-soft uppercase tracking-wide">Recent Tests</p>
                      {s.recentMarks.slice(0, 3).map((m, mi) => {
                        const pct = m.score / m.totalMarks
                        const bar = pct >= 0.75 ? 'bg-emerald-500' : pct >= 0.5 ? 'bg-amber-400' : 'bg-red-400'
                        return (
                          <div key={mi} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-ink truncate">{m.topic}</p>
                              <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(58,44,30,0.08)' }}>
                                <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${Math.round(pct * 100)}%` }} />
                              </div>
                            </div>
                            <p className="text-xs font-bold text-ink-soft shrink-0">{m.score}/{m.totalMarks}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* MISSED TOPICS */}
        {activeTab === 'missed' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
                <BookX size={15} className="text-red-500" />
              </div>
              <div>
                <p className="font-bold text-ink">Missed Topics</p>
                <p className="text-xs text-ink-soft">Sessions {student.name.split(' ')[0]} was absent for</p>
              </div>
            </div>

            {missedTopics.length === 0 ? (
              <div className="paper-card text-center py-10">
                <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
                <p className="font-semibold text-ink">No missed topics</p>
                <p className="text-sm text-ink-soft mt-1">
                  {student.name.split(' ')[0]} has been present for every recorded session.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <AlertTriangle size={16} className="text-red-500 shrink-0" />
                  <p className="text-sm text-red-800 font-semibold">
                    {missedTopics.length} topic{missedTopics.length > 1 ? 's' : ''} missed — needs catch-up
                  </p>
                </div>
                <div className="space-y-2">
                  {missedTopics.map((mt, idx) => (
                    <div key={mt.id} className="paper-card flex items-center gap-3 p-4">
                      <span className="w-7 h-7 bg-red-100 text-red-600 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-ink text-sm">{mt.topic}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Calendar size={11} className="text-ink-soft" />
                          <p className="text-xs text-ink-soft">
                            Taught on {new Date(mt.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded-full shrink-0">absent</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* FINGERPRINT */}
        {activeTab === 'fingerprint' && (
          <ErrorBoundary label="learning fingerprint">
            <LearningFingerprint fingerprint={fingerprint} mastery={mastery} attendanceRate={attendanceRate} />
          </ErrorBoundary>
        )}

        {/* RECOVERY */}
        {activeTab === 'recovery' && (
          <>
            {mastery.filter((m) => m.mastery < 0.5).length === 0 ? (
              <div className="paper-card text-center py-8">
                <p className="text-green-600 font-semibold text-lg flex items-center justify-center gap-2">
                  <CheckCircle2 size={18} /> No struggling topics
                </p>
                <p className="text-ink-soft text-sm mt-1">This student is doing well!</p>
              </div>
            ) : (
              mastery.filter((m) => m.mastery < 0.5).map((m) => (
                <ErrorBoundary key={m.topic} label="recovery engine">
                  <RecoveryEngine
                    studentId={student.id}
                    studentName={student.name}
                    topic={m.topic}
                    grade={teacher?.grade ?? '6'}
                    attempts={m.attempts}
                    previousAttempts={recoveryAttempts.filter((r) => r.topic === m.topic)}
                    onSaveFeedback={saveFeedback}
                  />
                </ErrorBoundary>
              ))
            )}
          </>
        )}

        {/* INTERVENTION LOG */}
        {activeTab === 'log' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(58,44,30,0.08)' }}>
                <ClipboardList size={15} className="text-ink" />
              </div>
              <div>
                <p className="font-bold text-ink">Intervention Log</p>
                <p className="text-xs text-ink-soft">Record observations, actions, and follow-ups</p>
              </div>
            </div>

            {/* Add note form */}
            <div className="paper-card space-y-3 p-4">
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  value={noteDate}
                  onChange={e => setNoteDate(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Note</label>
                  <button
                    type="button"
                    onClick={toggleVoice}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                      isRecording
                        ? 'bg-red-100 text-red-600 animate-pulse'
                        : 'text-ink-soft hover:text-ink'
                    }`}
                    style={!isRecording ? { background: 'rgba(58,44,30,0.06)' } : undefined}
                  >
                    {isRecording ? <MicOff size={12} /> : <Mic size={12} />}
                    {isRecording ? 'Stop' : 'Voice'}
                  </button>
                </div>
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder={isRecording ? 'Listening… speak now' : 'What did you try? What did you observe? Any next steps?'}
                  rows={3}
                  className={`input-field resize-none transition-all ${isRecording ? 'border-red-300 ring-1 ring-red-100' : ''}`}
                />
              </div>
              <button
                onClick={saveNote}
                disabled={savingNote || !noteText.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-bold text-sm active:scale-95 transition-all disabled:opacity-50"
                style={{ background: 'var(--ink)' }}
              >
                <Plus size={14} />
                {savingNote ? 'Saving…' : 'Save Note'}
              </button>
            </div>

            {/* Notes list */}
            {interventionNotes.length === 0 ? (
              <div className="paper-card text-center py-10">
                <ClipboardList size={28} className="text-ink-faint mx-auto mb-3" />
                <p className="font-semibold text-ink">No notes yet</p>
                <p className="text-xs text-ink-soft mt-1">Log interventions, observations, or follow-ups above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {interventionNotes.map(n => (
                  <div key={n.id} className="paper-card flex gap-3 items-start p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Calendar size={11} className="text-ink-soft" />
                        <p className="text-xs text-ink-soft font-semibold">
                          {new Date(n.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <p className="text-sm text-ink leading-relaxed">{n.note}</p>
                    </div>
                    <button
                      onClick={() => deleteNote(n.id)}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-50 text-ink-faint hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PROGRESS REPORT — data-first */}
        {activeTab === 'report' && (
          <div className="space-y-3">

            {/* ── Snapshot stats ── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Attendance */}
              <div className="paper-card px-4 py-4 text-center">
                <p className={`text-4xl font-black ${
                  attendanceRate >= 0.9 ? 'text-emerald-600' :
                  attendanceRate >= 0.75 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {Math.round(attendanceRate * 100)}%
                </p>
                <p className="text-xs font-semibold text-ink-soft mt-1">Attendance</p>
              </div>

              {/* Avg Score */}
              <div className="paper-card px-4 py-4 text-center">
                <p className={`text-4xl font-black ${
                  avgMastery >= 0.75 ? 'text-emerald-600' :
                  avgMastery >= 0.5 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {Math.round(avgMastery * 100)}%
                </p>
                <p className="text-xs font-semibold text-ink-soft mt-1">Avg Score</p>
              </div>

              {/* Tests taken */}
              <div className="paper-card px-4 py-4 text-center">
                <p className="text-4xl font-black text-ink">{marks.length}</p>
                <p className="text-xs font-semibold text-ink-soft mt-1">Tests Taken</p>
              </div>

              {/* Status */}
              <div className="paper-card px-4 py-4 text-center">
                <p className={`text-2xl font-black ${getMasteryColor(avgMastery)}`}>
                  {getMasteryLabel(avgMastery)}
                </p>
                <p className="text-xs font-semibold text-ink-soft mt-1">Overall</p>
              </div>
            </div>

            {/* ── Test results per topic ── */}
            {marks.length > 0 ? (
              <div className="paper-card px-4 py-4">
                <p className="text-xs font-black text-ink-soft uppercase tracking-wide mb-3">Test Results</p>
                <div className="space-y-4">
                  {[...marks].sort((a, b) => b.conductedOn.localeCompare(a.conductedOn)).map(m => {
                    const pct = m.score / m.totalMarks
                    const barColor = pct >= 0.75 ? 'bg-emerald-500' : pct >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
                    const badgeColor = pct >= 0.75
                      ? 'bg-emerald-100 text-emerald-700'
                      : pct >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    return (
                      <div key={m.id}>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-ink flex-1 truncate">{m.topic}</p>
                          <span className="text-sm font-bold text-ink shrink-0">{m.score}/{m.totalMarks}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${badgeColor}`}>
                            {Math.round(pct * 100)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(58,44,30,0.08)' }}>
                          <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${Math.round(pct * 100)}%` }} />
                        </div>
                        <p className="text-[10px] text-ink-soft mt-0.5">
                          {new Date(m.conductedOn + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {m.feedback ? ` · ${m.feedback}` : ''}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="paper-card px-4 py-6 text-center">
                <p className="text-sm text-ink-soft">No tests recorded yet</p>
              </div>
            )}

            {/* ── Flags ── */}
            {(warnings.length > 0 || missedTopics.length > 0) && (
              <div className="paper-card px-4 py-4 space-y-2.5">
                <p className="text-xs font-black text-ink-soft uppercase tracking-wide mb-1">Flags</p>
                {missedTopics.length > 0 && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-ink">
                      Missed {missedTopics.length} session{missedTopics.length > 1 ? 's' : ''} —{' '}
                      <span className="font-semibold">{missedTopics.slice(0, 2).map(t => t.topic).join(', ')}{missedTopics.length > 2 ? ` +${missedTopics.length - 2} more` : ''}</span>
                    </p>
                  </div>
                )}
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle size={13} className={`shrink-0 mt-0.5 ${w.level === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                    <p className="text-sm text-ink">{w.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Teacher notes ── */}
            {interventionNotes.length > 0 && (
              <div className="paper-card px-4 py-4">
                <p className="text-xs font-black text-ink-soft uppercase tracking-wide mb-3">Teacher Notes</p>
                <div className="space-y-3">
                  {interventionNotes.slice(0, 4).map(n => (
                    <div key={n.id} className="flex gap-3">
                      <div className="w-0.5 rounded-full shrink-0" style={{ background: '#C7B7E8' }} />
                      <div className="min-w-0">
                        <p className="text-[10px] text-ink-soft font-semibold mb-0.5">
                          {new Date(n.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-sm text-ink leading-snug">{n.note}</p>
                      </div>
                    </div>
                  ))}
                  {interventionNotes.length > 4 && (
                    <p className="text-xs text-ink-soft pl-3">+{interventionNotes.length - 4} more notes in Log tab</p>
                  )}
                </div>
              </div>
            )}

            {/* ── AI insight — on demand, one line only ── */}
            <div className="rounded-2xl px-4 py-3" style={{ background: '#E9E1F6', border: '1px solid rgba(49,33,92,0.15)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={12} style={{ color: '#5B4A85' }} />
                  <p className="text-xs font-black uppercase tracking-wide" style={{ color: '#31215C' }}>AI Insight</p>
                </div>
                {!reportLoading && (
                  <button
                    onClick={() => fetchReport(true)}
                    className="flex items-center gap-1 text-[10px] font-bold transition-colors"
                    style={{ color: '#5B4A85' }}
                  >
                    <RefreshCw size={10} className={reportLoading ? 'animate-spin' : ''} />
                    {report ? 'Refresh' : 'Generate'}
                  </button>
                )}
              </div>

              {reportLoading && (
                <div className="mt-2 h-3 rounded-full animate-pulse w-3/4" style={{ background: '#D9CDF0' }} />
              )}
              {!reportLoading && report && (
                <p className="text-sm text-ink mt-1.5 leading-snug">{report.summary}</p>
              )}
              {!reportLoading && !report && (
                <p className="text-xs mt-1" style={{ color: '#8C7BAE' }}>Tap Generate for a one-line AI summary</p>
              )}
              {!reportLoading && reportError && (
                <p className="text-xs text-red-500 mt-1">{reportError}</p>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
