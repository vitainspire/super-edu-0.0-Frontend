'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Mic, MoreVertical, Check, CheckCheck, Download } from 'lucide-react'
import { useApp } from '@/lib/context'
import { backendFetch } from '@/lib/backend'
import PrepMaterialModal from '@/components/timetable/PrepMaterialModal'
import PrepSheetView from '@/components/timetable/PrepSheetView'
import { computeHomeAlerts } from '@/lib/logic/home-alerts'
import { computePacing } from '@/lib/logic/pacing'
import { nextTopicFor } from '@/lib/logic/nextTopic'
import { fetchStudentDoubtsByClasses } from '@/lib/supabase-queries'
import {
  matchStudent, matchClass, matchTopic, resolveDateRef, formatDateLabel, toIsoDate, buildStudentProgressAnswer,
  buildClassAnalyticsAnswer, buildAttendanceAnswer, buildScheduleAnswer, buildAlertsAnswer, buildDoubtsAnswer,
  buildAnnouncementsAnswer, buildSyllabusStatusAnswer, buildLeaveStatusAnswer, type ParsedAsk,
} from '@/lib/logic/ask'
import { speechLangFor, speechInputSupported, listenOnce } from '@/lib/voice'
import type { SmartLesson, TimetableEntry } from '@/lib/types'

// A founder-facing PROTOTYPE, not a real WhatsApp integration — no Meta
// Business API, no phone numbers, nothing sent outside this app. It calls the
// exact same /api/ask-intent classifier + the exact same existing backend
// endpoints ARIA (components/home/AskAssistant.tsx) already calls, just
// wrapped in a WhatsApp-styled shell so the concept can be judged before any
// real WhatsApp integration cost is spent. Deliberately unlinked from every
// nav — reached only by visiting /whatsapp-demo directly.
//
// This version adds the PROACTIVE half of the concept: when a period's start
// time arrives (real clock, or the "Simulate next period" button for demo
// convenience), it pushes that period's prep material as a downloadable PDF,
// then asks for attendance by name — a real, new conversational pattern, not
// just a reskin of the existing reactive Q&A.
//
// Important honesty note, not just a comment: the proactive trigger here is
// simulated client-side (this page watches the clock against the real
// timetable). A real WhatsApp integration cannot work this way — a real
// push has to be fired by the BACKEND on a schedule, independent of whether
// any browser tab is even open. This is a convincing preview of the idea,
// not a preview of the real trigger mechanism.
//
// Duplicated (not extracted into a shared hook with AskAssistant.tsx) on
// purpose: this page is disposable — it goes away the moment a real WhatsApp
// webhook exists — so it isn't worth the risk of refactoring the working,
// production ARIA component just to share code with something temporary.

interface Turn {
  id: string
  from: 'me' | 'aria'
  text: string
  time: string
  pdfUrl?: string
  pdfName?: string
}

type PendingAction =
  | { kind: 'prep_material'; classId: string; subject: string; grade: string; topic?: string; label: string }
  | { kind: 'apply_leave'; startDate: string; endDate: string; reason: string; label: string }

// Set the moment a period-start attendance prompt goes out — the NEXT
// message the teacher sends is parsed as an attendance reply instead of
// being routed through the general classifier, since "Rahul and Priya" is
// meaningless without knowing it's an answer to "who's absent".
interface AwaitingAttendance {
  classId: string
  className: string
  date: string
}

