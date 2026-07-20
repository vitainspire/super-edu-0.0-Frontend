'use client'
import { useState, useEffect } from 'react'
import {
  Users, GraduationCap, Wifi, WifiOff,
  LogOut, Check, ClipboardList,
  Sparkles, TrendingUp, PlayCircle,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import CreateClassModal from '@/components/classes/CreateClassModal'
import DailyBriefing from '@/components/briefing/DailyBriefing'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import Modal from '@/components/ui/Modal'
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist'
import FeatureTour from '@/components/onboarding/FeatureTour'
import PageHeader from '@/components/theme/PageHeader'
import SubstituteBanner from '@/components/timetable/SubstituteBanner'
import AttendanceCircle from '@/components/home/AttendanceCircle'
import PrepMaterialModal from '@/components/timetable/PrepMaterialModal'
import PrepMaterialPreviewModal from '@/components/timetable/PrepMaterialPreviewModal'
import { Sticker, ClipboardCheckSticker, QuillBookSticker, BellSticker } from '@/components/theme/StickerIcon'
import { countStudentsNeedingAttention } from '@/lib/logic/home-alerts'
import clsx from 'clsx'

// Pastel palette for today's-schedule period chips — colored by subject so
// the card reads at a glance instead of as a uniform list.
const PERIOD_COLORS = [
  { bg: '#AACDEA', text: '#1E3A55' }, // blue
  { bg: '#AAD6A0', text: '#234A1D' }, // green
  { bg: '#F0A491', text: '#5C2416' }, // coral
  { bg: '#EAC968', text: '#4A3809' }, // gold
  { bg: '#C7B7E8', text: '#31215C' }, // violet
  { bg: '#F0AFC6', text: '#5C1F38' }, // pink
]
function colorForSubject(label: string) {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return PERIOD_COLORS[hash % PERIOD_COLORS.length]
}
function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function HomePage() {
  const { teacher, classes, students, assignments, syncStatus, logout,
          syllabusTopics, timetableEntries, getStudentWarnings } = useApp()

  const assignedIds = new Set([
    ...(assignments ?? []).map(a => a.classId),
    ...(classes ?? []).filter(c => c.teacherId === teacher?.id).map(c => c.id),
  ])
  const myClasses = classes.filter(cls => assignedIds.has(cls.id))
  const router = useRouter()

  // Today's schedule — deliberately just today, not the full week grid
  // (that's what the Timetable page is for).
  const todaysEntries = timetableEntries
    .filter(e => e.dayOfWeek === new Date().getDay())
    .sort((a, b) => a.periodNumber - b.periodNumber)
  const classNameFor = (classId: string) => classes.find(c => c.id === classId)?.name ?? 'Class'
  const gradeFor = (classId: string) => classes.find(c => c.id === classId)?.grade ?? ''
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes()

  // Tap a Today's Schedule row to reveal its Prep Material / Take Attendance
  // actions — accordion-style, only one row expanded at a time.
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [prepModal, setPrepModal] = useState<{ classId: string; subject: string; grade: string; mode: 'auto' | 'custom' } | null>(null)
  const [previewModal, setPreviewModal] = useState<{ classId: string; subject: string; grade: string } | null>(null)

  // Same per-student criteria the Alerts page itself uses, so this count
  // always matches what tapping "View" reveals.
  const attentionCount = countStudentsNeedingAttention(classes, students, getStudentWarnings)
  const [createOpen, setCreateOpen] = useState(false)
  const [greeting, setGreeting]     = useState('Good morning')
  const [dateStr, setDateStr]       = useState('')
  const [showTour, setShowTour]         = useState(false)
  const [showGuideBtn, setShowGuideBtn] = useState(false)
  const [hasAdmin, setHasAdmin]         = useState(false)
  const [briefingOpen, setBriefingOpen] = useState(false)

  // All 4 setup steps complete
  const allSetupDone =
    classes.length > 0 &&
    students.filter(s => s.isActive).length > 0 &&
    timetableEntries.length > 0 &&
    syllabusTopics.length > 0

  useEffect(() => {
    const now  = new Date()
    const hour = now.getHours()
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening')
    setDateStr(`${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`)
  }, [])

  // Read localStorage preferences once teacher is known
  useEffect(() => {
    if (!teacher) return
    const hiddenKey = `eduteach_show_guide_btn_${teacher.id}`
    setShowGuideBtn(localStorage.getItem(hiddenKey) !== 'false')
  }, [teacher])

  // Check if school has an admin (hides class-creation controls for teachers)
  useEffect(() => {
    if (!teacher?.schoolId) return
    fetch(`/api/school/has-admin?schoolId=${teacher.schoolId}`)
      .then(r => r.json())
      .then(d => setHasAdmin(!!d.hasAdmin))
      .catch(() => {})
  }, [teacher?.schoolId])

  // Auto-trigger tour the first time all 4 setup steps are done
  useEffect(() => {
    if (!teacher || !allSetupDone) return
    const tourSeen = localStorage.getItem(`eduteach_tour_seen_${teacher.id}`) === 'true'
    if (!tourSeen) {
      const t = setTimeout(() => setShowTour(true), 420)
      return () => clearTimeout(t)
    }
  }, [teacher, allSetupDone])

  const handleLogout = async () => { await logout(); router.replace('/teacher/login') }
  const totalStudents = students.filter(s => s.isActive && assignedIds.has(s.classId)).length

  return (
    <div className="paper-page pb-28">

      {/* ── HEADER ──────────────────────────────────────────── */}
      <PageHeader
        eyebrow={greeting}
        title={teacher?.name?.split(' ')[0] ?? 'Teacher'}
        subtitle={`${teacher?.schoolName ?? 'Your School'}${teacher?.subject ? ` · ${teacher.subject}` : ''}`}
        back={false}
        action={
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-full text-xs font-semibold text-ink-soft" style={{ background: 'rgba(58,44,30,0.06)' }}>
              {dateStr}
            </div>
            <div className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold',
              syncStatus === 'online'  ? 'text-emerald-700' :
              syncStatus === 'offline' ? 'text-red-600' : 'text-ink-soft'
            )} style={{ background: 'rgba(58,44,30,0.06)' }}>
              {syncStatus === 'online'  ? <Wifi size={11} /> :
               syncStatus === 'offline' ? <WifiOff size={11} /> :
               <div className="w-2.5 h-2.5 border border-ink-faint border-t-transparent rounded-full animate-spin" />}
              <span className="capitalize">{syncStatus}</span>
            </div>
            <button onClick={handleLogout}
              className="w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-transform"
              style={{ background: 'rgba(58,44,30,0.06)' }}>
              <LogOut size={15} className="text-ink-soft" />
            </button>
          </div>
        }
      />

      {/* ── TODAY'S SCHEDULE — a timeline, not a plain list ────────────── */}
      <div className="px-5 relative z-10 mb-3">
        <div className="paper-card p-6">
          {todaysEntries.length === 0 ? (
            <div className="text-center py-3">
              <Sticker tone="gold" size={64} radius={20} style={{ margin: '0 auto 14px' }}>
                <QuillBookSticker size={30} />
              </Sticker>
              <p className="font-display font-bold text-ink text-base">Nothing on the books today</p>
              <p className="text-xs text-ink-soft mt-1">Set up your timetable to see today&apos;s periods here</p>
              <button
                onClick={() => router.push('/timetable')}
                className="text-sm font-bold text-ink mt-3 hover:underline"
              >
                Set up timetable →
              </button>
            </div>
          ) : (
            <div>
              {/* Header — icon + live progress, not just a plain label */}
              <div className="flex items-center gap-3 mb-4">
                <Sticker tone="blue" size={44} radius={16}>
                  <ClipboardCheckSticker size={24} />
                </Sticker>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-ink text-base leading-tight">Today&apos;s Schedule</p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {todaysEntries.filter(e => nowMins >= timeToMins(e.endTime)).length} of {todaysEntries.length} period{todaysEntries.length === 1 ? '' : 's'} done
                  </p>
                </div>
              </div>

              {/* Timeline */}
              <div className="relative">
                <div className="absolute left-[19px] top-1 bottom-1 w-[2px]" style={{ background: 'rgba(58,44,30,0.12)' }} />
                <div className="space-y-3">
                  {todaysEntries.map((entry, idx) => {
                    const color  = colorForSubject(entry.label ?? classNameFor(entry.classId))
                    const startM = timeToMins(entry.startTime)
                    const endM   = timeToMins(entry.endTime)
                    const isNow  = nowMins >= startM && nowMins < endM
                    const isPast = nowMins >= endM

                    return (
                      <div
                        key={entry.id}
                        className="relative flex items-center gap-3 animate-fade-up"
                        style={{ animationDelay: `${idx * 60}ms` }}
                      >
                        <div className="relative z-10 shrink-0">
                          {isNow && (
                            <span
                              className="absolute inset-0 rounded-full"
                              style={{ background: color.text, animation: 'pulse-ring 1.6s ease-out infinite' }}
                            />
                          )}
                          <div
                            className="relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-black border-2"
                            style={{
                              background: isPast && !isNow ? '#fff' : color.bg,
                              borderColor: isNow ? color.text : isPast ? 'rgba(58,44,30,0.16)' : color.text,
                              color: color.text,
                            }}
                          >
                            {isPast && !isNow ? <Check size={15} /> : entry.periodNumber}
                          </div>
                        </div>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedEntryId(prev => prev === entry.id ? null : entry.id)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedEntryId(prev => prev === entry.id ? null : entry.id) } }}
                          className="flex-1 min-w-0 rounded-2xl px-3.5 py-2.5 transition-all text-left cursor-pointer"
                          style={{
                            background: isNow ? color.bg : 'rgba(58,44,30,0.035)',
                            border: isNow ? `1.5px solid ${color.text}` : '1.5px solid transparent',
                            opacity: isPast && !isNow ? 0.6 : 1,
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold truncate" style={{ color: isNow ? color.text : 'var(--ink)' }}>
                              {entry.label ?? 'Period'}
                            </p>
                            {isNow && (
                              <span
                                className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
                                style={{ background: color.text, color: 'white' }}
                              >
                                Now
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-semibold mt-0.5 truncate" style={{ color: isNow ? color.text : 'var(--ink-soft)', opacity: isNow ? 0.85 : 1 }}>
                            {entry.startTime}–{entry.endTime} · {classNameFor(entry.classId)}
                          </p>

                          {/* Revealed on tap — swaps to Classroom Mode's own actions once the period is live */}
                          {expandedEntryId === entry.id && (
                            <div className="flex gap-2 mt-2.5 animate-fade-up">
                              {isNow ? (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    setPreviewModal({ classId: entry.classId, subject: entry.label ?? classNameFor(entry.classId), grade: gradeFor(entry.classId) })
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all"
                                  style={{ background: 'rgba(255,255,255,0.7)', color: color.text }}
                                >
                                  <Sparkles size={12} /> Preview Prep Material
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    setPrepModal({ classId: entry.classId, subject: entry.label ?? classNameFor(entry.classId), grade: gradeFor(entry.classId), mode: 'custom' })
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all"
                                  style={{ background: 'rgba(255,255,255,0.7)', color: 'var(--ink)' }}
                                >
                                  <Sparkles size={12} /> Prep Material
                                </button>
                              )}
                              {isNow ? (
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); router.push(`/classroom-mode/${entry.classId}?endTime=${encodeURIComponent(entry.endTime)}`) }}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
                                  style={{ background: 'var(--ink)' }}
                                >
                                  <PlayCircle size={12} /> Enter Classroom Mode
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); router.push(`/classes/${entry.classId}/attendance`) }}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
                                  style={{ background: 'var(--ink)' }}
                                >
                                  <ClipboardList size={12} /> Take Attendance
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 relative z-10 mb-3 space-y-2">
        <SubstituteBanner />
      </div>

      <div className="px-5 relative z-10 flex items-center gap-2 flex-wrap mb-1">
        <span className="paper-pill flex items-center gap-1.5"><Users size={12} />{totalStudents} students</span>
        <span className="paper-pill flex items-center gap-1.5"><GraduationCap size={12} />{myClasses.length} classes</span>
        {teacher?.currentTerm && (
          <span className="paper-pill flex items-center gap-1.5"><TrendingUp size={12} />{teacher.currentTerm}</span>
        )}
      </div>

      {/* ── CONTENT ─────────────────────────────────────────── */}
      <div className="px-4 md:px-8 pt-3 space-y-4 pb-28 md:pb-12 relative z-10 max-w-4xl md:mx-auto">

        {teacher && (
          <OnboardingChecklist
            teacherId={teacher.id}
            teacher={teacher}
            classes={classes}
            students={students}
            syllabusTopics={syllabusTopics}
            timetableEntries={timetableEntries}
            onCreateClass={hasAdmin ? undefined : () => setCreateOpen(true)}
            hasAdmin={hasAdmin}
          />
        )}

        {/* ── STUDENTS NEEDING ATTENTION — bottom of the page, hidden when zero ── */}
        {attentionCount > 0 && (
          <button
            onClick={() => router.push('/alerts')}
            className="w-full paper-card p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
            style={{ background: '#fffbeb', border: '1.5px solid rgba(217,119,6,0.2)' }}
          >
            <Sticker tone="gold" size={40} radius={14}>
              <BellSticker size={20} />
            </Sticker>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-ink">{attentionCount} student{attentionCount === 1 ? '' : 's'} need attention</p>
              <p className="text-xs text-ink-soft">Absent or scored low on a recent topic</p>
            </div>
            <span className="text-xs font-bold shrink-0" style={{ color: '#b45309' }}>View →</span>
          </button>
        )}
      </div>

      <CreateClassModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <PrepMaterialModal
        open={!!prepModal}
        onClose={() => setPrepModal(null)}
        classId={prepModal?.classId ?? ''}
        subject={prepModal?.subject ?? ''}
        grade={prepModal?.grade ?? ''}
        autoGenerate={prepModal?.mode === 'auto'}
      />

      <PrepMaterialPreviewModal
        open={!!previewModal}
        onClose={() => setPreviewModal(null)}
        classId={previewModal?.classId ?? ''}
        subject={previewModal?.subject ?? ''}
        grade={previewModal?.grade ?? ''}
        onGenerateInstead={() => previewModal && setPrepModal({ ...previewModal, mode: 'auto' })}
      />

      {/* Floating attendance-status button — right above Morning Briefing */}
      {teacher && <AttendanceCircle />}

      {/* Floating Morning Briefing button */}
      {teacher && (
        <button
          onClick={() => setBriefingOpen(true)}
          className="fixed bottom-40 md:bottom-24 right-4 z-40 w-11 h-11 flex items-center justify-center rounded-full text-white active:scale-90 transition-transform"
          style={{ background: '#8069B0', border: '1.5px solid rgba(58,44,30,0.18)' }}
          title="Morning Briefing"
        >
          <Sparkles size={17} />
        </button>
      )}

      {/* Floating "?" guide button */}
      {showGuideBtn && teacher && (
        <button
          onClick={() => setShowTour(true)}
          className="fixed bottom-24 md:bottom-8 right-4 z-40 w-11 h-11 flex items-center justify-center rounded-full font-black text-white text-base active:scale-90 transition-transform"
          style={{ background: 'var(--ink)' }}
          title="Open App Guide"
        >
          ?
        </button>
      )}

      {/* Morning briefing modal */}
      <Modal open={briefingOpen} onClose={() => setBriefingOpen(false)} title="Morning Briefing">
        <ErrorBoundary label="daily briefing"><DailyBriefing /></ErrorBoundary>
      </Modal>

      {/* Feature tour modal */}
      {teacher && (
        <FeatureTour
          teacherId={teacher.id}
          open={showTour}
          onClose={() => setShowTour(false)}
        />
      )}
    </div>
  )
}
