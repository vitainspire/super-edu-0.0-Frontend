'use client'
import { useRef, useState } from 'react'
import { MessageCircleQuestion, Mic, Volume2, VolumeX } from 'lucide-react'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'
import Modal from '@/components/ui/Modal'
import { buildAnnouncementsAnswer } from '@/lib/logic/ask'
import {
  matchTeacher, matchPendingTeacher, groupPendingRanges, buildOverviewAnswer, buildTeachersAnswer,
  buildClassesAnswer, buildLeaveRequestsAnswer, buildSubstitutesAnswer, buildCalendarAnswer,
  buildExamScheduleAnswer, buildSyllabusStatusAnswer, buildTextbookStatusAnswer,
  type ParsedAdminAsk, type PendingLeaveRow,
} from '@/lib/logic/adminAsk'
import { speechLangFor, speechInputSupported, speechOutputSupported, listenOnce, speak, stopSpeaking } from '@/lib/voice'

// The admin-side harness — same pattern as the teacher portal's AskAssistant:
// a thin natural-language front door that calls the EXISTING, unmodified
// admin endpoints the dashboard/teachers/classes/substitutes/announcements
// pages already use, the same way their own buttons already do. Read-only
// intents answer instantly from a plain fetch; the two write actions
// (approve/reject leave, post an announcement) show exactly what was
// understood and wait for a second tap before calling the real endpoint —
// admin actions land on OTHER people (a reassigned substitute, every teacher
// who reads an announcement), so the confirm step names who's affected
// rather than just repeating the raw question back.
interface Turn { question: string; answer: string }

type PendingAction =
  | { kind: 'approve_leave' | 'reject_leave'; teacherId: string; teacherName: string; startDate: string; endDate: string; label: string }
  | { kind: 'post_announcement'; title: string; body: string; category: string; label: string }