function nowTime() {
  return new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export default function WhatsAppDemoPage() {
  const router = useRouter()
  const {
    teacher, isLoading: appLoading, classes, students, assignments, attendance, mastery,
    getStudentWarnings, timetableEntries, sessions, getClassSyllabus, getClassSubjects,
  } = useApp()

  useEffect(() => {
    if (!appLoading && !teacher) router.replace('/teacher/login')
  }, [appLoading, teacher, router])

  const [turns, setTurns] = useState<Turn[]>([{
    id: 'seed',
    from: 'aria',
    text: "Hi! I'm ARIA 👋 This is a preview of daily tasks over chat — try \"today's prep material for Grade 5B\", or tap \"Simulate next period\" below to see a period start on its own.",
    time: nowTime(),
  }])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [prepModal, setPrepModal] = useState<{ classId: string; subject: string; grade: string; topic?: string } | null>(null)
  const [listening, setListening] = useState(false)
  const stopListenRef = useRef<(() => void) | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Proactive period-start trigger (real clock + manual "simulate") ──────
  const firedRef = useRef<Set<string>>(new Set())
  const [awaiting, setAwaiting] = useState<AwaitingAttendance | null>(null)
  const [renderForPdf, setRenderForPdf] = useState<{
    lesson: SmartLesson; topic: string; subtopic?: string; resolve: (blob: Blob) => void
  } | null>(null)
  const pdfCaptureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, pending])

  const lang = speechLangFor(teacher?.languagePreference)
  function toggleListening() {
    if (listening) { stopListenRef.current?.(); setListening(false); return }
    const stop = listenOnce(lang, text => setInput(text), () => setListening(false))
    if (!stop) return
    stopListenRef.current = stop
    setListening(true)
  }

  const assignedIds = new Set([
    ...(assignments ?? []).map(a => a.classId),
    ...(classes ?? []).filter(c => c.teacherId === teacher?.id).map(c => c.id),
  ])
  const myClasses = classes.filter(c => assignedIds.has(c.id))
  const myClassIds = new Set(myClasses.map(c => c.id))
  const classNameFor = (classId: string) => classes.find(c => c.id === classId)?.name ?? 'Class'
  function getSubject(entry: TimetableEntry) {
    return entry.label && entry.label.trim() ? entry.label : classNameFor(entry.classId)
  }

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

  function addTurn(from: Turn['from'], text: string, extra?: Partial<Turn>) {
    setTurns(prev => [...prev, { id: `${Date.now()}-${from}-${Math.random()}`, from, text, time: nowTime(), ...extra }])
  }

  // ── PDF generation: capture the SAME PrepSheetView already used on-screen
  // elsewhere, off-screen, so the PDF matches the real, already-correct
  // lesson rendering instead of a second hand-written layout. ─────────────
  useEffect(() => {
    if (!renderForPdf) return
    let cancelled = false
    const t = setTimeout(async () => {
      const el = pdfCaptureRef.current
      if (!el) { renderForPdf.resolve(new Blob()); return }
      try {
        // The lesson's board-sketch images load from a remote URL — a flat
        // timeout isn't enough to guarantee they've actually finished by the
        // time html2canvas snapshots the DOM, which is exactly what produced
        // blank boxes instead of the real diagrams. Wait for every <img>
        // inside the capture area to genuinely finish (load or error) first.
        const imgs = Array.from(el.querySelectorAll('img'))
        await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })))
        if (cancelled) return
        const html2canvas = (await import('html2canvas')).default
        const { jsPDF } = await import('jspdf')
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', windowWidth: 600, useCORS: true })
        const imgData = canvas.toDataURL('image/jpeg', 0.92)
        const pdf = new jsPDF({ unit: 'px', format: [canvas.width, canvas.height] })
        pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height)
        renderForPdf.resolve(pdf.output('blob'))
      } catch (err) {
        console.error('[whatsapp-demo] pdf generation failed:', err)
        renderForPdf.resolve(new Blob())
      }
    }, 300) // give the off-screen PrepSheetView its first paint before even looking for <img> tags
    return () => { cancelled = true; clearTimeout(t) }
  }, [renderForPdf])

  function generatePdf(lesson: SmartLesson, topic: string, subtopic?: string): Promise<Blob> {
    return new Promise(resolve => setRenderForPdf({ lesson, topic, subtopic, resolve }))
  }

  // ── Fetch (or generate) the lesson for a period the same way
  // PrepMaterialModal does — shared stock first, live generation as
  // fallback — simplified here (no session-pinning) since this is a
  // once-per-simulated-period demo path, not the real teaching flow. ──────
  async function fetchLessonForPeriod(classId: string, subject: string, grade: string): Promise<{ lesson: SmartLesson; topic: string } | null> {
    const syllabus = getClassSyllabus(classId, subject)
    const planned = nextTopicFor(syllabus, null)
    const topic = planned && planned.reason !== 'all-done' ? planned.topic.topic : null
    if (!topic) return null
    try {
      const params = new URLSearchParams({ classId, subject, grade, topic })
      const sharedRes = await backendFetch(`/api/teacher/prep-materials/shared?${params}`)
      if (sharedRes.ok) {
        const { lesson } = await sharedRes.json() as { lesson: SmartLesson | null }
        if (lesson) return { lesson, topic }
      }
    } catch { /* fall through to live generation */ }
    try {
      const res = await backendFetch('/api/smart-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, topic, subject, grade, teacherId: teacher?.id ?? '' }),
      })
      if (!res.ok) return null
      const { lesson } = await res.json() as { lesson: SmartLesson }
      return { lesson, topic }
    } catch {
      return null
    }
  }

  // ── Two SEPARATE scheduled moments per period, not one bundled event:
  // prep material is due one period AHEAD (at the start of whichever real
  // class period immediately precedes it today), so the teacher has it
  // ready before the bell — attendance is due at the period's OWN start
  // time, since that's genuinely when the class begins. Bundling both into
  // one instant, as the first version did, is exactly what made everything
  // read as firing all at once.
  interface ScheduledEvent { id: string; kind: 'prep' | 'attendance'; entry: TimetableEntry; dueMin: number }

  function buildTodaysEvents(): ScheduledEvent[] {
    const dow = new Date().getDay()
    const todays = timetableEntries
      .filter(e => e.dayOfWeek === dow && myClassIds.has(e.classId) && e.label && e.label.trim())
      .sort((a, b) => a.periodNumber - b.periodNumber)
    const events: ScheduledEvent[] = []
    todays.forEach((entry, i) => {
      const prev = todays[i - 1]
      // No earlier real period today to "borrow" lead time from (the first
      // class of the day) — due immediately rather than not at all.
      const prepDueMin = prev ? toMinutes(prev.startTime) : -1
      events.push({ id: `${entry.id}-prep`, kind: 'prep', entry, dueMin: prepDueMin })
      events.push({ id: `${entry.id}-attendance`, kind: 'attendance', entry, dueMin: toMinutes(entry.startTime) })
    })
    return events.sort((a, b) => a.dueMin - b.dueMin)
  }

  async function triggerEvent(event: ScheduledEvent) {
    if (firedRef.current.has(event.id)) return
    firedRef.current.add(event.id)
    const { entry } = event
    const cls = classes.find(c => c.id === entry.classId)
    const subject = getSubject(entry)
    const className = cls?.name ?? 'this class'

    if (event.kind === 'prep') {
      addTurn('aria', `📚 Coming up: Period ${entry.periodNumber} — ${subject}, ${className}. Pulling the lesson…`)
      const grade = cls?.grade ?? teacher?.grade ?? ''
      const result = await fetchLessonForPeriod(entry.classId, subject, grade)
      if (!result) {
        addTurn('aria', "Couldn't get prep material for this period — open the app to generate it.")
        return
      }
      const blob = await generatePdf(result.lesson, result.topic)
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob)
        addTurn('aria', `📄 ${result.topic} — ${subject} (${className})`, {
          pdfUrl: url, pdfName: `${subject}-${result.topic}.pdf`.replace(/\s+/g, '-'),
        })
      } else {
        addTurn('aria', "Generated the lesson, but couldn't build the PDF — open the app to view it.")
      }
      return
    }

    addTurn('aria', `🕐 Period ${entry.periodNumber} starting — ${subject}, ${className}. Who's absent? Reply with names, or "all present".`)
    setAwaiting({ classId: entry.classId, className, date: todayIso() })
  }

  // Real clock: every 20s, fire at most the events genuinely due right now.
  // "Due" is bounded to the last 10 minutes — opening the chat well after
  // several periods have already started should NOT dump a backlog of
  // stale reminders; anything older is marked fired silently, with no
  // message. Deliberately client-side for this prototype — see the file
  // header note on why real WhatsApp can't work this way.
  useEffect(() => {
    function check() {
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
      for (const ev of buildTodaysEvents()) {
        if (firedRef.current.has(ev.id) || ev.dueMin > nowMin) continue
        if (nowMin - ev.dueMin <= 10) void triggerEvent(ev)
        else firedRef.current.add(ev.id) // too stale — skip quietly, don't spam a backlog
      }
    }
    const id = setInterval(check, 20000)
    check()
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetableEntries, myClassIds])

  // Demo-only: steps through ONE event at a time (prep, then attendance,
  // then the next period's prep, …) regardless of the real clock — waiting
  // through real class times isn't practical live, but it still advances
  // one real step per tap rather than bundling everything together.
  function simulateNextEvent() {
    const next = buildTodaysEvents().find(e => !firedRef.current.has(e.id))
    if (!next) { addTurn('aria', 'No more events to simulate for today.'); return }
    void triggerEvent(next)
  }

  // ── Attendance-by-names parsing ───────────────────────────────────────
  const ALL_PRESENT_PATTERNS = /^(all present|nobody('?s)? absent|no one('?s)? absent|none absent|everyone('s)? present)\.?$/i
  function parseAbsentees(text: string, classId: string): { absentIds: string[]; absentNames: string[]; unmatched: string[] } {
    const trimmed = text.trim()
    if (ALL_PRESENT_PATTERNS.test(trimmed)) return { absentIds: [], absentNames: [], unmatched: [] }
    const fragments = trimmed
      .replace(/\band\b/gi, ',')
      .split(/[,\n]/)
      .map(f => f.trim())
      .filter(Boolean)
    const absentIds: string[] = []
    const absentNames: string[] = []
    const unmatched: string[] = []
    const scope = new Set([classId])
    for (const frag of fragments) {
      const m = matchStudent(frag, students, scope)
      if (m.kind === 'found') { absentIds.push(m.item.id); absentNames.push(m.item.name) }
      else unmatched.push(frag)
    }
    return { absentIds, absentNames, unmatched }
  }

  async function handleAttendanceReply(text: string) {
    if (!awaiting) return
    const { classId, className, date } = awaiting
    setAwaiting(null)
    setSending(true)
    try {
      const { absentIds, absentNames, unmatched } = parseAbsentees(text, classId)
      const roster = students.filter(s => s.isActive && s.classId === classId)
      await Promise.all(roster.map(s => backendFetch('/api/teacher/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(), studentId: s.id, classId, date,
          status: absentIds.includes(s.id) ? 'absent' : 'present',
        }),
      })))
      const presentCount = roster.length - absentIds.length
      let msg = `✅ Attendance recorded for ${className} — ${presentCount} present, ${absentIds.length} absent${absentNames.length ? ` (${absentNames.join(', ')})` : ''}.`
      if (unmatched.length) msg += `\n\nCouldn't match: ${unmatched.join(', ')} — not marked either way, check in the app.`
      addTurn('aria', msg)
    } catch (err) {
      console.error('[whatsapp-demo] attendance save failed:', err)
      addTurn('aria', "Couldn't save attendance — try again from the app.")
    } finally {
      setSending(false)
    }
  }

  async function send() {
    const q = input.trim()
    if (!q || sending) return
    setInput('')
    addTurn('me', q)

    if (awaiting) {
      await handleAttendanceReply(q)
      return
    }

    setSending(true)
    setPending(null)

    try {
      const historyPairs: { question: string; answer: string }[] = []
      for (let i = 0; i < turns.length - 1; i++) {
        if (turns[i].from === 'me' && turns[i + 1]?.from === 'aria') {
          historyPairs.push({ question: turns[i].text, answer: turns[i + 1].text })
        }
      }
      const res = await backendFetch('/api/ask-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: historyPairs.slice(-3) }),
      })
      const parsed = await res.json() as ParsedAsk

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
      const origin = typeof window !== 'undefined' ? window.location.origin : ''

      let result: string | null = null
      switch (parsed.intent) {
        case 'student_progress':
          result = student
            ? `${buildStudentProgressAnswer(student, parsed.subjectRef, { attendance, mastery, getStudentWarnings })}\n\nFull profile: ${origin}/students/${student.id}`
            : (studentIssue ?? 'Which student did you mean?')
          break
        case 'class_analytics':
          result = cls
            ? `${buildClassAnalyticsAnswer(cls, { students, attendance, mastery, getStudentWarnings })}\n\nFull analytics: ${origin}/classes/${cls.id}/understanding`
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
          if (!cls) { result = classIssue ?? 'Which class is this for? Try mentioning the class, e.g. "for Grade 5B".'; break }
          const subject = parsed.subjectRef ?? getClassSubjects(cls.id)[0]
          if (!subject) { result = `I don't know which subject to use for ${cls.name} — try mentioning it.`; break }
          const topicEntry = parsed.topicRef ? matchTopic(parsed.topicRef, getClassSyllabus(cls.id, subject)) : null
          const topic = topicEntry?.topic ?? parsed.topicRef ?? undefined
          const prepLabel = `Get prep material${topic ? ` for ${topic}` : ''} — ${cls.grade} ${cls.section}`
          setPending({ kind: 'prep_material', classId: cls.id, subject, grade: cls.grade, topic, label: prepLabel })
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
          if (!cls) { result = classIssue ?? 'Which class do you mean? Try mentioning the class, e.g. "for Grade 5B".'; break }
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
          break
        }
        default:
          result = "I didn't quite understand that — try asking about attendance, today's schedule, syllabus pacing, or today's prep material."
      }
      if (result) addTurn('aria', result)
    } catch (err) {
      console.error('[whatsapp-demo] failed:', err)
      addTurn('aria', 'Something went wrong answering that — try again.')
    } finally {
      setSending(false)
    }
  }

  function confirmPending() {
    if (!pending) return
    if (pending.kind === 'prep_material') {
      addTurn('aria', `${pending.label} — opening it now…`)
      setPrepModal({ classId: pending.classId, subject: pending.subject, grade: pending.grade, topic: pending.topic })
      setPending(null)
      return
    }
    setPending(null)
    setSending(true)
    backendFetch('/api/teacher/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: pending.startDate, endDate: pending.endDate, reason: pending.reason }),
    })
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`)
        addTurn('aria', 'Leave request submitted — pending admin approval.')
      })
      .catch(err => {
        console.error('[whatsapp-demo] leave request failed:', err)
        addTurn('aria', "Couldn't submit that leave request — try again from the app.")
      })
      .finally(() => setSending(false))
  }

  if (appLoading || !teacher) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#075E54' }} />
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#ECE5DD' }}>
      {/* Header — WhatsApp's own green, contact card look */}
      <div className="flex items-center gap-3 px-3 py-2.5 shrink-0" style={{ background: '#075E54' }}>
        <button onClick={() => router.push('/home')} className="text-white p-1 -ml-1">
          <ArrowLeft size={20} />
        </button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
          style={{ background: '#DCF8C6', color: '#075E54' }}>
          A
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[15px] font-bold leading-tight">ARIA</p>
          <p className="text-[11px] leading-tight" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {sending ? 'typing…' : 'online'}
          </p>
        </div>
        <MoreVertical size={18} className="text-white shrink-0" />
      </div>

      {/* A small, honest banner — this is a prototype, not real WhatsApp */}
      <div className="text-center text-[10.5px] font-semibold py-1.5" style={{ background: '#FFF3CD', color: '#856404' }}>
        PROTOTYPE — for internal preview only, not connected to real WhatsApp
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {turns.map(t => (
          <div key={t.id} className={`flex ${t.from === 'me' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[82%] rounded-lg px-2.5 py-1.5 shadow-sm"
              style={{ background: t.from === 'me' ? '#DCF8C6' : '#fff' }}
            >
              <p className="text-[13.5px] text-[#111] leading-snug whitespace-pre-wrap">{t.text}</p>
              {t.pdfUrl && (
                <a
                  href={t.pdfUrl}
                  download={t.pdfName ?? 'prep-material.pdf'}
                  className="mt-1.5 flex items-center gap-2 rounded-md px-2.5 py-2"
                  style={{ background: '#F0F0F0' }}
                >
                  <Download size={15} style={{ color: '#075E54' }} />
                  <span className="text-[12.5px] font-semibold" style={{ color: '#075E54' }}>Download PDF</span>
                </a>
              )}
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <span className="text-[10.5px]" style={{ color: '#667781' }}>{t.time}</span>
                {t.from === 'me' && <CheckCheck size={13} style={{ color: '#53BDEB' }} />}
              </div>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 shadow-sm bg-white">
              <p className="text-[13px] text-[#667781] italic">typing…</p>
            </div>
          </div>
        )}

        {pending && (
          <div className="flex justify-start">
            <div className="max-w-[82%] rounded-lg px-3 py-2.5 shadow-sm space-y-2" style={{ background: '#fff' }}>
              <p className="text-[13.5px] text-[#111] font-semibold">{pending.label} — go ahead?</p>
              <div className="flex gap-2 pt-1" style={{ borderTop: '1px solid #eee' }}>
                <button
                  onClick={confirmPending}
                  className="flex-1 py-1.5 rounded-md text-[13px] font-bold"
                  style={{ color: '#128C7E' }}
                >
                  <Check size={13} className="inline mr-1" />Confirm
                </button>
                <div className="w-px" style={{ background: '#eee' }} />
                <button
                  onClick={() => setPending(null)}
                  className="flex-1 py-1.5 rounded-md text-[13px] font-bold text-[#667781]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Demo-only control — real class times aren't practical to wait
          through live; the real clock-watcher above still runs on its own. */}
      <div className="px-3 pb-1.5">
        <button
          onClick={simulateNextEvent}
          className="w-full py-2 rounded-lg text-[12px] font-bold"
          style={{ background: '#fff', color: '#075E54', border: '1px dashed #075E54' }}
        >
          ▶ Simulate next update (demo only)
        </button>
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 px-2.5 py-2 shrink-0" style={{ background: '#ECE5DD' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder={listening ? 'Listening…' : awaiting ? 'Names of absent students…' : 'Message'}
          className="flex-1 h-10 px-4 rounded-full text-sm bg-white focus:outline-none"
        />
        {speechInputSupported && (
          <button
            onClick={toggleListening}
            className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center"
            style={{ background: listening ? '#B91C1C' : '#fff' }}
          >
            <Mic size={17} className={listening ? 'text-white' : 'text-[#667781]'} />
          </button>
        )}
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center disabled:opacity-50"
          style={{ background: '#075E54' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M3 20l18-8L3 4v6l12 2-12 2v6z" fill="white" />
          </svg>
        </button>
      </div>

      {/* Off-screen render used only to capture a PDF via html2canvas —
          never visible, positioned far outside the viewport rather than
          display:none so it still actually paints. */}
      {renderForPdf && (
        <div
          ref={pdfCaptureRef}
          style={{ position: 'fixed', top: -99999, left: 0, width: 600, background: '#fff', padding: 16 }}
        >
          <PrepSheetView lesson={renderForPdf.lesson} topic={renderForPdf.topic} subtopic={renderForPdf.subtopic} fromCache={false} />
        </div>
      )}

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
    </div>
  )
}
