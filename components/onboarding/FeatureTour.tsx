'use client'
import { useState, useEffect } from 'react'
import {
  X, ChevronLeft, ChevronRight,
  Sparkles, BookOpen, AlertTriangle,
  RefreshCw, Activity, FileText, Upload,
  CalendarDays, HelpCircle, type LucideIcon,
} from 'lucide-react'

interface TourCard {
  Icon: LucideIcon
  accentColor: string
  accentBg: string
  feature: string
  location: string
  description: string
  example: string
}

const CARDS: TourCard[] = [
  {
    Icon: Sparkles,
    accentColor: '#5B87AD',
    accentBg: '#DCEBF8',
    feature: 'Morning Briefing',
    location: 'Home screen — refreshes every morning',
    description:
      'Every morning, AI reads your class data and writes a personalised briefing — your next topic to teach, which students were absent last session, and how many students are currently at risk.',
    example:
      '"Rohan missed Fractions and scored 30% on the test — consider a catch-up plan before moving to the next topic."',
  },
  {
    Icon: BookOpen,
    accentColor: '#8069B0',
    accentBg: '#E9E1F6',
    feature: 'Prep Material',
    location: 'Timetable → tap any class period',
    description:
      'Tap a class on your Weekly Timetable to open Prep Material. Pick the topic and sub-topic for the day and AI generates a full lesson plan as a swipeable slideshow — hook, teaching steps, and a closing activity. It\'s saved automatically so you never have to regenerate the same prep twice, and the topic is recorded on your timetable for the day.',
    example:
      '"For Fractions: Divide a roti into 4 equal pieces — each piece is ¼. Common mistake: students think bigger denominator means bigger fraction."',
  },
  {
    Icon: AlertTriangle,
    accentColor: '#C46B54',
    accentBg: '#FBE3DC',
    feature: 'Catch-up Plans',
    location: 'Alerts page → tap any Critical or Watch student',
    description:
      'When a student was absent AND failed a test on that same topic, EduTeach flags them as Critical automatically. One tap generates a personalised catch-up plan — a simple explanation in their language, 4 progressively harder practice questions, and a 10-minute one-on-one activity.',
    example:
      '"Priya missed Photosynthesis and scored 25%. Catch-up: Draw a leaf and label the chloroplast, then answer 4 fill-in-the-blanks starting from easy."',
  },
  {
    Icon: RefreshCw,
    accentColor: '#BD6D8B',
    accentBg: '#FBE1EA',
    feature: 'Recovery Engine',
    location: 'Student Profile → Recovery tab',
    description:
      'For students who keep failing the same topic even after multiple attempts, the Recovery Engine generates a completely fresh explanation approach every time — never repeating the same method. You log whether each attempt helped, and the AI adapts accordingly.',
    example:
      'Attempt 1: visual diagram. Attempt 2: story format with a character. Attempt 3: real-life measuring activity with a ruler.',
  },
  {
    Icon: Activity,
    accentColor: '#5C8F52',
    accentBg: '#DFF0DA',
    feature: 'Class Pulse',
    location: 'Classes → tap a class → Pulse tab',
    description:
      "A full AI health report for your entire class: what's going well, what's a concern, which topic deserves the most focus right now, and which students to pair together for peer learning based on their strengths and shared interests.",
    example:
      '"5 students have mastered Fractions. Suggest pairing Arjun (strong, likes cricket) with Riya (struggling, also likes cricket) for a peer activity."',
  },
  {
    Icon: FileText,
    accentColor: '#AD8A2C',
    accentBg: '#F8ECC9',
    feature: 'AI Student Report',
    location: 'Student Profile → AI Report tab',
    description:
      "A full written report for any individual student — a 2-sentence overall summary, their strongest topics, areas that need growth, and a personalised recommendation that's linked to their interests and future goal.",
    example:
      '"Manas shows strong growth in word problems. Recommend story-based explanations tied to his interest in cricket to accelerate understanding."',
  },
  {
    Icon: Upload,
    accentColor: '#5B87AD',
    accentBg: '#DCEBF8',
    feature: 'Syllabus Import',
    location: 'Classes → tap a class → Syllabus → Import',
    description:
      'Paste your topic list as plain text or take a photo of your printed syllabus or textbook contents page. AI extracts all topics, assigns week numbers, and builds a structured teaching plan automatically — no manual entry needed.',
    example:
      "Upload a photo of your textbook's contents page → 40 topics extracted in seconds with week-by-week order and sub-topic breakdown.",
  },
  {
    Icon: CalendarDays,
    accentColor: '#AD8A2C',
    accentBg: '#F8ECC9',
    feature: 'Year Plan',
    location: 'Classes → tap a class → Syllabus → Year Plan',
    description:
      'Tell the AI how many teaching weeks you have and how many sessions per week. It distributes all your syllabus topics intelligently across the full academic year, with a reason for how much time each topic is given.',
    example:
      '"Fractions: 4 sessions — foundational topic, many students struggle here. Basic Addition: 2 sessions — quick revision, most students already know this."',
  },
  {
    Icon: HelpCircle,
    accentColor: '#8069B0',
    accentBg: '#E9E1F6',
    feature: 'AI Question Generator',
    location: 'Classes → tap a class → Marks → Create Test → Generate Questions',
    description:
      "When creating a test, tap Generate Questions. AI creates exam questions sorted by difficulty — easy, medium, and hard — based on the topic and your class's grade level. Review, edit, or remove any questions before saving the test.",
    example:
      'Grade 5 Fractions — Easy: "What is ½ of 10?", Medium: "Add ¼ + ¾", Hard: "Arrange ⅔, ¾, ⅗ in ascending order with working."',
  },
]

