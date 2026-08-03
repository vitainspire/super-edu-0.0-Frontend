'use client'
import { useState, useEffect, useMemo } from 'react'
import {
  Wifi, WifiOff, LogOut, Check,
  Sparkles, Wand2, CalendarDays, PlayCircle,
} from '@/components/ui/icons'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import { resolveSchedule, timeToMins } from '@/lib/logic/schedule'
import CreateClassModal from '@/components/classes/CreateClassModal'
import DailyBriefing from '@/components/briefing/DailyBriefing'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import Modal from '@/components/ui/Modal'
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist'
import FeatureTour from '@/components/onboarding/FeatureTour'
import SubstituteBanner from '@/components/timetable/SubstituteBanner'
import AttendanceCircle from '@/components/home/AttendanceCircle'
import WeekStrip from '@/components/home/WeekStrip'
import NextDayPrep from '@/components/home/NextDayPrep'
import ClassStatChips from '@/components/home/ClassStatChips'
import PrepMaterialModal from '@/components/timetable/PrepMaterialModal'
import PrepMaterialPreviewModal from '@/components/timetable/PrepMaterialPreviewModal'
import ClassroomModeModal from '@/components/timetable/ClassroomModeModal'
import { countStudentsNeedingAttention } from '@/lib/logic/home-alerts'
import { classSnapshot } from '@/lib/logic/class-snapshot'
import { nextTopicFor, nextTopicLabel } from '@/lib/logic/nextTopic'
import { entriesOn, occurrencesFrom, projectPlan, addDays, atMidnight, sameDay, weekProgress } from '@/lib/logic/weekPlan'
// Shared with the week strip and the next-day card, so a subject keeps one colour.
import { accentForSubject } from '@/lib/subject-accent'
import type { TimetableEntry } from '@/lib/types'
import clsx from 'clsx'