export default function AdminAskAssistant() {
  const { admin } = useAdmin()
  const schoolId = admin?.schoolId

  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<Turn[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)

  // Voice — same lib/voice.ts module the teacher portal uses. Admin has no
  // languagePreference field of its own (that's a teacher-only setting), so
  // this defaults to Indian English rather than inventing a new preference.
  const lang = speechLangFor(null)
  const [listening, setListening] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null)
  const stopListenRef = useRef<(() => void) | null>(null)
  const [voiceOutputOn, setVoiceOutputOn] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('adminAskVoiceOutput') === '1',
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
      localStorage.setItem('adminAskVoiceOutput', next ? '1' : '0')
      if (!next) stopSpeaking()
      return next
    })
  }

  function say(text: string) {
    if (voiceOutputOn) speak(text, lang)
  }

  async function ask() {
    const q = question.trim()
    if (!q || loading || !schoolId) return
    setLoading(true)
    setQuestion('')
    setPending(null)
    setVoiceNotice(null)
    const base = `/api/admin/schools/${schoolId}`
    try {
      const res = await backendFetch(`${base}/ask-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Last 3 turns of this same chat window — same reasoning as the
        // teacher-side assistant: a stateless classifier can't resolve
        // "with sundays?" or "approve it" without seeing what was just said.
        body: JSON.stringify({ question: q, history: history.slice(-3) }),
      })
      const parsed = await res.json() as ParsedAdminAsk

      let result: string | null = null
      switch (parsed.intent) {
        case 'overview': {
          const r = await backendFetch(`${base}/overview`)
          result = r.ok ? buildOverviewAnswer(await r.json()) : "Couldn't load the school overview right now."
          break
        }
        case 'teachers': {
          const r = await backendFetch(`${base}/teachers`)
          const data = r.ok ? await r.json() : { teachers: [] }
          const teachers = data.teachers ?? []
          if (parsed.teacherRef) {
            const m = matchTeacher(parsed.teacherRef, teachers)
            result = m.kind === 'found' ? buildTeachersAnswer(teachers, m.item)
              : m.kind === 'ambiguous' ? `I found more than one teacher matching "${parsed.teacherRef}": ${m.candidates.map(t => t.name).join(', ')} — which one did you mean?`
              : `I couldn't find a teacher matching "${parsed.teacherRef}".`
          } else {
            result = buildTeachersAnswer(teachers, null)
          }
          break
        }
        case 'classes': {
          const r = await backendFetch(`${base}/classes`)
          const data = r.ok ? await r.json() : { classes: [] }
          result = buildClassesAnswer(data.classes ?? [])
          break
        }
        case 'leave_requests': {
          const r = await backendFetch(`${base}/leave-requests`)
          const data = r.ok ? await r.json() : { requests: [] }
          result = buildLeaveRequestsAnswer(data.requests ?? [])
          break
        }
        case 'substitutes': {
          const today = new Date().toISOString().split('T')[0]
          const r = await backendFetch(`${base}/substitutes?date=${today}`)
          const data = r.ok ? await r.json() : { availability: [], substitutions: [] }
          result = buildSubstitutesAnswer(data.availability ?? [], data.substitutions ?? [])
          break
        }
        case 'announcements': {
          const r = await backendFetch(`${base}/announcements`)
          const data = r.ok ? await r.json() : { announcements: [] }
          result = buildAnnouncementsAnswer(data.announcements ?? [])
          break
        }
        case 'calendar': {
          const r = await backendFetch(`${base}/academic-events`)
          const data = r.ok ? await r.json() : { events: [] }
          result = buildCalendarAnswer(data.events ?? [])
          break
        }
        case 'exam_schedule': {
          const r = await backendFetch(`${base}/academic-events`)
          const data = r.ok ? await r.json() : { events: [] }
          result = buildExamScheduleAnswer(data.events ?? [])
          break
        }
        case 'syllabus_status': {
          if (!parsed.gradeRef) { result = 'Which grade do you mean?'; break }
          if (!parsed.subjectRef) { result = 'Which subject do you mean?'; break }
          const r = await backendFetch(`${base}/grade-syllabus/status?grade=${encodeURIComponent(parsed.gradeRef)}&subject=${encodeURIComponent(parsed.subjectRef)}`)
          const data = r.ok ? await r.json() : { sections: [] }
          result = buildSyllabusStatusAnswer(parsed.gradeRef, parsed.subjectRef, data.sections ?? [])
          break
        }
        case 'textbook_status': {
          const r = await backendFetch(`${base}/textbooks`)
          // Distinguish "the request failed" from "genuinely no textbooks" —
          // silently treating a server error as an empty list would answer
          // "no textbooks ingested yet" when the real problem is the endpoint
          // itself is down, which is a materially different, worse answer.
          if (!r.ok) { result = "Couldn't check textbook status right now — try the Textbooks page directly."; break }
          const data = await r.json()
          result = buildTextbookStatusAnswer(data.books ?? [], parsed.gradeRef, parsed.subjectRef)
          break
        }
        case 'approve_leave':
        case 'reject_leave': {
          if (!parsed.teacherRef) { result = 'Which teacher do you mean?'; break }
          const r = await backendFetch(`${base}/leave-requests`)
          const data = r.ok ? await r.json() : { requests: [] }
          const rows: PendingLeaveRow[] = data.requests ?? []
          const m = matchPendingTeacher(parsed.teacherRef, rows)
          if (m.kind === 'none') { result = `${parsed.teacherRef} doesn't have a pending leave request.`; break }
          if (m.kind === 'ambiguous') { result = `More than one teacher matching "${parsed.teacherRef}" has a pending request: ${m.candidates.map(t => t.teacherName).join(', ')} — which one?`; break }
          const teacherRows = rows.filter(row => row.teacherId === m.item.teacherId)
          const ranges = groupPendingRanges(teacherRows)
          if (ranges.length > 1) {
            result = `${m.item.teacherName} has ${ranges.length} separate pending periods: ${ranges.map(rg => rg.startDate === rg.endDate ? rg.startDate : `${rg.startDate} to ${rg.endDate}`).join(', ')} — which one?`
            break
          }
          const range = ranges[0]
          const verb = parsed.intent === 'approve_leave' ? 'Approve' : 'Reject'
          const dateLabel = range.startDate === range.endDate ? range.startDate : `${range.startDate} to ${range.endDate}`
          const label = `${verb} ${m.item.teacherName}'s leave for ${dateLabel}`
          setPending({ kind: parsed.intent, teacherId: m.item.teacherId, teacherName: m.item.teacherName, startDate: range.startDate, endDate: range.endDate, label })
          say(`${label} — go ahead?`)
          break
        }
        case 'post_announcement': {
          if (!parsed.announcementTitle && !parsed.announcementBody) { result = 'What should the announcement say?'; break }
          const title = parsed.announcementTitle || parsed.announcementBody!.slice(0, 60)
          const bodyText = parsed.announcementBody || parsed.announcementTitle!
          const label = `Post announcement "${title}"`
          setPending({ kind: 'post_announcement', title, body: bodyText, category: parsed.announcementCategory || 'general', label })
          say(`${label} — go ahead?`)
          break
        }
        default:
          result = "I didn't quite understand that — try asking about the school overview, teachers, classes, leave requests, approving/rejecting a leave, substitutes today, announcements, posting an announcement, the calendar, exam schedule, syllabus status, or textbook status."
      }
      if (result) {
        setHistory(prev => [...prev, { question: q, answer: result! }])
        say(result)
      }
    } catch (err) {
      console.error('[AdminAskAssistant] failed:', err)
      const msg = 'Something went wrong answering that — try again.'
      setHistory(prev => [...prev, { question: q, answer: msg }])
      say(msg)
    } finally {
      setLoading(false)
    }
  }

  function confirmPending() {
    if (!pending || !schoolId) return
    const base = `/api/admin/schools/${schoolId}`
    setPending(null)
    setLoading(true)

    const request = pending.kind === 'post_announcement'
      ? backendFetch(`${base}/announcements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: pending.title, body: pending.body, category: pending.category }),
        })
      : backendFetch(`${base}/leave-requests/${pending.kind === 'approve_leave' ? 'approve' : 'reject'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacherId: pending.teacherId, startDate: pending.startDate, endDate: pending.endDate }),
        })

    request
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`)
        const msg = pending.kind === 'post_announcement' ? 'Announcement posted.'
          : pending.kind === 'approve_leave' ? `Approved — ${pending.teacherName} has been notified, and any needed substitute has been assigned.`
          : `Rejected — ${pending.teacherName} has been notified.`
        setHistory(prev => [...prev, { question: pending.label, answer: msg }])
        say(msg)
      })
      .catch(err => {
        console.error('[AdminAskAssistant] action failed:', err)
        const msg = "Couldn't complete that — try again from the relevant page."
        setHistory(prev => [...prev, { question: pending.label, answer: msg }])
        say(msg)
      })
      .finally(() => setLoading(false))
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Argus"
          className="fixed bottom-6 right-6 z-40 w-14 h-14 flex items-center justify-center rounded-full active:scale-90 transition-transform"
          style={{ background: 'var(--ink)', boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}
        >
          <MessageCircleQuestion size={24} className="text-white" />
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Argus">
        <div className="space-y-4">
          {speechOutputSupported && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={toggleVoiceOutput}
                className="flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-bold active:scale-95 transition-all"
                style={{
                  background: voiceOutputOn ? 'var(--forest)' : 'rgba(58,44,30,0.06)',
                  color: voiceOutputOn ? 'white' : 'var(--ink-soft)',
                }}
              >
                {voiceOutputOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
                Voice {voiceOutputOn ? 'on' : 'off'}
              </button>
            </div>
          )}

          {history.length === 0 && !loading && !pending && (
            <p className="text-sm text-ink-soft">
              Ask about the school overview, teachers, classes, leave requests, substitutes today, announcements, the calendar, exam schedule, syllabus status, textbook status, approving/rejecting a leave, or posting an announcement.
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
    </>
  )
}
