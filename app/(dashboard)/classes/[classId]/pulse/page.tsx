'use client'
import { useState, useCallback, useEffect } from 'react'
import { useParams } from 'next/navigation'
import {
  RefreshCw, Users, Sparkles, Link2,
  ChevronDown, ChevronUp, TrendingUp, BookOpen,
  ClipboardList, AlertTriangle,
} from 'lucide-react'
import { useApp } from '@/lib/context'
import { aiKey, getAiCache, setAiCache, TTL } from '@/lib/ai-cache'
import clsx from 'clsx'

interface PulseReport { health: string; concerns: string; wins: string; focus: string }
interface PeerPair { mentor: string; mentee: string; sharedInterest: string; activity: string }

function pct(n: number) { return `${Math.round(n * 100)}%` }

function StatusChip({ mastery }: { mastery: number }) {
  if (mastery >= 0.75) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Proficient</span>
  if (mastery >= 0.5)  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Developing</span>
  if (mastery > 0)     return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">At Risk</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/[0.05] text-ink-soft">Not Tested</span>
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-black/[0.05] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-bold text-ink-soft w-8 text-right">{pct(value)}</span>
    </div>
  )
}

export default function ClassPulsePage() {
  const { classId } = useParams<{ classId: string }>()
  const {
    teacher, classes,
    getClassStudents, getClassSyllabus, getClassSessions,
    getClassAttendance, tests, marks,
    getStudentAvgMastery, getStudentAttendanceRate,
  } = useApp()

  const cls      = classes.find(c => c.id === classId)
  const students = getClassStudents(classId)
  const syllabus = getClassSyllabus(classId)
  const sessions = getClassSessions(classId)

  const [pulse,        setPulse]        = useState<PulseReport | null>(null)
  const [pulseLoading, setPulseLoading] = useState(false)
  const [pulseError,   setPulseError]   = useState('')
  const [insightsOpen, setInsightsOpen] = useState(false)

  const [pairs,           setPairs]           = useState<PeerPair[]>([])
  const [pairsLoading,    setPairsLoading]    = useState(false)
  const [pairsError,      setPairsError]      = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState('')

  // ── Aggregate stats ──────────────────────────────────────────────────────
  const classTests = tests.filter(t => t.classId === classId)
  const testSummary = classTests.map(t => {
    const tm  = marks.filter(m => m.testId === t.id)
    const avg = tm.length ? tm.reduce((s, m) => s + m.score, 0) / tm.length : 0
    return { topic: t.topic, avgScore: avg, totalMarks: t.totalMarks }
  })

  const classAttendance = getClassAttendance(classId)
  const totalPossible   = sessions.length * students.length
  const presentCount    = sessions.reduce((sum, session) => {
    const ids = new Set(
      classAttendance
        .filter(a => a.sessionId === session.id && a.status !== 'absent')
        .map(a => a.studentId)
    )
    return sum + ids.size
  }, 0)
  const classAttRate = totalPossible > 0 ? presentCount / totalPossible : 0

  const studentStats = students.map(s => ({
    id: s.id, name: s.name,
    avgMastery: getStudentAvgMastery(s.id),
    attendanceRate: getStudentAttendanceRate(s.id),
    interests: s.interests, goal: s.goal,
  })).sort((a, b) => b.avgMastery - a.avgMastery)

  const topicCoverage = syllabus.map(t => {
    const taught = sessions.some(s => s.syllabusTopicId === t.id)
    // find avg score for this topic across tests
    const topicTest = testSummary.find(ts => ts.topic.toLowerCase().includes(t.topic.toLowerCase()))
    return {
      topic: t.topic,
      status: t.isCompleted ? 'Completed' : taught ? 'Taught' : 'Not Taught',
      avgScore: topicTest ? topicTest.avgScore / topicTest.totalMarks : null,
    }
  })

  const completedTopics = syllabus.filter(t => t.isCompleted).length
  const avgMastery      = studentStats.length
    ? studentStats.reduce((s, st) => s + st.avgMastery, 0) / studentStats.length
    : 0

  const proficient  = studentStats.filter(s => s.avgMastery >= 0.75).length
  const developing  = studentStats.filter(s => s.avgMastery >= 0.5 && s.avgMastery < 0.75).length
  const struggling  = studentStats.filter(s => s.avgMastery > 0 && s.avgMastery < 0.5).length
  const notAssessed = studentStats.filter(s => s.avgMastery === 0).length

  // ── Fetch pulse (AI insights) ────────────────────────────────────────────
  const fetchPulse = useCallback(async (force = false) => {
    if (students.length === 0) return
    const attBucket = classAttRate < 0.6 ? 'low' : classAttRate < 0.85 ? 'mid' : 'high'
    const testKey   = testSummary.map(t => t.topic).sort().join('~')
    const ck = aiKey('class-pulse', { classId, attBucket, testKey, sc: students.length, tc: testSummary.length })
    if (!force) {
      const cached = getAiCache<PulseReport>(ck)
      if (cached) { setPulse(cached); return }
    }
    setPulseLoading(true); setPulseError('')
    try {
      const res = await fetch('/api/class-pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          className: cls?.name ?? classId, subject: teacher?.subject ?? '',
          grade: cls?.grade ?? teacher?.grade ?? '',
          students: studentStats.map(s => ({ name: s.name, avgMastery: s.avgMastery, attendanceRate: s.attendanceRate, interests: s.interests })),
          tests: testSummary, attendanceRate: classAttRate, topicCoverage: topicCoverage.map(t => ({ topic: t.topic, status: t.status })),
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setPulse(data); setAiCache(ck, data, TTL.ONE_DAY)
    } catch { setPulseError('Could not generate insights.') }
    finally { setPulseLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, cls, teacher, classAttRate, students.length, sessions.length, testSummary.length, topicCoverage.length])

  // ── Fetch peer pairs ─────────────────────────────────────────────────────
  const fetchPairs = useCallback(async () => {
    if (students.length < 2) return
    const topic     = syllabus.find(t => t.id === selectedTopicId)?.topic ?? 'General'
    const studentKey = students.map(s => s.id).sort().join('~')
    const ck = aiKey('peer-pair', { topic: topic.toLowerCase().trim(), subject: (teacher?.subject ?? '').toLowerCase(), studentKey })
    const cached = getAiCache<PeerPair[]>(ck)
    if (cached) { setPairs(cached); return }
    setPairsLoading(true); setPairsError(''); setPairs([])
    try {
      const res = await fetch('/api/peer-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: studentStats, topic, subject: teacher?.subject ?? '' }),
      })
      if (!res.ok) throw new Error('Failed')
      const { pairs: p } = await res.json()
      setAiCache(ck, p ?? [], TTL.ONE_DAY); setPairs(p ?? [])
    } catch { setPairsError('Could not generate peer pairs.') }
    finally { setPairsLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, students.length, selectedTopicId, teacher])

  useEffect(() => { fetchPulse() }, [fetchPulse])

  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="px-4 pt-4 pb-12 space-y-4 max-w-2xl mx-auto">

      {/* ── Report Header ── */}
      <div className="paper-card px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-soft mb-1">Class Report</p>
            <h2 className="text-lg font-display font-bold text-ink">
              Grade {cls?.grade ?? '—'}{cls?.section ? ` · Section ${cls.section}` : ''}
            </h2>
            <p className="text-xs text-ink-soft mt-0.5">
              {teacher?.subject ?? 'Subject'} · {students.length} Students · Generated {today}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={clsx(
              'px-2.5 py-1 rounded-full text-[11px] font-black',
              classAttRate >= 0.75 ? 'bg-emerald-100 text-emerald-700' :
              classAttRate >= 0.5  ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            )}>
              {pct(classAttRate)} Attendance
            </span>
          </div>
        </div>
      </div>

      {/* ── Overview Metrics ── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Avg Mastery',   value: pct(avgMastery),         sub: 'class average',       color: avgMastery >= 0.75 ? '#059669' : avgMastery >= 0.5 ? '#d97706' : '#dc2626' },
          { label: 'Attendance',    value: pct(classAttRate),        sub: `${sessions.length} sessions`,  color: classAttRate >= 0.75 ? '#059669' : '#d97706' },
          { label: 'Syllabus',      value: `${completedTopics}/${syllabus.length}`, sub: 'topics done', color: '#5B87AD' },
          { label: 'Tests',         value: String(classTests.length), sub: 'conducted',           color: '#8069B0' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="paper-card p-3 text-center">
            <p className="text-xl font-black" style={{ color }}>{value}</p>
            <p className="text-[10px] font-bold text-ink-soft leading-tight mt-0.5">{label}</p>
            <p className="text-[9px] text-ink-soft mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Mastery Distribution ── */}
      <div className="paper-card px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} className="text-ink-soft" />
          <p className="text-xs font-black uppercase tracking-wide text-ink-soft">Mastery Distribution</p>
        </div>
        {students.length === 0 ? (
          <p className="text-xs text-ink-soft">No students yet.</p>
        ) : (
          <>
            {/* Stacked bar */}
            <div className="flex h-3 rounded-full overflow-hidden mb-3 gap-px">
              {proficient  > 0 && <div className="bg-emerald-500 transition-all" style={{ flex: proficient }} />}
              {developing  > 0 && <div className="bg-amber-400  transition-all" style={{ flex: developing }} />}
              {struggling  > 0 && <div className="bg-red-500    transition-all" style={{ flex: struggling }} />}
              {notAssessed > 0 && <div className="transition-all" style={{ flex: notAssessed, background: 'rgba(58,44,30,0.15)' }} />}
            </div>
            <div className="grid grid-cols-4 gap-1 text-center">
              {[
                { label: 'Proficient',  n: proficient,  color: 'text-emerald-600' },
                { label: 'Developing',  n: developing,  color: 'text-amber-600' },
                { label: 'At Risk',     n: struggling,  color: 'text-red-600' },
                { label: 'Not Tested',  n: notAssessed, color: 'text-ink-soft' },
              ].map(({ label, n, color }) => (
                <div key={label}>
                  <p className={clsx('text-sm font-black', color)}>{n}</p>
                  <p className="text-[9px] text-ink-soft font-medium">{label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Student Performance Table ── */}
      <div className="paper-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-black/5">
          <Users size={14} className="text-ink-soft" />
          <p className="text-xs font-black uppercase tracking-wide text-ink-soft">Student Performance</p>
        </div>
        {students.length === 0 ? (
          <p className="text-xs text-ink-soft px-5 py-4">No students added yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.02]">
                <th className="text-left px-5 py-2.5 text-[10px] font-black uppercase tracking-wide text-ink-soft">Student</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-ink-soft">Mastery</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-ink-soft">Attendance</th>
                <th className="text-right px-5 py-2.5 text-[10px] font-black uppercase tracking-wide text-ink-soft">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {studentStats.map(s => (
                <tr key={s.id} className="hover:bg-black/[0.02]/50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-black/[0.05] flex items-center justify-center text-[11px] font-black text-ink-soft shrink-0">
                        {s.name[0]}
                      </div>
                      <span className="font-semibold text-ink text-sm">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 min-w-[120px]">
                    <MiniBar value={s.avgMastery} color={s.avgMastery >= 0.75 ? '#059669' : s.avgMastery >= 0.5 ? '#d97706' : s.avgMastery > 0 ? '#dc2626' : '#e2e8f0'} />
                  </td>
                  <td className="px-3 py-3 min-w-[100px]">
                    <MiniBar value={s.attendanceRate} color={s.attendanceRate >= 0.75 ? '#5B87AD' : '#d97706'} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <StatusChip mastery={s.avgMastery} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Topic Coverage Table ── */}
      {syllabus.length > 0 && (
        <div className="paper-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-black/5">
            <BookOpen size={14} className="text-ink-soft" />
            <p className="text-xs font-black uppercase tracking-wide text-ink-soft">Topic Coverage</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.02]">
                <th className="text-left px-5 py-2.5 text-[10px] font-black uppercase tracking-wide text-ink-soft">Topic</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-ink-soft">Status</th>
                <th className="text-right px-5 py-2.5 text-[10px] font-black uppercase tracking-wide text-ink-soft">Test Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {topicCoverage.map((t, i) => (
                <tr key={i} className="hover:bg-black/[0.02]/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-ink">{t.topic}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={clsx(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold',
                      t.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                      t.status === 'Taught'    ? 'bg-[#DCEBF8] text-[#1E3A55]' :
                      'bg-black/[0.05] text-ink-soft'
                    )}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-ink-soft font-semibold">
                    {t.avgScore !== null ? pct(t.avgScore) : <span className="text-ink-faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Test Results Table ── */}
      {testSummary.length > 0 && (
        <div className="paper-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-black/5">
            <ClipboardList size={14} className="text-ink-soft" />
            <p className="text-xs font-black uppercase tracking-wide text-ink-soft">Test Results</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.02]">
                <th className="text-left px-5 py-2.5 text-[10px] font-black uppercase tracking-wide text-ink-soft">Test / Topic</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-ink-soft">Avg Score</th>
                <th className="text-center px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-ink-soft">Max</th>
                <th className="text-right px-5 py-2.5 text-[10px] font-black uppercase tracking-wide text-ink-soft">Class %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {testSummary.map((t, i) => {
                const pctVal = t.totalMarks > 0 ? t.avgScore / t.totalMarks : 0
                return (
                  <tr key={i} className="hover:bg-black/[0.02]/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-ink">{t.topic}</td>
                    <td className="px-3 py-3 text-center font-bold text-ink">{t.avgScore.toFixed(1)}</td>
                    <td className="px-3 py-3 text-center text-ink-soft">{t.totalMarks}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={clsx(
                        'font-black text-sm',
                        pctVal >= 0.75 ? 'text-emerald-600' : pctVal >= 0.5 ? 'text-amber-600' : 'text-red-600'
                      )}>{pct(pctVal)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── AI Insights (collapsible) ── */}
      <div className="paper-card overflow-hidden">
        <button
          onClick={() => {
            if (!insightsOpen && !pulse && !pulseLoading) fetchPulse()
            setInsightsOpen(o => !o)
          }}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-black/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} style={{ color: '#5B4A85' }} />
            <p className="text-xs font-black uppercase tracking-wide text-ink-soft">AI Insights</p>
            <span className="text-[10px] text-ink-soft font-medium normal-case">generated summary</span>
          </div>
          <div className="flex items-center gap-2">
            {!pulseLoading && (
              <button
                onClick={e => { e.stopPropagation(); fetchPulse(true) }}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-black/[0.05]"
              >
                <RefreshCw size={12} className="text-ink-soft" />
              </button>
            )}
            {insightsOpen ? <ChevronUp size={15} className="text-ink-soft" /> : <ChevronDown size={15} className="text-ink-soft" />}
          </div>
        </button>

        {insightsOpen && (
          <div className="border-t px-5 py-4 space-y-3" style={{ borderColor: 'rgba(58,44,30,0.1)' }}>
            {pulseLoading && (
              <div className="space-y-2">
                {[1,2,3,4].map(i => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-2.5 bg-black/[0.05] rounded-full animate-pulse w-24" />
                    <div className="h-3.5 bg-black/[0.05] rounded-full animate-pulse w-full" />
                    <div className="h-3.5 bg-black/[0.05] rounded-full animate-pulse w-4/5" />
                  </div>
                ))}
              </div>
            )}
            {!pulseLoading && pulseError && (
              <p className="text-sm text-red-500">{pulseError} <button onClick={() => fetchPulse(true)} className="underline font-semibold">Retry</button></p>
            )}
            {!pulseLoading && !pulseError && pulse && (
              <div className="space-y-3">
                {[
                  { label: 'Class Health',      key: 'health'   as const, color: 'text-emerald-600' },
                  { label: 'Concern Areas',     key: 'concerns' as const, color: 'text-amber-600' },
                  { label: 'Wins to Celebrate', key: 'wins'     as const, color: 'text-yellow-600' },
                  { label: "This Week's Focus", key: 'focus'    as const, color: 'text-[#1E3A55]' },
                ].map(({ label, key, color }) => (
                  <div key={key}>
                    <p className={clsx('text-[10px] font-black uppercase tracking-wide mb-1', color)}>{label}</p>
                    <p className="text-sm text-ink leading-relaxed">{pulse[key]}</p>
                  </div>
                ))}
              </div>
            )}
            {!pulseLoading && !pulseError && !pulse && (
              <p className="text-xs text-ink-soft">No insights generated yet.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Study Partners ── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#DCEBF8' }}>
            <Link2 size={15} style={{ color: '#1E3A55' }} />
          </div>
          <span className="font-bold text-ink">Study Partners</span>
        </div>
        <p className="text-sm text-ink-soft">
          Pairs a stronger student with a weaker one who shares interests.
        </p>
        <div>
          <label className="label">Topic context (optional)</label>
          <select value={selectedTopicId} onChange={e => setSelectedTopicId(e.target.value)} className="input-field">
            <option value="">General class performance</option>
            {syllabus.map(t => <option key={t.id} value={t.id}>{t.topic}</option>)}
          </select>
        </div>
        <button
          onClick={fetchPairs}
          disabled={pairsLoading || students.length < 2}
          className="paper-btn-primary w-full disabled:opacity-50"
        >
          {pairsLoading
            ? <><RefreshCw size={15} className="animate-spin" /> Generating Pairs…</>
            : <><Sparkles size={15} /> Generate Peer Pairs</>}
        </button>
        {students.length < 2 && (
          <p className="text-xs text-ink-soft text-center">Need at least 2 students to generate pairs.</p>
        )}
        {pairsError && <p className="text-sm text-red-600 text-center">{pairsError}</p>}
        {!pairsLoading && pairs.length > 0 && (
          <div className="space-y-2">
            {pairs.map((pair, i) => (
              <div key={i} className="paper-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center text-xs font-black text-emerald-700">
                      {pair.mentor[0]}
                    </div>
                    <div>
                      <p className="text-xs text-emerald-600 font-bold">Mentor</p>
                      <p className="text-sm font-semibold text-ink">{pair.mentor}</p>
                    </div>
                  </div>
                  <Link2 size={14} className="text-ink-faint shrink-0" />
                  <div className="flex-1 flex items-center gap-2 justify-end">
                    <div className="text-right">
                      <p className="text-xs font-bold" style={{ color: '#1E3A55' }}>Mentee</p>
                      <p className="text-sm font-semibold text-ink">{pair.mentee}</p>
                    </div>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black" style={{ background: '#DCEBF8', color: '#1E3A55' }}>
                      {pair.mentee[0]}
                    </div>
                  </div>
                </div>
                {pair.sharedInterest && pair.sharedInterest !== 'different interests' && (
                  <p className="text-xs font-semibold mb-1.5" style={{ color: '#5B4A85' }}>Shared: {pair.sharedInterest}</p>
                )}
                <div className="bg-black/[0.02] rounded-xl px-3 py-2">
                  <p className="text-xs font-bold text-ink-soft mb-0.5">Activity</p>
                  <p className="text-sm text-ink">{pair.activity}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
