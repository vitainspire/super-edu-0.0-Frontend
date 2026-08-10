'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircleQuestion, Mic, Volume2, VolumeX } from 'lucide-react'
import { useApp } from '@/lib/context'
import { backendFetch } from '@/lib/backend'
import Modal from '@/components/ui/Modal'
import PrepMaterialModal from '@/components/timetable/PrepMaterialModal'
import { computeHomeAlerts } from '@/lib/logic/home-alerts'
import { computePacing } from '@/lib/logic/pacing'
import { fetchStudentDoubtsByClasses } from '@/lib/supabase-queries'
import {
  matchStudent, matchClass, matchTopic, resolveDateRef, formatDateLabel, toIsoDate, buildStudentProgressAnswer,
  buildClassAnalyticsAnswer, buildAttendanceAnswer, buildScheduleAnswer, buildAlertsAnswer, buildDoubtsAnswer,
  buildAnnouncementsAnswer, buildSyllabusStatusAnswer, buildLeaveStatusAnswer, type ParsedAsk,
} from '@/lib/logic/ask'
import { speechLangFor, speechInputSupported, speechOutputSupported, listenOnce, speak, stopSpeaking } from '@/lib/voice'

// v1 (tier 1) scope was typed, read-only lookups only. This adds tier 2:
// routing generation/action requests into the EXISTING, unmodified pipelines —
// PrepMaterialModal exactly as the class page already opens it, /generate-worksheet
// + the existing /tests/worksheet viewer exactly as tests/page.tsx already drives
// them, and POST /api/teacher/leaves exactly as LeavesSection.tsx already calls
// it. Nothing about those flows changes; this file only calls into them the same
// way their own buttons already do. Unlike tier 1's free lookups, these cost a
// real LLM call or write a real row, so all three show what was understood and
// wait for a second tap rather than firing immediately.
interface Turn { question: string; answer: string }

type PendingAction =
  | { kind: 'prep_material'; classId: string; subject: string; grade: string; topic?: string; label: string }
  | { kind: 'generate_worksheet'; classId?: string; subject: string; grade: string; className?: string; topic: string; label: string }
  | { kind: 'apply_leave'; startDate: string; endDate: string; reason: string; label: string }

const QUICK_WORKSHEET_DIST = [
  { type: 'mcq', count: 5, marksEach: 1 },
  { type: 'short-answer', count: 1, marksEach: 3 },
  { type: 'long-answer', count: 1, marksEach: 2 },
]

