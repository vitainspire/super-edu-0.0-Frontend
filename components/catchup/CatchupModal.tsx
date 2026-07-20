'use client'
import { useState, useEffect } from 'react'
import { X, Loader2, Pencil, Trash2, Plus, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useApp } from '@/lib/context'
import { aiKey, getAiCache, setAiCache, TTL } from '@/lib/ai-cache'

interface Props {
  studentId: string
  studentName: string
  topic: string
  score?: number
  onClose: () => void
}

export default function CatchupModal({ studentId, studentName, topic, score, onClose }: Props) {
  const {
    teacher, classes, students, sessions, attendance,
    getStudentFingerprint, getStudentAttendanceRate,
    saveCatchupMaterial,
  } = useApp()

  const student   = students.find(s => s.id === studentId)
  const cls       = classes.find(c => c.id === student?.classId)
  const subject   = teacher?.subject ?? ''
  const grade     = cls?.grade ?? teacher?.grade ?? ''

  // Lesson snapshot from the session when this topic was taught
  const lessonSnapshot = student
    ? sessions
        .filter(s => s.classId === student.classId && s.topic.toLowerCase() === topic.toLowerCase())
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.lessonSnapshot
    : undefined

  // Step 1: student profile
  const fingerprint           = student ? getStudentFingerprint(student.id) : null
  const overallAttendanceRate = student ? getStudentAttendanceRate(student.id) : null

  // Step 2: rare vs chronic classification
  const absenteeType: 'rare' | 'chronic' =
    overallAttendanceRate != null && overallAttendanceRate < 0.75 ? 'chronic' : 'rare'

  // Topic-specific attendance: how many sessions of this topic existed, how many missed
  const topicSessions = student
    ? sessions.filter(s => s.classId === student.classId && s.topic.toLowerCase() === topic.toLowerCase())
    : []
  const topicSessionsTotal   = topicSessions.length
  const topicSessionsMissed  = topicSessions.filter(s =>
    attendance.some(a => a.sessionId === s.id && a.studentId === studentId && a.status === 'absent')
  ).length

  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)
  const [manual, setManual]     = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  // Editable fields
  const [explanation, setExplanation]   = useState('')
  const [questions, setQuestions]       = useState<string[]>(['', '', ''])
  const [activity, setActivity]         = useState('')
  const [focusNote, setFocusNote]       = useState('')

  const generate = async () => {
    setLoading(true)
    setError(false)
    try {
      const scoreBucket  = score == null ? 'none' : score < 50 ? 'low' : score < 75 ? 'medium' : 'high'
      const snapshotKey  = lessonSnapshot?.hook ? lessonSnapshot.hook.slice(0, 30).replace(/\s+/g, '_') : 'none'
      const topInterest  = student?.interests?.[0]?.slice(0, 15).replace(/\s+/g, '_') ?? 'none'
      const ck = aiKey('catchup', {
        topic: topic.toLowerCase().trim(), subject: subject.toLowerCase(),
        grade, scoreBucket, snapshotKey, absenteeType, topInterest,
      })
      const cached = getAiCache<{ explanation: string; practiceQuestions: string[]; activity: string; focusNote: string }>(ck)
      if (cached) {
        setExplanation(cached.explanation ?? '')
        setQuestions(cached.practiceQuestions ?? ['', '', ''])
        setActivity(cached.activity ?? '')
        setFocusNote(cached.focusNote ?? '')
        setLoading(false)
        return
      }
      const res = await fetch('/api/catchup-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName, topic, subject, grade, score, lessonSnapshot,
          studentInterests:      student?.interests ?? [],
          studentGoal:           student?.goal ?? '',
          learningStyle:         fingerprint?.learningStyle ?? null,
          overallAttendanceRate,
          topicSessionsTotal,
          topicSessionsMissed,
          absenteeType,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAiCache(ck, data, TTL.ONE_WEEK)
      setExplanation(data.explanation ?? '')
      setQuestions(data.practiceQuestions ?? ['', '', ''])
      setActivity(data.activity ?? '')
      setFocusNote(data.focusNote ?? '')
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { generate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async () => {
    setSaving(true)
    await saveCatchupMaterial({
      studentId, studentName, topic, subject, grade,
      explanation, practiceQuestions: questions,
      activity, focusNote, status: 'approved',
      reason: score !== undefined ? 'low-score' : 'absent',
    })
    setSaving(false)
    setSaved(true)
    setTimeout(onClose, 900)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: 'rgba(58,44,30,0.6)' }}>
      <div className="w-full md:max-w-lg bg-paper-soft md:rounded-3xl rounded-t-3xl max-h-[90vh] flex flex-col"
        style={{ border: '1.5px solid rgba(58,44,30,0.18)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b shrink-0" style={{ borderColor: 'rgba(58,44,30,0.08)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-sticker-violetDark uppercase tracking-wide">Catch-up Plan</p>
            <p className="font-black text-ink text-base leading-tight">{studentName}</p>
            <p className="text-xs text-ink-soft font-medium">{topic} · {subject} Grade {grade}</p>
            {/* Absentee classification + topic attendance */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                absenteeType === 'chronic'
                  ? 'bg-sticker-coral/25 text-sticker-coralDark'
                  : 'bg-sticker-green/25 text-sticker-greenDark'
              }`}>
                {absenteeType === 'chronic' ? 'Chronic absentee' : 'Rare absentee'}
              </span>
              {topicSessionsTotal > 0 && (
                <span className="text-[10px] font-semibold text-ink-soft">
                  Missed {topicSessionsMissed} of {topicSessionsTotal} session{topicSessionsTotal !== 1 ? 's' : ''} on this topic
                </span>
              )}
              {overallAttendanceRate != null && (
                <span className="text-[10px] font-semibold text-ink-soft">
                  {Math.round(overallAttendanceRate * 100)}% overall attendance
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-ink-soft active:bg-black/10 shrink-0 ml-3"
            style={{ background: 'rgba(58,44,30,0.08)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={28} className="text-sticker-violetDark animate-spin" />
              <p className="text-sm font-semibold text-ink-soft">Generating plan for {studentName}…</p>
            </div>
          )}

          {error && !manual && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-sticker-coral/20 flex items-center justify-center">
                <AlertTriangle size={24} className="text-sticker-coralDark" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-ink">AI generation failed</p>
                <p className="text-xs text-ink-soft mt-1">No internet or API issue.</p>
              </div>
              <div className="flex gap-3 w-full px-4">
                <button type="button" onClick={generate}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                  style={{ background: 'var(--ink)' }}>
                  Retry
                </button>
                <button type="button" onClick={() => { setError(false); setManual(true) }}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-ink-soft border-2 border-ink/15">
                  Write manually
                </button>
              </div>
            </div>
          )}

          {!loading && (!error || manual) && (
            <>
              {/* Focus note — teacher instruction */}
              <div className="bg-sticker-gold/15 border border-sticker-gold/40 rounded-2xl px-4 py-3">
                <p className="text-[10px] font-bold text-sticker-goldDark uppercase tracking-wide mb-1">Teacher Focus</p>
                <input
                  value={focusNote}
                  onChange={e => setFocusNote(e.target.value)}
                  className="w-full text-sm font-semibold text-ink bg-transparent focus:outline-none"
                />
              </div>

              {/* Explanation */}
              <div>
                <p className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-2">Explanation for student</p>
                <textarea
                  value={explanation}
                  onChange={e => setExplanation(e.target.value)}
                  rows={4}
                  className="w-full border-2 border-ink/15 rounded-2xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-ink resize-none leading-relaxed bg-white/60"
                />
              </div>

              {/* Practice questions */}
              <div>
                <p className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-2">Practice Questions</p>
                <div className="space-y-2">
                  {questions.map((q, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-6 h-6 rounded-lg bg-sticker-violet/25 text-sticker-violetDark text-xs font-black flex items-center justify-center shrink-0 mt-1">{i + 1}</span>
                      <input
                        value={q}
                        onChange={e => setQuestions(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                        className="flex-1 border-2 border-ink/15 rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-ink bg-white/60"
                      />
                      <button type="button" onClick={() => setQuestions(prev => prev.filter((_, j) => j !== i))}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-ink-faint active:text-red-500 shrink-0 mt-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <button type="button"
                    onClick={() => setQuestions(prev => [...prev, ''])}
                    className="flex items-center gap-1.5 text-xs font-bold text-sticker-violetDark mt-1 px-2 py-1">
                    <Plus size={13} /> Add question
                  </button>
                </div>
              </div>

              {/* Activity */}
              <div>
                <p className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-2">10-min Activity</p>
                <textarea
                  value={activity}
                  onChange={e => setActivity(e.target.value)}
                  rows={3}
                  className="w-full border-2 border-ink/15 rounded-2xl px-4 py-3 text-sm text-ink focus:outline-none focus:border-ink resize-none leading-relaxed bg-white/60"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (!error || manual) && (
          <div className="px-5 pb-6 pt-3 border-t shrink-0 flex gap-3" style={{ borderColor: 'rgba(58,44,30,0.08)' }}>
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-2xl border-2 border-ink/15 text-sm font-bold text-ink-soft active:bg-black/[0.03]">
              Discard
            </button>
            <button type="button" onClick={handleApprove} disabled={saving || saved}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-70 transition-all"
              style={{ background: 'var(--ink)' }}>
              {saved ? <><CheckCircle2 size={15} className="text-sticker-green" /> Saved!</> : saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Pencil size={15} /> Approve & Save</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