interface Props {
  teacherId: string
  open: boolean
  onClose: () => void
}

export default function FeatureTour({ teacherId, open, onClose }: Props) {
  const [current, setCurrent] = useState(0)
  const [animateIn, setAnimateIn] = useState(false)

  const tourKey = `eduteach_tour_seen_${teacherId}`

  useEffect(() => {
    if (open) {
      setCurrent(0)
      const rafId = requestAnimationFrame(() => setAnimateIn(true))
      return () => cancelAnimationFrame(rafId)
    } else {
      setAnimateIn(false)
    }
  }, [open])

  const markSeen = () => localStorage.setItem(tourKey, 'true')

  const handleClose = () => {
    markSeen()
    setAnimateIn(false)
    setTimeout(onClose, 280)
  }

  const handleNext = () => {
    if (current < CARDS.length - 1) {
      setCurrent(c => c + 1)
    } else {
      handleClose()
    }
  }

  const handlePrev = () => {
    if (current > 0) setCurrent(c => c - 1)
  }

  if (!open) return null

  const card = CARDS[current]
  const { Icon } = card
  const isLast = current === CARDS.length - 1

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
          className="px-5 pt-5 pb-4 flex items-center justify-between shrink-0"
          style={{ background: 'var(--ink)' }}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-0.5">
              App Guide
            </p>
            <p className="text-white/70 text-xs font-semibold">
              {current + 1} of {CARDS.length} features
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full active:scale-90 transition-transform"
            style={{ background: 'rgba(255,255,255,0.12)' }}
            title="Close guide"
          >
            <X size={15} className="text-white/70" />
          </button>
        </div>

        {/* ── PROGRESS DOTS ──────────────────────── */}
        <div className="flex items-center gap-1 px-5 pt-3 pb-0 shrink-0">
          {CARDS.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === current ? '22px' : '6px',
                background: i === current ? card.accentColor : 'rgba(58,44,30,0.14)',
              }}
            />
          ))}
        </div>

        {/* ── CARD CONTENT ───────────────────────── */}
        <div className="px-5 pt-5 pb-2 overflow-y-auto flex-1">
          {/* Icon + feature name */}
          <div className="flex items-start gap-3.5 mb-4">
            <div
              className="w-13 h-13 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: card.accentBg, width: 52, height: 52 }}
            >
              <Icon size={26} style={{ color: card.accentColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-xl text-ink leading-tight">{card.feature}</h3>
              <p className="text-[11px] font-semibold mt-0.5 leading-snug" style={{ color: card.accentColor }}>
                {card.location}
              </p>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-ink-soft leading-relaxed mb-4">
            {card.description}
          </p>

          {/* Example box */}
          <div
            className="rounded-2xl p-4"
            style={{ background: card.accentBg }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{ color: card.accentColor }}
            >
              Example
            </p>
            <p className="text-xs text-ink-soft leading-relaxed italic">
              {card.example}
            </p>
          </div>
        </div>

        {/* ── NAVIGATION ─────────────────────────── */}
        <div className="px-5 pt-4 pb-8 flex items-center gap-3 shrink-0" style={{ borderTop: '1px solid rgba(58,44,30,0.1)' }}>
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
            {isLast ? "Got it, let's go!" : (
              <>Next <ChevronRight size={13} strokeWidth={3} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