export default function AskAssistant() {
  const router = useRouter()
  const {
    teacher, classes, students, assignments, attendance, mastery,
    getStudentWarnings, timetableEntries, sessions, getClassSyllabus, getClassSubjects,
  } = useApp()

  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<Turn[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [prepModal, setPrepModal] = useState<{ classId: string; subject: string; grade: string; topic?: string } | null>(null)

  // Voice, based on the teacher's own preference: the language it listens
  // for and speaks in comes from the same languagePreference field lesson
  // generation already uses. Voice OUTPUT specifically is a separate
  // on/off toggle, remembered across visits — a teacher standing in front
  // of a class may not want the app talking out loud, independent of
  // whichever language it would use if it did.
  const lang = speechLangFor(teacher?.languagePreference)
  const [listening, setListening] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null)
  const stopListenRef = useRef<(() => void) | null>(null)
  const [voiceOutputOn, setVoiceOutputOn] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('askVoiceOutput') === '1',
  )

  function toggleListening() {
    if (listening) {
      stopListenRef.current?.()
      setListening(false)
      return
    }
    setVoiceNotice(null)
    const stop = listenOnce(lang, text => setQuestion(text), error => {
      setListening(false)
      if (error === 'not-allowed') setVoiceNotice('Microphone access is blocked — allow it for this site in your browser settings and try again.')
      else if (error === 'no-speech') setVoiceNotice("Didn't catch that — try again.")
      else if (error === 'network') setVoiceNotice('Voice input needs an internet connection.')
      else if (error) setVoiceNotice('Voice input failed — try typing instead.')
    })
    if (!stop) { setVoiceNotice('Voice input is not supported in this browser — try Chrome or Edge.'); return }
    stopListenRef.current = stop
    setListening(true)
  }

  function toggleVoiceOutput() {
    setVoiceOutputOn(prev => {
      const next = !prev
      localStorage.setItem('askVoiceOutput', next ? '1' : '0')
      if (!next) stopSpeaking()
      return next
    })
  }

  function say(text: string) {
    if (voiceOutputOn) speak(text, lang)
  }

  const assignedIds = new Set([
    ...(assignments ?? []).map(a => a.classId),
    ...(classes ?? []).filter(c => c.teacherId === teacher?.id).map(c => c.id),
  ])
  const myClasses = classes.filter(c => assignedIds.has(c.id))
  const myClassIds = new Set(myClasses.map(c => c.id))
  const classNameFor = (classId: string) => classes.find(c => c.id === classId)?.name ?? 'Class'

  // Fetched once, on first need, not eagerly on mount — most questions never
  // touch the academic calendar, so there's no reason to fetch it just
  // because the Ask window opened.
  const academicYearStartRef = useRef<string | undefined | null>(null)
  async function getAcademicYearStart(): Promise<string | undefined> {
    if (academicYearStartRef.current !== null) return academicYearStartRef.current
    try {
      const res = await backendFetch('/api/teacher/academic-calendar')
      const data = res.ok ? await res.json() : { events: [] }
      const start = (data.events ?? []).find((e: { category: string; title: string }) =>
        e.category === 'term' && e.title === 'Academic Year')?.startDate as string | undefined
      academicYearStartRef.current = start ?? undefined
      return start
    } catch {
      academicYearStartRef.current = undefined
      return undefined
    }
  }

  async function ask() {
    const q = question.trim()
    if (!q || loading) return
    setLoading(true)
    setQuestion('')
    setPending(null)
    setVoiceNotice(null)
    try {
      const res = await backendFetch('/api/ask-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Last 3 turns of this same chat window — lets a follow-up like
        // "what about his attendance" resolve against what was just asked,
        // instead of every question being classified in total isolation.
        body: JSON.stringify({ question: q, history: history.slice(-3) }),
      })
      const parsed = await res.json() as ParsedAsk

      // Three real outcomes per reference, not two — "no match" and "more
      // than one equally likely match" need different messages. Silently
      // treating ambiguous as "not found" told a teacher "I couldn't find
      // Rakesh" even when two Rakeshes genuinely existed.
      const studentMatch = parsed.studentRef ? matchStudent(parsed.studentRef, students, myClassIds) : null
      const classMatch = parsed.classRef ? matchClass(parsed.classRef, myClasses) : null
      const student = studentMatch?.kind === 'found' ? studentMatch.item : null
      const cls = classMatch?.kind === 'found' ? classMatch.item : null
      const studentIssue = studentMatch?.kind === 'ambiguous'
        ? `I found more than one student matching "${parsed.studentRef}": ${studentMatch.candidates.map(s => s.name).join(', ')} — which one did you mean?`
        : studentMatch?.kind === 'none'
          ? `I couldn't find a student matching "${parsed.studentRef}" in your classes.`
          : null
      const classIssue = classMatch?.kind === 'ambiguous'
        ? `I found more than one class matching "${parsed.classRef}": ${classMatch.candidates.map(c => `${c.grade} ${c.section}`).join(', ')} — which one did you mean?`
        : classMatch?.kind === 'none'
          ? `I couldn't find a class matching "${parsed.classRef}".`
          : null

      const now = new Date()
      const resolvedDate = resolveDateRef(parsed.dateRef, now)

      let result: string | null = null
      switch (parsed.intent) {
        case 'student_progress':
          result = student
            ? buildStudentProgressAnswer(student, parsed.subjectRef, { attendance, mastery, getStudentWarnings })
            : (studentIssue ?? 'Which student did you mean?')
          break
        case 'class_analytics':
          result = cls
            ? buildClassAnalyticsAnswer(cls, { students, attendance, mastery, getStudentWarnings })
            : (classIssue ?? 'Which class did you mean?')
          break
        case 'attendance':
          result = studentIssue ?? classIssue ?? buildAttendanceAnswer(student, cls, attendance, students, resolvedDate, parsed.dateRef)
          break
        case 'schedule':
          result = buildScheduleAnswer(timetableEntries, now, classNameFor, resolvedDate, parsed.dateRef)
          break
        case 'alerts': {
          const alerts = computeHomeAlerts(myClasses, sessions, students, getStudentWarnings)
          result = buildAlertsAnswer(alerts)
          break
        }
        case 'prep_material': {
          if (!cls) { result = classIssue ?? "Which class is this for? Try mentioning the class, e.g. \"for Grade 5B\"."; break }
          const subject = parsed.subjectRef ?? getClassSubjects(cls.id)[0]
          if (!subject) { result = `I don't know which subject to use for ${cls.name} — try mentioning it.`; break }
          const topicEntry = parsed.topicRef ? matchTopic(parsed.topicRef, getClassSyllabus(cls.id, subject)) : null
          const topic = topicEntry?.topic ?? parsed.topicRef ?? undefined
          const prepLabel = `Get prep material${topic ? ` for ${topic}` : ''} — ${cls.grade} ${cls.section}`
          setPending({ kind: 'prep_material', classId: cls.id, subject, grade: cls.grade, topic, label: prepLabel })
          say(`${prepLabel} — go ahead?`)
          break
        }
        case 'generate_worksheet': {
          if (classMatch?.kind === 'ambiguous') { result = classIssue; break }
          if (!parsed.topicRef) { result = 'What topic should the worksheet be on?'; break }
          const subject = parsed.subjectRef ?? (cls ? getClassSubjects(cls.id)[0] : null) ?? teacher?.subject ?? 'General'
          const grade = cls?.grade ?? teacher?.grade ?? '5'
          const wsLabel = `Generate a worksheet on ${parsed.topicRef}${cls ? ` for ${cls.grade} ${cls.section}` : ''}`
          setPending({ kind: 'generate_worksheet', classId: cls?.id, className: cls?.name, subject, grade, topic: parsed.topicRef, label: wsLabel })
          say(`${wsLabel} — go ahead?`)
          break
        }
        case 'doubts': {
          if (classMatch?.kind === 'ambiguous') { result = classIssue; break }
          const classIds = cls ? [cls.id] : myClasses.map(c => c.id)
          const doubts = await fetchStudentDoubtsByClasses(classIds)
          result = buildDoubtsAnswer(doubts, cls)
          break
        }
        case 'announcements': {
          const annRes = await backendFetch('/api/teacher/announcements')
          const annData = annRes.ok ? await annRes.json() : { announcements: [] }
          result = buildAnnouncementsAnswer(annData.announcements ?? [])
          break
        }
        case 'syllabus_status': {
          if (!cls) { result = classIssue ?? "Which class do you mean? Try mentioning the class, e.g. \"for Grade 5B\"."; break }
          const subject = parsed.subjectRef ?? getClassSubjects(cls.id)[0]
          if (!subject) { result = `I don't know which subject to use for ${cls.name} — try mentioning it.`; break }
          const yearStart = await getAcademicYearStart()
          const pacing = computePacing(yearStart, getClassSyllabus(cls.id, subject))
          result = buildSyllabusStatusAnswer(cls, pacing)
          break
        }
        case 'leave_status': {
          const [leavesRes, subsRes] = await Promise.all([
            backendFetch('/api/teacher/leaves'),
            backendFetch('/api/teacher/substitutes-today'),
          ])
          const leavesData = leavesRes.ok ? await leavesRes.json() : { leaves: [] }
          const subsData = subsRes.ok ? await subsRes.json() : { covering: [], coveredBy: [] }
          result = buildLeaveStatusAnswer(leavesData.leaves ?? [], subsData.covering ?? [], subsData.coveredBy ?? [])
          break
        }
        case 'apply_leave': {
          // This writes a real row an admin has to act on — unlike the
          // read-only intents, an unparsed date must NOT quietly fall back
          // to today. Guessing wrong here means a leave request for the
          // wrong day, not just a wrong sentence on screen.
          if (!parsed.dateRef) { result = 'Which day is this leave for?'; break }
          const start = resolveDateRef(parsed.dateRef, now)
          if (start.unparsed) { result = `I couldn't tell which day "${parsed.dateRef}" means — try naming the date more clearly, e.g. "12 August".`; break }
          const end = parsed.endDateRef ? resolveDateRef(parsed.endDateRef, now) : start
          if (parsed.endDateRef && end.unparsed) { result = `I couldn't tell which end date "${parsed.endDateRef}" means — try naming it more clearly.`; break }
          const startIso = toIsoDate(start.date)
          const endIso = toIsoDate(end.date)
          const dateLabel = startIso === endIso ? formatDateLabel(start.date) : `${formatDateLabel(start.date)} to ${formatDateLabel(end.date)}`
          const leaveLabel = `Apply for leave on ${dateLabel}`
          setPending({ kind: 'apply_leave', startDate: startIso, endDate: endIso, reason: parsed.leaveReason ?? 'other', label: leaveLabel })
          say(`${leaveLabel} — go ahead?`)
          break
        }
        default:
          result = "I didn't quite understand that — try asking about a student, a class, attendance, your schedule, what needs attention, doubts, announcements, syllabus pacing, leave status, applying for leave, or a lesson/worksheet to generate."
      }
      if (result) {
        setHistory(prev => [...prev, { question: q, answer: result! }])
        say(result)
      }
    } catch (err) {
      console.error('[AskAssistant] failed:', err)
      const msg = 'Something went wrong answering that — try again.'
      setHistory(prev => [...prev, { question: q, answer: msg }])
      say(msg)
    } finally {
      setLoading(false)
    }
  }

  function confirmPending() {
    if (!pending) return
    if (pending.kind === 'prep_material') {
      setHistory(prev => [...prev, { question: pending.label, answer: 'Opening it now…' }])
      setPrepModal({ classId: pending.classId, subject: pending.subject, grade: pending.grade, topic: pending.topic })
      setPending(null)
      return
    }
    if (pending.kind === 'apply_leave') {
      // Same endpoint, same body shape, same "pending until an admin
      // approves it" behaviour LeavesSection.tsx already relies on.
      setPending(null)
      setLoading(true)
      backendFetch('/api/teacher/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: pending.startDate, endDate: pending.endDate, reason: pending.reason }),
      })
        .then(res => {
          if (!res.ok) throw new Error(`Server returned ${res.status}`)
          const msg = 'Leave request submitted — pending admin approval.'
          setHistory(prev => [...prev, { question: pending.label, answer: msg }])
          say(msg)
        })
        .catch(err => {
          console.error('[AskAssistant] leave request failed:', err)
          const msg = "Couldn't submit that leave request — try again from your Profile."
          setHistory(prev => [...prev, { question: pending.label, answer: msg }])
          say(msg)
        })
        .finally(() => setLoading(false))
      return
    }
    // generate_worksheet — same call, same sessionStorage shape, same
    // destination page tests/page.tsx already uses. Fires and navigates away,
    // so the Ask window closes with it.
    setPending(null)
    setLoading(true)
    backendFetch('/api/generate-worksheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: pending.topic, subject: pending.subject, grade: pending.grade, distribution: QUICK_WORKSHEET_DIST }),
    })
      .then(async res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`)
        const data = await res.json()
        const sections = data.sections ?? []
        const seed: Record<string, string> = {}
        sections.forEach((sec: { type: string; questions: { answer?: string }[] }, si: number) => {
          if (sec.type === 'mcq') sec.questions.forEach((q, qi) => { if (q.answer) seed[`${si}-${qi}`] = q.answer })
        })
        sessionStorage.setItem('ws_draft', JSON.stringify({
          topic: pending.topic, subject: pending.subject, grade: pending.grade,
          className: pending.className, classId: pending.classId,
          totalMarks: data.totalMarks ?? 0, sections, initialAnswerKey: seed,
        }))
        setOpen(false)
        router.push('/tests/worksheet')
      })
      .catch(err => {
        console.error('[AskAssistant] worksheet generation failed:', err)
        const msg = "Couldn't generate that worksheet — try again from Tests."
        setHistory(prev => [...prev, { question: pending.label, answer: msg }])
        say(msg)
      })
      .finally(() => setLoading(false))
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="ARIA"
        className="w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-transform"
        style={{ background: 'rgba(255,255,255,0.6)', border: '1.75px solid var(--card-border)' }}
      >
        <MessageCircleQuestion size={17} className="text-ink-soft" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="ARIA">
        <div className="space-y-4">
          {speechOutputSupported && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={toggleVoiceOutput}
                title={voiceOutputOn ? 'Voice replies on — tap to mute' : 'Voice replies off — tap to hear answers spoken'}
                className="flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-bold active:scale-95 transition-all"
                style={{
                  background: voiceOutputOn ? 'var(--forest-soft)' : 'rgba(58,44,30,0.06)',
                  color: voiceOutputOn ? 'var(--forest)' : 'var(--ink-soft)',
                }}
              >
                {voiceOutputOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
                {voiceOutputOn ? 'Voice on' : 'Voice off'}
              </button>
            </div>
          )}

          {history.length === 0 && !loading && !pending && (
            <p className="text-sm text-ink-soft">
              Ask about a student, class, attendance, your schedule, what needs attention, unanswered doubts, announcements, syllabus pacing, your leave status, applying for leave, or a lesson/worksheet to generate.
            </p>
          )}

          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {history.map((turn, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-sm font-bold text-ink">{turn.question}</p>
                <p className="text-[13px] text-ink-soft leading-snug">{turn.answer}</p>
              </div>
            ))}
            {loading && <p className="text-sm text-ink-faint italic">Thinking…</p>}
          </div>

          {pending && (
            <div className="p-3 rounded-2xl space-y-2.5" style={{ background: 'rgba(58,44,30,0.05)', border: '1.5px solid var(--card-border)' }}>
              <p className="text-[13px] font-semibold text-ink">{pending.label} — go ahead?</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={confirmPending}
                  className="h-8 px-3.5 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
                  style={{ background: 'var(--forest)' }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="h-8 px-3.5 rounded-xl text-xs font-bold text-ink-soft active:scale-95 transition-all bg-white"
                  style={{ border: '1.5px solid var(--card-border)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {voiceNotice && (
            <p className="text-[12px] font-semibold" style={{ color: '#B91C1C' }}>{voiceNotice}</p>
          )}

          <div className="flex items-center gap-2 sticky bottom-0 pt-1" style={{ background: 'var(--paper-bg)' }}>
            <input
              autoFocus
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') ask() }}
              placeholder={listening ? 'Listening…' : 'Type a question…'}
              className="flex-1 h-10 px-3.5 rounded-xl text-sm bg-white"
              style={{ border: '2px solid var(--card-border)' }}
            />
            {speechInputSupported && (
              <button
                type="button"
                onClick={toggleListening}
                title={listening ? 'Stop listening' : 'Ask by voice'}
                className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl active:scale-95 transition-all"
                style={{
                  background: listening ? '#B91C1C' : 'white',
                  border: listening ? 'none' : '2px solid var(--card-border)',
                }}
              >
                <Mic size={16} className={listening ? 'text-white animate-pulse' : 'text-ink-soft'} />
              </button>
            )}
            <button
              type="button"
              onClick={ask}
              disabled={loading || !question.trim()}
              className="h-10 px-4 shrink-0 rounded-xl text-xs font-bold text-white active:scale-95 transition-all disabled:opacity-50"
              style={{ background: 'var(--ink)' }}
            >
              {loading ? '…' : 'Ask'}
            </button>
          </div>
        </div>
      </Modal>

      {prepModal && (
        <PrepMaterialModal
          open
          onClose={() => setPrepModal(null)}
          classId={prepModal.classId}
          subject={prepModal.subject}
          grade={prepModal.grade}
          initialTopic={prepModal.topic}
          autoGenerate
        />
      )}
    </>
  )
}