const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function HomePage() {
  const { teacher, classes, students, assignments, syncStatus, logout,
          syllabusTopics, timetableEntries, attendance, mastery, getStudentWarnings,
          getClassSyllabus } = useApp()

  const assignedIds = new Set([
    ...(assignments ?? []).map(a => a.classId),
    ...(classes ?? []).filter(c => c.teacherId === teacher?.id).map(c => c.id),
  ])
  const myClasses = classes.filter(cls => assignedIds.has(cls.id))
  const router = useRouter()

  // The admin's published Academic Year, so "this week" means the same thing
  // here as on the syllabus tab and in the prep sheet.
  const [yearStart, setYearStart] = useState<string | undefined>(undefined)
  useEffect(() => {
    fetch('/api/teacher/academic-calendar')
      .then(r => r.json())
      .then(d => setYearStart(
        (d.events ?? []).find((e: { category: string; title: string }) =>
          e.category === 'term' && e.title === 'Academic Year')?.startDate,
      ))
      .catch(() => {})
  }, [])

  // Re-read the clock every minute. Without it the card is frozen at whatever
  // time the page was opened, so the "Now" badge goes stale and a schedule left
  // open through the last period never rolls forward to the next day.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const todaysEntries = timetableEntries
    .filter(e => e.dayOfWeek === now.getDay())
    .sort((a, b) => a.periodNumber - b.periodNumber)
  // What the card shows: today while it has anything left, otherwise the next
  // day that does. See resolveSchedule.
  const schedule = resolveSchedule(timetableEntries, now)

  // Which day the strip and the schedule below it are showing. Seeded from
  // resolveSchedule so the page still opens on today — or the next day with
  // periods — and only moves when the teacher picks a day.
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const defaultDay = useMemo(() => {
    if (!schedule) return atMidnight(now)
    return addDays(atMidnight(now), schedule.daysAhead)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.dayOfWeek, schedule?.daysAhead, now.toDateString()])
  const shownDay = selectedDay ?? defaultDay
  const shownEntries = entriesOn(timetableEntries, shownDay)
  /** Academic week of a date, for the overdue comparison. */
  const weekOf = (d: Date) => weekProgress([], d, yearStart).week
  const isShowingToday = sameDay(shownDay, now)
  // The plan is only projected forward from today, so a day in a past week has
  // no projection. It must not be read as "nothing left to teach".
  const isPastDay = shownDay.getTime() < atMidnight(now).getTime()

  // The plan dealt across every period from today on, so a future day gets the
  // topic that will actually be due by then rather than today's.
  const plannedBySlot = useMemo(() => {
    const byClassSubject = new Map<string, ReturnType<typeof projectPlan>>()
    for (const entry of timetableEntries) {
      const subject = entry.label ?? ''
      const key = `${entry.classId}|${subject}`
      if (byClassSubject.has(key)) continue
      const sameSubject = timetableEntries.filter(
        e => e.classId === entry.classId && (e.label ?? '') === subject)
      byClassSubject.set(key, projectPlan(
        getClassSyllabus(entry.classId, subject),
        occurrencesFrom(sameSubject, now, 60),
      ))
    }
    return byClassSubject
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetableEntries, syllabusTopics, now.toDateString()])
  /** The topic projected into one period on one date. Single lookup, so the
      schedule card and the next-day card can never name different topics. */
  const plannedFor = (entry: TimetableEntry, date: Date) =>
    plannedBySlot
      .get(`${entry.classId}|${entry.label ?? ''}`)
      ?.get(`${date.toDateString()}|${entry.id}`)
  const classNameFor = (classId: string) => classes.find(c => c.id === classId)?.name ?? 'Class'
  const gradeFor = (classId: string) => classes.find(c => c.id === classId)?.grade ?? ''
  const nowMins = now.getHours() * 60 + now.getMinutes()

  const [prepModal, setPrepModal] = useState<{ classId: string; subject: string; grade: string; mode: 'auto' | 'custom' } | null>(null)
  const [previewModal, setPreviewModal] = useState<{ classId: string; subject: string; grade: string; endTime: string } | null>(null)
  const [classroomModal, setClassroomModal] = useState<{ classId: string; subject: string; grade: string; endTime: string } | null>(null)

  const attentionCount = countStudentsNeedingAttention(classes, students, getStudentWarnings)
  const [createOpen, setCreateOpen] = useState(false)
  const [greeting, setGreeting]     = useState('Good morning')
  const [dateStr, setDateStr]       = useState('')
  const [showTour, setShowTour]         = useState(false)
  const [showGuideBtn, setShowGuideBtn] = useState(false)
  const [hasAdmin, setHasAdmin]         = useState(false)
  const [briefingOpen, setBriefingOpen] = useState(false)

  const allSetupDone =
    classes.length > 0 &&
    students.filter(s => s.isActive).length > 0 &&
    timetableEntries.length > 0 &&
    syllabusTopics.length > 0

  useEffect(() => {
    const now  = new Date()
    const hour = now.getHours()
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening')
    setDateStr(`${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()].slice(0, 3)}`)
  }, [])

  useEffect(() => {
    if (!teacher) return
    const hiddenKey = `eduteach_show_guide_btn_${teacher.id}`
    setShowGuideBtn(localStorage.getItem(hiddenKey) !== 'false')
  }, [teacher])

  useEffect(() => {
    if (!teacher?.schoolId) return
    fetch(`/api/school/has-admin?schoolId=${teacher.schoolId}`)
      .then(r => r.json())
      .then(d => setHasAdmin(!!d.hasAdmin))
      .catch(() => {})
  }, [teacher?.schoolId])

  useEffect(() => {
    if (!teacher || !allSetupDone) return
    const tourSeen = localStorage.getItem(`eduteach_tour_seen_${teacher.id}`) === 'true'
    if (!tourSeen) {
      const t = setTimeout(() => setShowTour(true), 420)
      return () => clearTimeout(t)
    }
  }, [teacher, allSetupDone])

  const handleLogout = async () => { await logout(); router.replace('/teacher/login') }

  // Real syllabus completion across my classes → Class Progress donut.
  const myTopics = syllabusTopics.filter(t => assignedIds.has(t.classId))
  const progressPct = myTopics.length ? Math.round(myTopics.filter(t => t.isCompleted).length / myTopics.length * 100) : 0
  const firstName = teacher?.name?.split(' ')[0] ?? 'Teacher'
  const periodsDone = todaysEntries.filter(e => nowMins >= timeToMins(e.endTime)).length

  return (
    <div className="paper-page pb-28">

      {/* ── HEADER ──────────────────────────────────────────── */}
      <header className="px-5 md:px-8 pt-6 md:pt-9 pb-1 w-full max-w-[1280px] mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display font-extrabold text-ink leading-[1.05]" style={{ fontSize: 'clamp(26px, 4.5vw, 38px)', letterSpacing: '-0.02em' }}>
              {greeting}, {firstName}!
            </h1>
            <p className="text-[13px] md:text-sm text-ink-soft font-medium mt-1.5 truncate">
              {teacher?.schoolName ?? 'Your School'}{teacher?.subject ? ` · ${teacher.subject}` : ''} · {dateStr}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={clsx(
              'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold',
              syncStatus === 'online' ? 'text-emerald-800' : syncStatus === 'offline' ? 'text-red-700' : 'text-ink-soft',
            )} style={{ background: 'rgba(255,255,255,0.6)', border: '1.75px solid var(--card-border)' }}>
              {syncStatus === 'online' ? <Wifi size={11} /> : syncStatus === 'offline' ? <WifiOff size={11} /> :
                <div className="w-2.5 h-2.5 border border-ink-faint border-t-transparent rounded-full animate-spin" />}
              <span className="capitalize">{syncStatus}</span>
            </span>
            <button onClick={handleLogout} title="Sign out"
              className="w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-transform"
              style={{ background: 'rgba(255,255,255,0.6)', border: '1.75px solid var(--card-border)' }}>
              <LogOut size={16} className="text-ink-soft" />
            </button>
          </div>
        </div>
      </header>

      {/* ── BODY: main column + desktop aside ───────────────── */}
      <div className="px-5 md:px-8 mt-4 w-full max-w-[1280px] mx-auto lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start">

        {/* MAIN */}
        <main className="min-w-0 space-y-5">
          {/* One week at a time, with the week's progress through the plan.
              Picking a day here drives the schedule below it — which is what
              makes any day other than today reachable on this page. */}
          <WeekStrip
            timetableEntries={timetableEntries}
            syllabusTopics={myTopics}
            selected={shownDay}
            onSelect={setSelectedDay}
            academicYearStart={yearStart}
          />

          <SubstituteBanner />

          {/* Schedule for whichever day the strip above has selected. */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-ink text-lg">
                {isShowingToday
                  ? "Today's Schedule"
                  : sameDay(shownDay, addDays(atMidnight(now), 1))
                    ? "Tomorrow's Schedule"
                    : `${DAYS[shownDay.getDay()]}'s Schedule`}
              </h2>
              {isShowingToday ? (
                <span className="text-xs font-semibold text-ink-soft">{periodsDone} of {todaysEntries.length} done</span>
              ) : (
                /* Name the date when it is not today, so a Friday heading in a
                   week's time is not mistaken for this Friday. */
                <span className="text-xs font-semibold text-ink-soft">
                  {MONTHS[shownDay.getMonth()].slice(0, 3)} {shownDay.getDate()}
                  {shownEntries.length === 0 ? ' · nothing scheduled' : ''}
                </span>
              )}
            </div>

            {timetableEntries.length === 0 ? (
              <div className="paper-card p-8 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: '#F7EFC4', border: '2px solid var(--card-border)' }}>
                  <CalendarDays size={24} className="text-ink" />
                </div>
                <p className="font-display font-bold text-ink">Nothing on the books yet</p>
                <p className="text-sm text-ink-soft mt-1">Once your timetable is published, your periods appear here</p>
                <button onClick={() => router.push('/timetable')} className="text-sm font-bold text-forest-soft mt-3 hover:underline">
                  Set up timetable →
                </button>
              </div>
            ) : shownEntries.length === 0 ? (
              <div className="paper-card p-8 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: '#F7EFC4', border: '2px solid var(--card-border)' }}>
                  <CalendarDays size={24} className="text-ink" />
                </div>
                <p className="font-display font-bold text-ink">No periods on this day</p>
                <p className="text-sm text-ink-soft mt-1">Pick another day above to see its lessons and topics</p>
              </div>
            ) : (
              <div className="space-y-3">
                {shownEntries.map((entry, idx) => {
                  const label   = entry.label ?? classNameFor(entry.classId)
                  const accent  = accentForSubject(label)
                  const startM  = timeToMins(entry.startTime)
                  const endM    = timeToMins(entry.endTime)
                  // Only meaningful against today's clock. A day other than
                  // today has periods that are neither running nor finished,
                  // whatever the time happens to be right now.
                  const isNow   = isShowingToday && nowMins >= startM && nowMins < endM
                  const isPast  = isShowingToday && nowMins >= endM && !isNow

                  return (
                    <div
                      key={entry.id}
                      className="paper-card overflow-hidden flex animate-fade-up"
                      style={{ animationDelay: `${idx * 50}ms`, borderLeft: `5px solid ${accent}`, opacity: isPast ? 0.62 : 1 }}
                    >
                      <div className="flex-1 min-w-0 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-display font-bold text-ink text-[15px] truncate">{label}</p>
                            {isNow && (
                              <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white shrink-0" style={{ background: accent }}>Now</span>
                            )}
                            {isPast && <Check size={15} className="text-ink-faint shrink-0" />}
                          </div>
                          <p className="text-[12.5px] font-medium text-ink-soft mt-0.5">
                            {entry.startTime}–{entry.endTime} · {classNameFor(entry.classId)}
                          </p>
                          {/* The topic due in THIS period, from the plan
                              projected across every period from today on. Using
                              "the next topic" here made every future day show
                              today's topic, since nothing has been taught in
                              between yet. */}
                          {(() => {
                            const planned = plannedFor(entry, shownDay)
                            if (!planned) {
                              // Past the end of the plan: say so rather than
                              // repeating the last topic forever. A day already
                              // gone has no projection at all — stay quiet there
                              // instead of claiming the syllabus is finished.
                              const syllabus = getClassSyllabus(entry.classId, label)
                              if (!syllabus.length || isPastDay) return null
                              return (
                                <p className="text-[12px] mt-1 font-bold text-ink-faint">
                                  Syllabus complete
                                </p>
                              )
                            }
                            const overdue =
                              planned.topic.weekNumber != null && weekOf(shownDay) != null &&
                              planned.topic.weekNumber < weekOf(shownDay)!
                            return (
                              <p className="text-[12px] mt-1 flex items-baseline gap-1.5 flex-wrap">
                                <span className="font-bold" style={{ color: accent }}>
                                  {planned.topic.topic}
                                </span>
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                                  style={overdue
                                    ? { background: 'rgba(196,107,84,0.14)', color: '#7A2E17' }
                                    : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
                                >
                                  {planned.sessions > 1
                                    ? `Session ${planned.session} of ${planned.sessions}`
                                    : planned.topic.weekNumber != null
                                      ? `Week ${planned.topic.weekNumber}${overdue ? ' · overdue' : ''}`
                                      : 'In the plan'}
                                </span>
                              </p>
                            )
                          })()}
                          <ClassStatChips
                            snapshot={classSnapshot(entry.classId, {
                              students, attendance, mastery, getStudentWarnings,
                            })}
                          />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isNow ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setPreviewModal({ classId: entry.classId, subject: label, grade: gradeFor(entry.classId), endTime: entry.endTime })}
                                className="flex items-center justify-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold text-ink bg-white active:scale-95 transition-all hover:bg-black/[0.03]"
                                style={{ border: '2px solid var(--card-border)' }}
                              >
                                <Sparkles size={13} /> Preview
                              </button>
                              <button
                                type="button"
                                onClick={() => setClassroomModal({ classId: entry.classId, subject: label, grade: gradeFor(entry.classId), endTime: entry.endTime })}
                                className="flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
                                style={{ background: 'var(--forest)' }}
                              >
                                <PlayCircle size={13} /> Classroom Mode
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setPrepModal({ classId: entry.classId, subject: label, grade: gradeFor(entry.classId), mode: 'auto' })}
                                className="flex items-center justify-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold text-ink bg-white active:scale-95 transition-all hover:bg-black/[0.03]"
                                style={{ border: '2px solid var(--card-border)' }}
                              >
                                <Sparkles size={13} /> Prep Material
                              </button>
                              <button
                                type="button"
                                onClick={() => setPrepModal({ classId: entry.classId, subject: label, grade: gradeFor(entry.classId), mode: 'custom' })}
                                title="Generate for a topic of your choice"
                                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-ink bg-white active:scale-90 transition-all hover:bg-black/[0.03]"
                                style={{ border: '2px solid var(--card-border)' }}
                              >
                                <Wand2 size={14} />
                              </button>
                              {/* No "Take Attendance" alongside Prep Material.
                                  Classroom Mode opens on an attendance step, so
                                  the teacher is asked for it on the way into the
                                  lesson anyway. It is still on the class page. */}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Prep happens the evening before, so the next teaching day gets its
              own card with its own topics — reachable without hunting for the
              day in the strip first. */}
          {timetableEntries.length > 0 && (
            <NextDayPrep
              timetableEntries={timetableEntries}
              /* Always looking forward: browsing back to a past week should not
                 offer to prep a day that has already happened. */
              after={isPastDay ? atMidnight(now) : shownDay}
              classNameFor={classNameFor}
              gradeFor={gradeFor}
              plannedFor={plannedFor}
              onOpenDay={setSelectedDay}
              onPrep={({ classId, subject, grade }) =>
                setPrepModal({ classId, subject, grade, mode: 'auto' })}
            />
          )}

          {/* The student and class counts that used to sit here are gone: both
              are restated by the schedule cards below, which give them per
              class where they can actually be acted on. The term is kept —
              it appears nowhere else on this page — and the row only renders
              when there is one. */}
          {teacher?.currentTerm && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="paper-pill">{teacher.currentTerm}</span>
            </div>
          )}

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

        </main>

        {/* DESKTOP ASIDE — reminders. The calendar used to sit here too; the
            week strip now leads the main column instead, where the day it
            selects is next to the schedule it changes. */}
        <aside className="hidden lg:block space-y-4 sticky top-6">
          <div className="paper-card p-5">
            <p className="font-display font-bold text-ink text-sm mb-3">Reminders</p>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5" style={{ borderLeft: '3px solid #3E7A57', paddingLeft: 10 }}>
                <div>
                  <p className="text-[13px] font-semibold text-ink leading-snug">{todaysEntries.length} period{todaysEntries.length === 1 ? '' : 's'} scheduled today</p>
                  <p className="text-[11px] text-ink-faint mt-0.5">{periodsDone} done so far</p>
                </div>
              </div>
              {attentionCount > 0 && (
                <div className="flex items-start gap-2.5" style={{ borderLeft: '3px solid #C46B54', paddingLeft: 10 }}>
                  <div>
                    <p className="text-[13px] font-semibold text-ink leading-snug">{attentionCount} student{attentionCount === 1 ? '' : 's'} need attention</p>
                    <p className="text-[11px] text-ink-faint mt-0.5">Absent or low recent scores</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2.5" style={{ borderLeft: '3px solid #5B87AD', paddingLeft: 10 }}>
                <div>
                  <p className="text-[13px] font-semibold text-ink leading-snug">Syllabus {progressPct}% complete</p>
                  <p className="text-[11px] text-ink-faint mt-0.5">Across {myClasses.length} class{myClasses.length === 1 ? '' : 'es'}</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
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
        endTime={previewModal?.endTime ?? ''}
        onGenerateInstead={() => previewModal && setPrepModal({ classId: previewModal.classId, subject: previewModal.subject, grade: previewModal.grade, mode: 'auto' })}
        onEnterClassroom={() => previewModal && setClassroomModal(previewModal)}
      />

      <ClassroomModeModal
        open={!!classroomModal}
        onClose={() => setClassroomModal(null)}
        classId={classroomModal?.classId ?? ''}
        subject={classroomModal?.subject ?? ''}
        grade={classroomModal?.grade ?? ''}
        endTime={classroomModal?.endTime ?? ''}
      />

      {teacher && <AttendanceCircle />}

      {teacher && (
        <button
          onClick={() => setBriefingOpen(true)}
          className="fixed bottom-40 md:bottom-24 right-4 z-40 w-11 h-11 flex items-center justify-center rounded-full text-white active:scale-90 transition-transform"
          style={{ background: 'var(--forest-soft)', border: '1.5px solid rgba(23,20,15,0.18)' }}
          title="Morning Briefing"
        >
          <Sparkles size={17} />
        </button>
      )}

      {showGuideBtn && teacher && (
        <button
          onClick={() => setShowTour(true)}
          className="fixed bottom-24 md:bottom-8 right-4 z-40 w-11 h-11 flex items-center justify-center rounded-full font-black text-white text-base active:scale-90 transition-transform"
          style={{ background: 'var(--forest)' }}
          title="Open App Guide"
        >
          ?
        </button>
      )}

      <Modal open={briefingOpen} onClose={() => setBriefingOpen(false)} title="Morning Briefing">
        <ErrorBoundary label="daily briefing"><DailyBriefing /></ErrorBoundary>
      </Modal>

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
