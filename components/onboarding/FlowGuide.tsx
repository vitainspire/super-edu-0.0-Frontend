'use client'
import { useState, useEffect } from 'react'
import {
  X, ChevronLeft, ChevronRight, ArrowDown,
  School, Users, BookOpen, CalendarDays, CalendarClock,
  Sunrise, Clock, NotebookPen, Hand, Zap, CheckCircle2,
  FileEdit, Calculator, Bot,
  AlertTriangle, ClipboardList, RefreshCw,
  BarChart3, UserRound, Trophy,
  type LucideIcon,
} from 'lucide-react'

interface FlowStep {
  Icon: LucideIcon
  title: string
  where: string       // exact path / button to tap
  detail: string
}

interface Phase {
  number: number
  phase: string
  tagline: string
  when: string
  accentColor: string
  accentBg: string
  borderColor: string
  steps: FlowStep[]
  leadsTo?: string
}

const PHASES: Phase[] = [
  {
    number: 1,
    phase: 'First-Time Setup',
    tagline: 'Do this once before your first class — takes about 10 minutes',
    when: 'Day 1 only',
    accentColor: '#5B87AD',
    accentBg: '#DCEBF8',
    borderColor: '#AACDEA',
    steps: [
      {
        Icon: School,
        title: 'Create your classes',
        where: 'Bottom nav → Classes → tap "New Class"',
        detail:
          'Add each class you teach — for example Grade 5 Section A, Grade 6 Section B. Give it a name, grade, and section. Everything in EduTeach — students, attendance, marks, syllabus — lives inside a class.',
      },
      {
        Icon: Users,
        title: 'Add students to each class',
        where: 'Classes → tap a class → Students tab → "Add Student"',
        detail:
          'Add each student with their name and roll number. You can add them one at a time or paste a list. After adding, tap the pencil icon on each student card to add their interests (cricket, music, cooking) and their goal — the AI uses these to personalise every lesson.',
      },
      {
        Icon: BookOpen,
        title: 'Upload your syllabus',
        where: 'Classes → tap a class → Syllabus tab → "Import Syllabus via AI"',
        detail:
          'Paste your topic list as text or photograph your printed syllabus. Tap "Extract Topics with AI" — it reads the topics, assigns week numbers, and builds a structured plan. Review the extracted list, then tap "Save Topics to Syllabus." This is what powers lesson suggestions and attendance-topic linking.',
      },
      {
        Icon: CalendarDays,
        title: 'Set up your weekly timetable',
        where: 'Bottom nav → Settings → "Weekly Timetable" section → "Add Period"',
        detail:
          'Enter each period: select Day (Mon–Sat), Period number, Class, Start time, and End time. Once saved, the Home screen will automatically show "Today\'s Schedule" every morning — and the current period will highlight with a "NOW — tap to take attendance" button.',
      },
      {
        Icon: CalendarClock,
        title: 'Set your academic year start date',
        where: 'Settings → "Academic Year" → "Year Start Date"',
        detail:
          'Enter the date your school year began. This lets EduTeach track pacing — it will tell you if you\'re "On track", "Ahead", or "Behind" on your syllabus, and calculate which week of the year you\'re in.',
      },
    ],
    leadsTo: 'Setup done. Now follow this loop every school day →',
  },
  {
    number: 2,
    phase: 'Every Teaching Day',
    tagline: 'Open the app before class — this is your daily classroom routine',
    when: 'Every school day',
    accentColor: '#5C8F52',
    accentBg: '#DFF0DA',
    borderColor: '#AAD6A0',
    steps: [
      {
        Icon: Sunrise,
        title: 'Check the Morning Briefing',
        where: 'Home screen → "Morning Briefing" section',
        detail:
          'Before you leave for school, open the app. The AI has already read your data and written a personal briefing — your next topic, which students were absent last session, and how many are currently at risk. It refreshes automatically every morning.',
      },
      {
        Icon: Clock,
        title: 'See today\'s schedule and go to class',
        where: 'Home screen → "Today\'s Schedule" card',
        detail:
          'The schedule card shows all your periods for today. When a period is happening right now, it highlights and shows "NOW — tap to take attendance." Tap it to go straight to that class\'s attendance page.',
      },
      {
        Icon: NotebookPen,
        title: 'Pick the topic and prep your lesson',
        where: 'Attendance page → topic input → tap "Prep for class"',
        detail:
          'The attendance page asks "What are you teaching today?" — type the topic or tap "Pick from syllabus" to select from your list (it auto-suggests the next incomplete topic). Before marking attendance, tap "Prep for class" to get an AI explanation, 3 Indian real-life examples, common student mistakes, and a 2-minute quick activity.',
      },
      {
        Icon: Hand,
        title: 'Mark attendance and save the session',
        where: 'Attendance page → mark P / A / L per student → "Save Session"',
        detail:
          'Tap "Mark All Present" if everyone is in, then tap individual students to toggle anyone to Absent or Late. Each student shows their name, roll number, and one interest. When done, tap "Save Session." The session is now linked to today\'s topic — so the app knows exactly which topic each absent student missed.',
      },
      {
        Icon: Zap,
        title: 'Read the Opening Hook to start your class',
        where: 'Attendance page → after saving → "Opening Hook" section',
        detail:
          'After saving, the page shows an AI-generated 60-second class opener — a question or fact built around your students\' interests (cricket scores, chai prices, etc.) that connects to today\'s topic. Read it aloud. Below it, "Where Will You Use This?" gives 3 real-life sentences to tell students why this topic matters.',
      },
      {
        Icon: CheckCircle2,
        title: 'Mark the topic done when finished',
        where: 'Attendance page (post-save) → "Mark as fully covered" button',
        detail:
          'After teaching, scroll down on the same page and tap "Mark \'[topic]\' as fully covered." This updates your syllabus progress. When all topics in a week are done, the app shows "Week N complete!" and offers a "Create Exam for Week N" shortcut.',
      },
    ],
    leadsTo: 'After tests are done, enter the marks to unlock tracking →',
  },
  {
    number: 3,
    phase: 'After Tests — Entering Marks',
    tagline: 'Record scores so the app can calculate mastery per student per topic',
    when: 'After any class test or exam',
    accentColor: '#8069B0',
    accentBg: '#E9E1F6',
    borderColor: '#C7B7E8',
    steps: [
      {
        Icon: FileEdit,
        title: 'Create a test',
        where: 'Classes → tap a class → Marks tab → "New Test"',
        detail:
          'Tap "New Test." Select the total marks (5, 10, 20, 25, 50, or 100). Then select the topic from your syllabus — it shows how many sessions were taught for each topic and whether it was actually covered. Choose Term Exam or Unit Exam, set the date, and tap "Save Test."',
      },
      {
        Icon: Calculator,
        title: 'Enter each student\'s score',
        where: 'Marks → tap a test → enter scores per student',
        detail:
          'After saving the test, the app shows your full student list with score input fields. Enter each student\'s marks. You can use the microphone for voice entry. Once saved, EduTeach automatically calculates mastery for each student on that topic — no spreadsheets needed.',
      },
      {
        Icon: Bot,
        title: 'Let AI generate exam questions (optional)',
        where: 'New Test form → topic selected → question panel appears automatically',
        detail:
          'When you select a syllabus topic while creating a test, the AI question panel opens. It generates questions sorted by difficulty — easy, medium, hard — with marks per question. Use them as a reference or as the actual question paper. You can edit or remove questions before printing.',
      },
    ],
    leadsTo: 'Marks entered — the app now flags at-risk students automatically →',
  },
  {
    number: 4,
    phase: 'Monitoring & Recovery',
    tagline: 'The app watches for struggling students so you don\'t have to hunt manually',
    when: 'Check a few times a week',
    accentColor: '#AD8A2C',
    accentBg: '#F8ECC9',
    borderColor: '#EAC968',
    steps: [
      {
        Icon: AlertTriangle,
        title: 'Check the Alerts page',
        where: 'Bottom nav → "Alerts" tab',
        detail:
          'EduTeach automatically flags students who were absent AND failed the test on that same topic. Critical = absent + scored below 50%. Watch = absent + borderline score or no test yet. The badge on the Alerts tab shows the live count — you always know when to check.',
      },
      {
        Icon: ClipboardList,
        title: 'Create and deliver a catch-up plan',
        where: 'Alerts → tap a student → "Create catch-up plan" button',
        detail:
          'Tap any critical or watch student and tap "Create catch-up plan." AI writes a personalised plan: a simple explanation in plain language, 4 progressively harder practice questions, and a 10-minute one-on-one activity. Once you give it to the student, tap "Mark as Given." When the student completes it, tap "Mark as Done."',
      },
      {
        Icon: RefreshCw,
        title: 'Use the Recovery Engine for persistent struggles',
        where: 'Alerts → "View Profile" → Recovery tab',
        detail:
          'If a student keeps failing the same topic even after the catch-up plan, open their profile and go to the Recovery tab. It shows all topics where mastery is below 50%. Tap to generate a completely new explanation approach — visual, story-based, or hands-on activity. Log whether it helped (Yes / Partially / No) and the AI tries a different method next time.',
      },
      {
        Icon: NotebookPen,
        title: 'Log your observations',
        where: 'Student Profile → Log tab → type or tap mic → "Save Note"',
        detail:
          'After any intervention — whether a one-on-one chat, a catch-up session, or a conversation with a parent — log a note in the student\'s Log tab. Tap the microphone to speak instead of type. Notes are dated and stored permanently so you have a full record of every action you took.',
      },
    ],
    leadsTo: 'At any time you can step back and see the full picture →',
  },
  {
    number: 5,
    phase: 'Review & Insights',
    tagline: 'Understand every student and class at a deeper level',
    when: 'Weekly or monthly',
    accentColor: '#5B87AD',
    accentBg: '#DCEBF8',
    borderColor: '#AACDEA',
    steps: [
      {
        Icon: BarChart3,
        title: 'Check the Class Pulse',
        where: 'Classes → tap a class → Pulse tab → "AI Class Pulse"',
        detail:
          'The Pulse page shows a quick count of Proficient / Developing / Struggling / Not tested students and class attendance %. Tap "AI Class Pulse" for a full report: Class Health, Concern Areas, Wins to Celebrate, and This Week\'s Focus. Tap "Generate Peer Pairs" and it suggests which stronger student to pair with which weaker student — matched by shared interests.',
      },
      {
        Icon: UserRound,
        title: 'Open a student\'s full profile',
        where: 'Alerts → "View Profile" OR Classes → Students → tap student card',
        detail:
          'Every student has 6 tabs. Overview: score chart, attendance chart, recent marks. Missed: every topic they were absent for. Fingerprint: their learning style, peak performance day, strong and weak topics. Recovery: personalised re-teaching for failing topics. Log: your intervention notes. AI Report: a full written summary with strengths, growth areas, and a recommendation linked to their interests.',
      },
      {
        Icon: Trophy,
        title: 'View the Year Summary',
        where: 'Home screen → "Year" button in the quick links row',
        detail:
          'The Year Summary shows all your classes with student count, topics done, and average attendance. Below, every student is ranked by mastery — the top three are highlighted — with trend arrows showing if they are improving, declining, or stable. Filter by class to compare within one group. Use this at parent meetings or term reviews.',
      },
    ],
  },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function FlowGuide({ open, onClose }: Props) {
  const [current, setCurrent] = useState(0)
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    if (open) {
      setCurrent(0)
      const rafId = requestAnimationFrame(() => setAnimateIn(true))
      return () => cancelAnimationFrame(rafId)
    } else {
      setAnimateIn(false)
    }
  }, [open])

  const handleClose = () => {
    setAnimateIn(false)
    setTimeout(onClose, 280)
  }

  const handleNext = () => {
    if (current < PHASES.length - 1) setCurrent(c => c + 1)
    else handleClose()
  }

  const handlePrev = () => {
    if (current > 0) setCurrent(c => c - 1)
  }

  if (!open) return null

  const phase = PHASES[current]
  const isLast = current === PHASES.length - 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{
        background: `rgba(58,44,30,${animateIn ? '0.6' : '0'})`,
        transition: 'background 0.28s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className="w-full md:max-w-md overflow-hidden"
        style={{
          background: 'var(--paper-soft)',
          borderRadius: '24px 24px 0 0',
          maxHeight: '92vh',
          transform: animateIn ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── HEADER ─────────────────────────────── */}
        <div
          className="px-5 pt-5 pb-4 shrink-0"
          style={{ background: 'var(--ink)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
                Flow Guide
              </p>
              <p className="text-white font-display font-bold text-base leading-tight">
                How EduTeach works
              </p>
              <p className="text-white/50 text-xs mt-0.5 font-medium">
                Phase {current + 1} of {PHASES.length}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-full active:scale-90 transition-transform mt-0.5"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            >
              <X size={15} className="text-white/70" />
            </button>
          </div>

          {/* Phase selector pills */}
          <div className="flex items-center gap-1.5 mt-4 flex-wrap">
            {PHASES.map((p, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 transition-all duration-200 text-[10px] font-bold"
                style={
                  i === current
                    ? { background: 'rgba(255,255,255,0.22)', color: 'white' }
                    : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: i === current ? 'white' : 'rgba(255,255,255,0.3)' }}
                />
                Phase {p.number}
              </button>
            ))}
          </div>
        </div>

        {/* ── PHASE CONTENT ──────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 pt-5 pb-4">

            {/* Phase badge + when */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                style={{ background: phase.accentBg, color: phase.accentColor }}
              >
                Phase {phase.number}
              </span>
              <span className="text-[10px] font-semibold text-ink-faint uppercase tracking-wide">
                {phase.when}
              </span>
            </div>

            {/* Phase title + tagline */}
            <h3 className="font-display font-bold text-xl text-ink leading-tight">
              {phase.phase}
            </h3>
            <p className="text-sm text-ink-soft mt-1 mb-5 leading-relaxed">
              {phase.tagline}
            </p>

            {/* Steps */}
            <div className="space-y-3">
              {phase.steps.map((step, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl overflow-hidden"
                  style={{ border: `1.5px solid ${phase.borderColor}` }}
                >
                  {/* Step header */}
                  <div
                    className="flex items-center gap-2.5 px-3.5 py-2.5"
                    style={{ background: phase.accentBg }}
                  >
                    <step.Icon size={17} style={{ color: phase.accentColor }} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: phase.accentColor, color: 'white' }}
                        >
                          {idx + 1}
                        </span>
                        <p className="text-sm font-bold text-ink leading-snug truncate">
                          {step.title}
                        </p>
                      </div>
                      {/* Exact path */}
                      <p
                        className="text-[10px] font-semibold mt-0.5 leading-snug"
                        style={{ color: phase.accentColor }}
                      >
                        {step.where}
                      </p>
                    </div>
                  </div>
                  {/* Step detail */}
                  <div className="px-3.5 py-3" style={{ background: 'var(--paper-soft)' }}>
                    <p className="text-xs text-ink-soft leading-relaxed">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Leads-to connector */}
            {phase.leadsTo && (
              <div className="flex items-center gap-2 mt-4 px-1">
                <ArrowDown size={14} className="text-ink-faint shrink-0" />
                <p className="text-xs text-ink-faint italic leading-relaxed">
                  {phase.leadsTo}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── NAVIGATION ─────────────────────────── */}
        <div className="px-5 pt-3 pb-8 flex items-center gap-3 shrink-0" style={{ borderTop: '1px solid rgba(58,44,30,0.1)' }}>
          <button
            onClick={handlePrev}
            disabled={current === 0}
            className="w-11 h-11 flex items-center justify-center rounded-2xl disabled:opacity-25 active:scale-90 transition-all"
            style={{ background: 'rgba(58,44,30,0.06)' }}
          >
            <ChevronLeft size={18} className="text-ink-soft" />
          </button>

          <button
            onClick={handleNext}
            className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-2xl font-bold text-sm text-white active:scale-95 transition-all"
            style={{ background: 'var(--ink)' }}
          >
            {isLast
              ? "I understand the flow!"
              : (<>Next phase <ChevronRight size={13} strokeWidth={3} /></>)
            }
          </button>
        </div>
      </div>
    </div>
  )
}
