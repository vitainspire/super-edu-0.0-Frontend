'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  GraduationCap, LogOut, Loader2, Pencil, X, Check as CheckIcon,
  Star, Target, Flame, CalendarCheck, TrendingUp, Dumbbell, Trophy, Rocket, type LucideIcon,
  Home, ClipboardCheck, UserCircle, BookOpen, Bell, ChevronLeft, ChevronRight, ArrowLeft,
  Palette, Goal, CircleDot, Music, Drama, Hourglass,
  Clapperboard, ChefHat, Leaf, PawPrint, Gamepad2, Bot, Puzzle, AlertTriangle, Construction, UserCheck,
  BarChart3, CheckCircle2, Handshake, Send,
} from 'lucide-react'
import type {
  Student, TopicMastery, Mark, Attendance, CatchupMaterial,
  Class, Session, SyllabusTopic, TimetableEntry, TopicPoll, Test,
} from '@/lib/types'
import { QuizPanel } from '@/components/student/QuizPanel'
import { AdaptiveQuizPanel } from '@/components/student/AdaptiveQuizPanel'
import { FlashcardsPanel } from '@/components/student/FlashcardsPanel'
import { NotesPanel } from '@/components/student/NotesPanel'
import { TestsPanel } from '@/components/student/TestsPanel'
import type { LearnSubject } from '@/components/student/studentLearn'
import { SUBJECT_PALETTE } from '@/components/student/studentTheme'
import SpaceDoodleBackground from '@/components/student/SpaceDoodleBackground'
import PersonalityCorner from '@/components/student/PersonalityCorner'
import { AbacusSticker, FlaskSticker, GlobeScrollSticker, QuillBookSticker } from '@/components/theme/StickerIcon'
import {
  BookSticker, TrophySticker, MedalSticker, GradCapSticker, RocketSticker,
  StarSticker, FlameSticker, CalendarCheckSticker, TrendingUpSticker, DumbbellSticker,
} from '@/components/student/StudentStickers'
import ScoreChart from '@/components/charts/ScoreChart'
import AttendanceChart from '@/components/charts/AttendanceChart'
import { getMasteryLabel, getMasteryColor } from '@/lib/logic/mastery'

// ── Badge definitions ─────────────────────────────────────────────────────────

interface BadgeDef {
  id: string
  Icon: LucideIcon
  Sticker: (props: { size?: number; className?: string }) => React.ReactElement
  name: string
  description: string
  hint: string
  color: string
  bg: string
  border: string
}

const BADGE_DEFS: BadgeDef[] = [
  { id: 'perfect',      Icon: Star,          Sticker: StarSticker,          name: 'Perfect Score',    description: 'Scored 100% on a test',             hint: 'Score full marks on any test',              color: '#2F8FE0', bg: '#DCEBF8', border: '#BFDCF5' },
  { id: 'sharpshooter', Icon: Target,        Sticker: MedalSticker,         name: 'Sharpshooter',    description: 'Scored 90%+ on a test',             hint: 'Score 90% or above on any test',            color: '#1E62A8', bg: '#CDE3F7', border: '#9CC3EA' },
  { id: 'streak3',      Icon: Flame,         Sticker: FlameSticker,         name: 'Hat-Trick',       description: 'Attended 3 classes in a row',       hint: 'Attend 3 classes without missing one',      color: '#FF9F43', bg: '#FFE8D1', border: '#FFD09E' },
  { id: 'streak7',      Icon: Flame,         Sticker: FlameSticker,         name: 'Week Warrior',   description: 'Attended 7 classes in a row',       hint: 'Attend 7 classes in a row',                 color: '#D9720F', bg: '#FCDCC2', border: '#F5B37A' },
  { id: 'attendance',   Icon: CalendarCheck, Sticker: CalendarCheckSticker, name: 'Attendance Star', description: 'Over 90% overall attendance',      hint: 'Keep attendance above 90%',                 color: '#C98A0A', bg: '#FFF2CC', border: '#FFE18C' },
  { id: 'improving',    Icon: TrendingUp,    Sticker: TrendingUpSticker,    name: 'On the Rise',     description: 'Improved since last test',          hint: 'Score higher than your previous test',      color: '#2F8FE0', bg: '#DCEBF8', border: '#BFDCF5' },
  { id: 'noweakspot',   Icon: Dumbbell,      Sticker: DumbbellSticker,      name: 'All Rounder',     description: 'No weak topics — all 60%+',         hint: 'Get 60%+ mastery in all tested topics',     color: '#1E62A8', bg: '#CDE3F7', border: '#9CC3EA' },
  { id: 'topicmaster',  Icon: Trophy,        Sticker: TrophySticker,        name: 'Topic Master',    description: '80%+ mastery in a topic',           hint: 'Reach 80%+ mastery in any topic',           color: '#FF9F43', bg: '#FFE8D1', border: '#FFD09E' },
  { id: 'halfway',      Icon: GraduationCap, Sticker: GradCapSticker,       name: 'Halfway Hero',    description: 'Completed 50% of the syllabus',    hint: 'Complete at least half the syllabus',       color: '#D9720F', bg: '#FCDCC2', border: '#F5B37A' },
  { id: 'comeback',     Icon: Rocket,        Sticker: RocketSticker,        name: 'Comeback Kid',    description: 'Bounced back from a low score',    hint: 'Score above 60% after scoring below 50%',   color: '#C98A0A', bg: '#FFF2CC', border: '#FFE18C' },
]

function BadgeSticker({ badge, earned, size = 36 }: { badge: BadgeDef; earned: boolean; size?: number }) {
  const [hovered, setHovered] = useState(false)
  const Sticker = badge.Sticker
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', flexShrink: 0 }}
    >
      <div
        className="transition-transform duration-150 ease-out hover:scale-110"
        style={{
          width: size, height: size, borderRadius: Math.round(size * 0.28), position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default',
          background: earned ? '#D9720F' : '#F3ECD6',
        }}
      >
        <span style={{ display: 'flex', filter: earned ? undefined : 'grayscale(1) opacity(0.55)' }}>
          <Sticker size={Math.round(size * 0.68)} />
        </span>
      </div>

      {hovered && (
        <div style={{
          position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 10,
          background: '#1E2A44', borderRadius: 10, padding: '8px 12px', zIndex: 50,
          width: 'max-content', maxWidth: 180, pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '5px solid #1E2A44',
          }} />
          <p style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>
            {badge.name}{!earned && <span style={{ color: '#A6AEC2', fontWeight: 700 }}> · Locked</span>}
          </p>
          <p style={{ fontSize: 10.5, fontWeight: 500, color: '#D8E1EE', marginTop: 3, lineHeight: 1.4 }}>
            {earned ? badge.description : badge.hint}
          </p>
        </div>
      )}
    </div>
  )
}

function ProgressRing({ pct, size = 78 }: { pct: number; size?: number }) {
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = c * (1 - Math.min(100, Math.max(0, pct)) / 100)
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3ECD6" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#D9720F" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={dash} style={{ transition: 'stroke-dashoffset .5s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: Math.round(size * 0.24), fontWeight: 800, color: '#1E2A44', letterSpacing: '-.5px' }}>{pct}%</span>
      </div>
    </div>
  )
}

function StatTile({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 20, border: '2.5px solid #1E2A44', padding: '18px 14px', textAlign: 'center' }}>
      <p style={{ fontSize: 26, fontWeight: 800, color: color ?? '#1E2A44', letterSpacing: '-.4px' }}>{value}</p>
      <p style={{ fontSize: 11.5, fontWeight: 700, color: '#5B6B87', marginTop: 4 }}>{label}</p>
    </div>
  )
}

// ── Sidebar navigation (top-level sections only — Home is the only one wired up so far) ──

interface NavGroup { id: string; label: string; Icon: LucideIcon }

const NAV_GROUPS: NavGroup[] = [
  { id: 'home',      label: 'Home',       Icon: Home },
  { id: 'learn',     label: 'Learn',      Icon: GraduationCap },
  { id: 'tests',     label: 'Tests',      Icon: ClipboardCheck },
  { id: 'report',    label: 'Progress',   Icon: BarChart3 },
  { id: 'buddies',   label: 'Buddies',    Icon: Handshake },
  { id: 'profile',   label: 'Profile',    Icon: UserCircle },
]

function computeAllBadges(data: SubjectData): (BadgeDef & { earned: boolean })[] {
  const marks = data.recentMarks
  return BADGE_DEFS.map(def => {
    let earned = false
    switch (def.id) {
      case 'perfect':
        earned = marks.some(m => m.totalMarks > 0 && m.score === m.totalMarks)
        break
      case 'sharpshooter':
        earned = marks.some(m => m.totalMarks > 0 && m.score / m.totalMarks >= 0.9)
        break
      case 'streak3':
        earned = data.attendanceStreak >= 3
        break
      case 'streak7':
        earned = data.attendanceStreak >= 7
        break
      case 'attendance':
        earned = data.attendanceRate >= 0.9
        break
      case 'improving':
        if (marks.length >= 2 && marks[0].totalMarks > 0 && marks[1].totalMarks > 0)
          earned = (marks[0].score / marks[0].totalMarks) > (marks[1].score / marks[1].totalMarks)
        break
      case 'noweakspot':
        earned = data.weakTopics.length === 0 && marks.length > 0
        break
      case 'topicmaster':
        earned = data.strongTopics.some(t => t.mastery >= 0.8)
        break
      case 'halfway':
        earned = data.syllabusTopics.length > 0 &&
          data.syllabusTopics.filter(t => t.isCompleted).length / data.syllabusTopics.length >= 0.5
        break
      case 'comeback': {
        if (marks.length >= 2 && marks[0].totalMarks > 0 && marks[1].totalMarks > 0) {
          const prev = marks[1].score / marks[1].totalMarks
          const curr = marks[0].score / marks[0].totalMarks
          earned = prev < 0.5 && curr >= 0.6
        }
        break
      }
    }
    return { ...def, earned }
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubjectTab {
  key: string        // unique per subject — classId can repeat across subjects (Model A)
  classId: string
  studentId: string
  teacherId?: string
  label: string
  color: string
}

interface UpcomingTest {
  id: string
  topic: string
  conductedOn: string
  totalMarks: number
  subject: string
}

interface TaughtSession {
  id: string
  topic: string
  date: string
}

interface PeerMatch { studentId: string; name: string; reason: string }
interface PeerIncoming { id: string; fromStudentId: string; fromName: string; subject?: string; createdAt: string }
interface PeerOutgoing { id: string; toStudentId: string; toName: string; subject?: string; createdAt: string }
interface PeerActive { id: string; partnerStudentId: string; partnerName: string; subject?: string; activity?: string; createdAt: string; progressNote?: string }
interface PeerData { matches: PeerMatch[]; incoming: PeerIncoming[]; outgoing: PeerOutgoing[]; active: PeerActive[] }

interface TodaySubstitution {
  periodNumber: number
  subject?: string
  substituteTeacherName?: string
  status: 'assigned' | 'unresolved' | 'manual'
}

interface SubjectData {
  attendanceRate: number
  totalSessions: number
  presentCount: number
  attendanceStreak: number
  recentMarks: (Mark & { topic: string; totalMarks: number; conductedOn: string })[]
  scoreHistory: (Mark & { topic: string; totalMarks: number; conductedOn: string })[]
  weeklyAttendance: { weekKey: string; present: number; total: number }[]
  weakTopics: TopicMastery[]
  strongTopics: TopicMastery[]
  catchupPlans: CatchupMaterial[]
  syllabusTopics: SyllabusTopic[]
  timetable: TimetableEntry[]
  substitutions: TodaySubstitution[]
  polls: TopicPoll[]
  upcomingTests: UpcomingTest[]
  awaitingResults: UpcomingTest[]
  taughtTopics: TaughtSession[]
  catchupTopics: TaughtSession[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TAB_COLORS = ['#FF9F43', '#C98A0A', '#D9720F', '#2F8FE0', '#1E62A8']

const PRESET_INTERESTS: { label: string; Icon: LucideIcon }[] = [
  { label: 'Cricket',    Icon: Trophy },
  { label: 'Football',   Icon: Goal },
  { label: 'Basketball', Icon: CircleDot },
  { label: 'Badminton',  Icon: Target },
  { label: 'Music',      Icon: Music },
  { label: 'Drawing',    Icon: Palette },
  { label: 'Dance',      Icon: Drama },
  { label: 'Movies',     Icon: Clapperboard },
  { label: 'Cooking',    Icon: ChefHat },
  { label: 'Reading',    Icon: BookOpen },
  { label: 'Space',      Icon: Rocket },
  { label: 'Nature',     Icon: Leaf },
  { label: 'Animals',    Icon: PawPrint },
  { label: 'Gaming',     Icon: Gamepad2 },
  { label: 'Robots',     Icon: Bot },
  { label: 'Puzzles',    Icon: Puzzle },
]

// "Made of paper" card — warm off-white surface, flat (no glossy drop
// shadow), just a soft ink-tinted border for edge definition.
const CARD: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: 24,
  border: '2.5px solid #1E2A44',
  padding: '20px 22px',
  display: 'flex', flexDirection: 'column', gap: 12,
}

// Home-screen card — same paper surface as CARD
const HCARD: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: 22,
  padding: '20px 22px',
  textAlign: 'left', border: '2.5px solid #1E2A44', width: '100%',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function formatTestDate(dateStr: string): string {
  const d = daysUntil(dateStr)
  if (d === 0) return 'Today!'
  if (d === 1) return 'Tomorrow'
  if (d <= 7)  return `In ${d} days`
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function formatPastDate(dateStr: string): string {
  const d = daysUntil(dateStr)
  if (d === 0) return 'Today'
  if (d === -1) return 'Yesterday'
  if (d > -7) return `${-d} days ago`
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function subjectStickerIcon(label: string) {
  const l = label.toLowerCase()
  if (/science/.test(l)) return FlaskSticker
  if (/math/.test(l)) return AbacusSticker
  if (/evs|environment|social|geography|history/.test(l)) return GlobeScrollSticker
  return QuillBookSticker
}

function buildSubjectData(raw: {
  attendance: Attendance[]
  sessions: Session[]
  marks: (Mark & { topic: string; totalMarks: number; conductedOn: string })[]
  mastery: TopicMastery[]
  catchupMaterials: CatchupMaterial[]
  syllabusTopics: SyllabusTopic[]
  timetable: TimetableEntry[]
  substitutions: TodaySubstitution[]
  polls: TopicPoll[]
  tests: Test[]
}): SubjectData {
  // Attendance rate
  const bySession = new Map<string, Attendance>()
  raw.attendance.forEach(a => bySession.set(a.sessionId || a.id, a))
  const unique       = [...bySession.values()]
  const presentCount = unique.filter(a => a.status !== 'absent').length
  const attendanceRate = unique.length > 0 ? presentCount / unique.length : 1

  // Attendance streak — count consecutive present sessions from most recent
  const sortedSessions = [...raw.sessions].sort((a, b) => b.date.localeCompare(a.date))
  let attendanceStreak = 0
  for (const session of sortedSessions) {
    const record = raw.attendance.find(a => a.sessionId === session.id)
    if (record && record.status !== 'absent') attendanceStreak++
    else break
  }

  const recentMarks = [...raw.marks]
    .sort((a, b) => b.conductedOn.localeCompare(a.conductedOn)).slice(0, 4)

  // Full score history (not capped like recentMarks) — used by the Progress
  // Report's trend chart, oldest first so the line reads left-to-right in time.
  const scoreHistory = [...raw.marks].sort((a, b) => a.conductedOn.localeCompare(b.conductedOn))

  // Weekly attendance buckets (Monday-start weeks), keyed by the week's date so
  // multiple subjects sharing a class can be merged without double-counting.
  const weekMap = new Map<string, { present: number; total: number }>()
  for (const s of raw.sessions) {
    const att = raw.attendance.find(a => a.sessionId === s.id)
    if (!att) continue
    const d   = new Date(s.date + 'T00:00:00')
    const mon = new Date(d)
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const weekKey = mon.toISOString().split('T')[0]
    const rec = weekMap.get(weekKey) ?? { present: 0, total: 0 }
    rec.total += 1
    if (att.status !== 'absent') rec.present += 1
    weekMap.set(weekKey, rec)
  }
  const weeklyAttendance = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, v]) => ({ weekKey, present: v.present, total: v.total }))

  const sorted      = [...raw.mastery].sort((a, b) => a.mastery - b.mastery)
  const weakTopics  = sorted.filter(m => m.mastery < 0.6).slice(0, 4)
  const strongTopics = sorted.filter(m => m.mastery >= 0.75).slice(-3).reverse()

  const catchupPlans = raw.catchupMaterials
    .filter(c => c.status !== 'done')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // Upcoming tests — future tests the student hasn't been marked for. Kept
  // uncapped here; the Home screen's "Next Up" preview and the full Tests tab
  // apply their own caps (or lack thereof) independently downstream.
  const markedTestIds = new Set(raw.marks.map(m => m.testId))
  const today = new Date().toISOString().split('T')[0]
  const upcomingTests = raw.tests
    .filter(t => t.conductedOn >= today && !markedTestIds.has(t.id))
    .sort((a, b) => a.conductedOn.localeCompare(b.conductedOn)) as UpcomingTest[]

  // Tests that already happened but haven't been marked for this student yet —
  // without this bucket, a conducted-but-ungraded test falls into neither
  // "upcoming" (it's in the past) nor "previous scores" (no mark exists yet),
  // so it would be invisible to the student even though the teacher can see it.
  const awaitingResults = raw.tests
    .filter(t => t.conductedOn < today && !markedTestIds.has(t.id))
    .sort((a, b) => b.conductedOn.localeCompare(a.conductedOn)) as UpcomingTest[]

  // Topics taught in class, most recent first — this is what the teacher recorded
  // when marking attendance, so students can see what they covered/missed.
  const seenTopicDates = new Set<string>()
  const taughtTopics: TaughtSession[] = []
  for (const s of sortedSessions) {
    if (!s.topic || !s.topic.trim()) continue
    const key = `${s.topic}|${s.date}`
    if (seenTopicDates.has(key)) continue
    seenTopicDates.add(key)
    taughtTopics.push({ id: s.id, topic: s.topic, date: s.date })
    if (taughtTopics.length >= 8) break
  }

  // Catch-up: topics taught in a session this student was marked absent for —
  // surfaced in the Learn tab as "here's what you missed," regardless of how
  // long ago it was taught (unlike `taughtTopics`, which is capped to recent).
  const catchupByTopic = new Map<string, TaughtSession>()
  for (const s of raw.sessions) {
    if (!s.topic || !s.topic.trim()) continue
    const record = raw.attendance.find(a => a.sessionId === s.id)
    if (record?.status !== 'absent') continue
    const key = s.topic.trim().toLowerCase()
    const existing = catchupByTopic.get(key)
    if (!existing || s.date > existing.date) catchupByTopic.set(key, { id: s.id, topic: s.topic.trim(), date: s.date })
  }
  const catchupTopics = [...catchupByTopic.values()].sort((a, b) => b.date.localeCompare(a.date))

  return {
    attendanceRate, totalSessions: unique.length,
    presentCount, attendanceStreak,
    recentMarks, scoreHistory, weeklyAttendance,
    weakTopics, strongTopics, catchupPlans,
    syllabusTopics: [...raw.syllabusTopics].sort((a, b) => a.orderIndex - b.orderIndex),
    timetable: raw.timetable,
    substitutions: raw.substitutions ?? [],
    polls: raw.polls,
    upcomingTests,
    awaitingResults,
    taughtTopics,
    catchupTopics,
  }
}

// Resolves a topic name to whichever unmastered prerequisite (if any) should
// really be tackled first instead — walks the chain, bounded against bad data.
function resolvePrerequisite(topicName: string, syllabusTopics: SyllabusTopic[]): string {
  const byName  = new Map(syllabusTopics.map(t => [t.topic.trim().toLowerCase(), t]))
  const byDefId = new Map(syllabusTopics.filter(t => t.definitionId).map(t => [t.definitionId!, t]))
  let current = byName.get(topicName.trim().toLowerCase())
  const seen = new Set<string>()
  while (current?.prerequisiteDefinitionId && !seen.has(current.prerequisiteDefinitionId)) {
    seen.add(current.prerequisiteDefinitionId)
    const prereq = byDefId.get(current.prerequisiteDefinitionId)
    if (!prereq || prereq.isCompleted) break
    current = prereq
  }
  return current?.topic ?? topicName
}

// The adaptive "what's next" pick. Priority: a catch-up plan (absence-driven,
// always most urgent) > the single weakest already-tested topic (shoring up a
// demonstrated gap beats blindly moving forward) > the teacher's plain next
// topic in order. Whichever topic wins gets redirected to an unmastered
// prerequisite first, if it has one.
function pickNextTopic(
  bySubject: { tab: SubjectTab; data: SubjectData }[]
): { label: string; topic: string; subjectLabel: string } | null {
  for (const { tab, data } of bySubject) {
    if (data.catchupPlans[0]) return { label: 'Catch up on', topic: data.catchupPlans[0].topic, subjectLabel: tab.label }
  }
  for (const { tab, data } of bySubject) {
    if (data.weakTopics[0]) {
      return { label: 'Review', topic: resolvePrerequisite(data.weakTopics[0].topic, data.syllabusTopics), subjectLabel: tab.label }
    }
  }
  for (const { tab, data } of bySubject) {
    const nextTopic = data.syllabusTopics.find(t => !t.isCompleted)
    if (nextTopic) return { label: 'Continue with', topic: resolvePrerequisite(nextTopic.topic, data.syllabusTopics), subjectLabel: tab.label }
  }
  return null
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)')
    const update = () => setMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return mobile
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StudentHomePage() {
  const router = useRouter()
  const [student,     setStudent]     = useState<Student | null>(null)
  const [cls,         setCls]         = useState<Class | null>(null)
  const [subjects,    setSubjects]    = useState<SubjectTab[]>([])
  const [allData,     setAllData]     = useState<Record<string, SubjectData>>({})
  const [loading,     setLoading]     = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [activeNavGroup, setActiveNavGroup] = useState<string>('home')
  const [learnTab, setLearnTab] = useState<'notes' | 'flashcards' | 'quizzes' | 'adaptive' | 'syllabus'>('notes')
  const [selectedLearnSubject, setSelectedLearnSubject] = useState<string | null>(null)
  const [learnPreload, setLearnPreload] = useState<{ subject: string; topic: string } | null>(null)
  const isMobile = useIsMobile()
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null)
  const [loadError,     setLoadError]     = useState(false)
  const [showInterests, setShowInterests] = useState(false)
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [draftInterests, setDraftInterests] = useState<string[]>([])
  const [customInput,   setCustomInput]   = useState('')
  const [savingInterests, setSavingInterests] = useState(false)
  const [seenTopicsMap, setSeenTopicsMap] = useState<Record<string, string>>({})
  const [seenTests, setSeenTests] = useState<string[]>([])
  const initDone     = useRef(false)
  const contentPaneRef = useRef<HTMLDivElement>(null)
  const recentScrollRef = useRef<HTMLDivElement>(null)
  const [recentScrollState, setRecentScrollState] = useState({ left: false, right: false })

  // ── Study Buddies (peer pairing) ────────────────────────────────────────────
  const [peerData, setPeerData] = useState<PeerData | null>(null)
  const [peerLoading, setPeerLoading] = useState(false)
  const [peerError, setPeerError] = useState<string | null>(null)
  const [peerActionId, setPeerActionId] = useState<string | null>(null)

  async function loadPeerData() {
    if (!cls) return
    setPeerLoading(true)
    setPeerError(null)
    try {
      const res = await fetch(`/api/student/peer-matches?classId=${cls.id}`)
      if (!res.ok) throw new Error()
      setPeerData(await res.json())
    } catch {
      setPeerError('Could not load study buddies right now.')
    } finally {
      setPeerLoading(false)
    }
  }

  async function sendPeerRequest(targetStudentId: string) {
    if (!cls) return
    setPeerActionId(targetStudentId)
    try {
      const res = await fetch('/api/student/peer-pairings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: cls.id, targetStudentId }),
      })
      if (!res.ok) { setPeerError('Could not send that request — try again.'); return }
      await loadPeerData()
    } catch {
      setPeerError('Could not send that request — try again.')
    } finally {
      setPeerActionId(null)
    }
  }

  async function respondPeerRequest(id: string, action: 'accept' | 'cancel') {
    setPeerActionId(id)
    try {
      const res = await fetch('/api/student/peer-pairings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      if (!res.ok) { setPeerError('Could not update that request — try again.'); return }
      await loadPeerData()
    } catch {
      setPeerError('Could not update that request — try again.')
    } finally {
      setPeerActionId(null)
    }
  }

  function updateRecentScrollState() {
    const el = recentScrollRef.current
    if (!el) return
    setRecentScrollState({
      left:  el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }

  function scrollRecent(dir: 1 | -1) {
    recentScrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })
  }

  useEffect(() => {
    if (initDone.current) return
    initDone.current = true
    if (!localStorage.getItem('eduteach_student_session')) { router.replace('/student/login'); return }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('eduteach_seen_topics')
      if (raw) setSeenTopicsMap(JSON.parse(raw))
    } catch { /* ignore malformed/unavailable storage */ }
    try {
      const rawT = localStorage.getItem('eduteach_seen_tests')
      if (rawT) setSeenTests(JSON.parse(rawT))
    } catch { /* ignore */ }
  }, [])

  // Mark the newest taught topic in each subject as "seen" a few seconds after it's
  // shown, so the "New" tag has a chance to catch the student's eye before it clears.
  useEffect(() => {
    if (subjects.length === 0) return
    const timer = setTimeout(() => {
      setSeenTopicsMap(prev => {
        let changed = false
        const next = { ...prev }
        for (const tab of subjects) {
          const latest = allData[tab.key]?.taughtTopics[0]?.date
          if (latest && next[tab.key] !== latest) { next[tab.key] = latest; changed = true }
        }
        if (!changed) return prev
        try { localStorage.setItem('eduteach_seen_topics', JSON.stringify(next)) } catch { /* ignore */ }
        return next
      })
    }, 4000)
    return () => clearTimeout(timer)
  }, [subjects, allData])

  async function init() {
    try {
      const res = await fetch('/api/student/init')
      if (!res.ok) { router.replace('/student/login'); return }
      const data = await res.json()
      setStudent(data.student); setCls(data.primaryClass)
      const tabs: SubjectTab[] = data.tabs.map(
        (t: { classId: string; studentId: string; subject: string; teacherId?: string }, i: number) => ({
          key: `${t.classId}::${t.teacherId ?? ''}::${i}`,
          classId: t.classId, studentId: t.studentId,
          teacherId: t.teacherId,
          label: t.subject, color: TAB_COLORS[i % TAB_COLORS.length],
        })
      )
      setSubjects(tabs)
      if (tabs.length > 0) await loadAllData(tabs)
    } catch { router.replace('/student/login') }
    finally { setLoading(false) }
  }

  async function loadAllData(tabs: SubjectTab[]) {
    setDataLoading(true)
    setLoadError(false)
    try {
      const results = await Promise.all(tabs.map(async tab => {
        try {
          const params = new URLSearchParams({ classId: tab.classId, studentId: tab.studentId })
          if (tab.teacherId) params.set('teacherId', tab.teacherId)
          const res = await fetch(`/api/student/tab-data?${params}`)
          if (!res.ok) return null
          return { key: tab.key, data: buildSubjectData(await res.json()) }
        } catch { return null }
      }))
      const map: Record<string, SubjectData> = {}
      results.forEach(r => { if (r) map[r.key] = r.data })
      setAllData(map)
      if (Object.keys(map).length === 0) setLoadError(true)
    } finally {
      setDataLoading(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem('eduteach_student_session')
    document.cookie = 'edu-student-id=; path=/; max-age=0'
    router.replace('/student/login')
  }

  function openInterestsEditor() {
    setDraftInterests(student?.interests ?? [])
    setCustomInput('')
    setShowInterests(true)
  }

  function togglePreset(label: string) {
    setDraftInterests(prev =>
      prev.includes(label) ? prev.filter(i => i !== label) : [...prev, label]
    )
  }

  function addCustom() {
    const v = customInput.trim()
    if (!v || draftInterests.includes(v)) { setCustomInput(''); return }
    setDraftInterests(prev => [...prev, v])
    setCustomInput('')
  }

  async function saveInterests() {
    setSavingInterests(true)
    try {
      const res = await fetch('/api/student/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests: draftInterests }),
      })
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json()
      setStudent(prev => prev ? { ...prev, interests: data.interests } : prev)
      setShowInterests(false)
    } catch {
      setErrorMsg('Could not save preferences — please try again.')
    }
    setSavingInterests(false)
  }

  // ── Derived: merge every subject's data into one school-wide home feed ──────

  const homeFeed = useMemo(() => {
    const bySubject = subjects
      .map(tab => ({ tab, data: allData[tab.key] }))
      .filter((x): x is { tab: SubjectTab; data: SubjectData } => !!x.data)

    // Some data is class-level (attendance, timetable) and identical across subject
    // tabs that share a class — dedupe by classId so it isn't counted once per subject.
    const seenClass = new Set<string>()
    const byClass = bySubject.filter(({ tab }) => {
      if (seenClass.has(tab.classId)) return false
      seenClass.add(tab.classId); return true
    })

    const todayDow = new Date().getDay()
    const todayPeriods = byClass
      .flatMap(({ data }) => {
        const subByPeriod = new Map(data.substitutions.map(s => [s.periodNumber, s]))
        return data.timetable
          .filter(t => t.dayOfWeek === todayDow)
          .map(p => ({ ...p, subjectLabel: p.label || 'Class', substitution: subByPeriod.get(p.periodNumber) }))
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))

    const totalPresent  = byClass.reduce((sum, x) => sum + x.data.presentCount, 0)
    const totalSessions = byClass.reduce((sum, x) => sum + x.data.totalSessions, 0)
    const attendPct     = totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 100
    const bestStreak     = byClass.reduce((max, x) => Math.max(max, x.data.attendanceStreak), 0)

    // Merge each class's weekly attendance buckets by week, so a student with
    // subjects across multiple classes still gets one combined trend line.
    const weekMap = new Map<string, { present: number; total: number }>()
    byClass.forEach(({ data }) => {
      data.weeklyAttendance.forEach(w => {
        const rec = weekMap.get(w.weekKey) ?? { present: 0, total: 0 }
        rec.present += w.present; rec.total += w.total
        weekMap.set(w.weekKey, rec)
      })
    })
    const weeklyAttendance = [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10)
      .map(([weekKey, v]) => ({
        week: new Date(weekKey + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        rate: v.total > 0 ? v.present / v.total : 0,
        present: v.present, total: v.total,
      }))

    const allUpcomingTests = bySubject
      .flatMap(({ tab, data }) => data.upcomingTests.map(t => ({ ...t, subjectLabel: tab.label })))
      .sort((a, b) => a.conductedOn.localeCompare(b.conductedOn))
    // Home screen's "Next Up" card only ever previews a handful — the full list
    // (used by the Tests tab) is kept uncapped in `allUpcomingTests` below.
    const upcomingTests = allUpcomingTests.slice(0, 5)

    const allAwaitingResults = bySubject
      .flatMap(({ tab, data }) => data.awaitingResults.map(t => ({ ...t, subjectLabel: tab.label })))
      .sort((a, b) => b.conductedOn.localeCompare(a.conductedOn))

    const taughtTopics = bySubject
      .flatMap(({ tab, data }) => data.taughtTopics.map(t => ({ ...t, subjectLabel: tab.label, tabKey: tab.key })))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)

    const continueItem = pickNextTopic(bySubject)

    return { bySubject, todayPeriods, attendPct, totalPresent, totalSessions, bestStreak, weeklyAttendance, upcomingTests, allUpcomingTests, allAwaitingResults, taughtTopics, continueItem }
  }, [subjects, allData])

  // ── Progress Report — the full picture in one place, merged across every subject ──

  const reportView = useMemo(() => {
    const scoreHistory = homeFeed.bySubject
      .flatMap(({ tab, data }) => data.scoreHistory.map(m => ({ ...m, subjectLabel: tab.label })))
      .sort((a, b) => a.conductedOn.localeCompare(b.conductedOn))

    const avgScorePct = scoreHistory.length
      ? scoreHistory.reduce((sum, m) => sum + (m.totalMarks > 0 ? m.score / m.totalMarks : 0), 0) / scoreHistory.length
      : 0

    const scorePoints = scoreHistory.map(m => ({
      label: new Date(m.conductedOn + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      pct: m.totalMarks > 0 ? m.score / m.totalMarks : 0,
      topic: m.topic,
    }))

    // Gentle framing — "things to work on," not the teacher-side critical/watch
    // severity language, since this is shown directly to the child.
    const weakTopics = homeFeed.bySubject
      .flatMap(({ tab, data }) => data.weakTopics.map(t => ({ ...t, subjectLabel: tab.label })))
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 5)

    const bySubjectStats = homeFeed.bySubject.map(({ tab, data }) => {
      const avg = data.scoreHistory.length
        ? data.scoreHistory.reduce((sum, m) => sum + (m.totalMarks > 0 ? m.score / m.totalMarks : 0), 0) / data.scoreHistory.length
        : null
      return {
        label: tab.label,
        attendanceRate: data.attendanceRate,
        avgScorePct: avg,
        testsCount: data.scoreHistory.length,
      }
    })

    return { scoreHistory, avgScorePct, scorePoints, weakTopics, bySubjectStats }
  }, [homeFeed])

  // ── All badges (earned + locked), merged across every subject ──────────────

  const allBadges = useMemo(() => {
    const subjectDatas = homeFeed.bySubject.map(x => x.data)
    if (subjectDatas.length === 0) return BADGE_DEFS.map(def => ({ ...def, earned: false }))
    const perSubject = subjectDatas.map(computeAllBadges)
    return BADGE_DEFS.map((def, i) => ({ ...def, earned: perSubject.some(list => list[i].earned) }))
  }, [homeFeed])

  // ── Learn / Study Plan derived inputs ──────────────────────────────────────

  // Every subject the student is enrolled in for their grade shows up as a tab —
  // topics are only what's actually been taught in class (not the full syllabus),
  // so a topic doesn't appear here until the teacher has covered it.
  const learnSubjects = useMemo<LearnSubject[]>(() =>
    homeFeed.bySubject.map(({ tab, data }) => {
      const seen = new Set<string>()
      const topics: string[] = []
      for (const t of data.taughtTopics.map(x => x.topic)) {
        const trimmed = t.trim()
        const k = trimmed.toLowerCase()
        if (!trimmed || seen.has(k)) continue
        seen.add(k); topics.push(trimmed)
      }
      const catchupTopics = data.catchupTopics.map(c => ({ topic: c.topic, whenLabel: formatPastDate(c.date) }))
      return { label: tab.label, grade: cls?.grade ?? '', topics, catchupTopics }
    })
  , [homeFeed, cls])

  const seenTestSet = useMemo(() => new Set(seenTests), [seenTests])

  const testsView = useMemo(() => {
    // Full list — not the Home screen's capped 5-item preview — so every
    // scheduled test the student hasn't been marked for shows up here.
    const upcoming = homeFeed.allUpcomingTests.map(t => ({
      id: t.id, topic: t.topic, subjectLabel: t.subjectLabel, grade: cls?.grade ?? '',
      totalMarks: t.totalMarks, conductedOn: t.conductedOn,
      whenLabel: formatTestDate(t.conductedOn), isNew: !seenTestSet.has(t.id),
    }))
    // Already conducted but no mark entered for this student yet — shown
    // separately so a test in grading limbo isn't invisible to the student.
    const awaitingResults = homeFeed.allAwaitingResults.map(t => ({
      id: t.id, topic: t.topic, subjectLabel: t.subjectLabel, grade: cls?.grade ?? '',
      totalMarks: t.totalMarks, conductedOn: t.conductedOn,
      whenLabel: formatPastDate(t.conductedOn),
    }))
    const pastScores = homeFeed.bySubject
      .flatMap(({ tab, data }) => data.recentMarks.map(m => ({
        id: m.id, topic: m.topic, subjectLabel: tab.label,
        score: m.score, totalMarks: m.totalMarks, conductedOn: m.conductedOn,
      })))
      .sort((a, b) => b.conductedOn.localeCompare(a.conductedOn))
      .slice(0, 8)
    return { upcoming, awaitingResults, pastScores }
  }, [homeFeed, seenTestSet, cls])

  const newTestCount = testsView.upcoming.filter(t => t.isNew).length

  const firstName = (student?.name?.trim().split(/\s+/)[0]) || 'Student'

  // "Today's Lesson" = most recent topic taught in class (what the class is on now).
  const todaysLesson = useMemo(() => {
    const t = homeFeed.taughtTopics[0]
    if (t) return { topic: t.topic, subject: t.subjectLabel }
    const next = homeFeed.continueItem
    if (next) return { topic: next.topic, subject: next.subjectLabel }
    return null
  }, [homeFeed])

  function openLesson(tab: 'notes' | 'flashcards' | 'quizzes', subject: string, topic: string) {
    setSelectedLearnSubject(subject)
    setLearnPreload({ subject, topic })
    setLearnTab(tab)
    setActiveNavGroup('learn')
  }

  function selectNav(id: string) {
    setActiveNavGroup(id)
    setLearnPreload(null)   // navigating manually shows the topic picker, not a preloaded topic
    setSelectedLearnSubject(null)
    if (id === 'buddies' && !peerData && !peerLoading) loadPeerData()
  }

  // A newly scheduled test stays flagged "New" (with a count on the Tests nav item)
  // until the student actually opens the Tests tab — then it settles a couple of
  // seconds later, so the "New" pills flash once on that first visit.
  useEffect(() => {
    if (activeNavGroup !== 'tests') return
    const ids = homeFeed.allUpcomingTests.map(t => t.id)
    if (ids.length === 0) return
    const timer = setTimeout(() => {
      setSeenTests(prev => {
        const set = new Set(prev)
        let changed = false
        ids.forEach(id => { if (!set.has(id)) { set.add(id); changed = true } })
        if (!changed) return prev
        const next = [...set]
        try { localStorage.setItem('eduteach_seen_tests', JSON.stringify(next)) } catch { /* ignore */ }
        return next
      })
    }, 2500)
    return () => clearTimeout(timer)
  }, [activeNavGroup, homeFeed])

  useEffect(() => {
    updateRecentScrollState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeFeed.taughtTopics])


  // ── Loading screen ─────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="animate-spin" style={{ width: 44, height: 44, borderRadius: '50%', border: '4px solid #FFE8D1', borderTopColor: '#D9720F', margin: '0 auto 12px' }} />
        <p style={{ color: '#5B6B87', fontSize: 13, fontWeight: 500 }}>Loading your dashboard…</p>
      </div>
    </div>
  )
  if (!student || !cls) return null

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'transparent', fontFamily: 'var(--font-jakarta), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      {activeNavGroup === 'home' && <SpaceDoodleBackground />}

      {/* ════ SIDEBAR (desktop only) ════ */}
      {!isMobile && (
      <aside style={{ width: 240, flexShrink: 0, background: '#FFFFFF', borderRight: '2.5px solid #1E2A44', display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 18px 16px', borderBottom: '2.5px solid rgba(30,42,68,0.18)', flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: '#D9720F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <GraduationCap size={18} color="#fff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="font-kid" style={{ fontSize: 15, fontWeight: 600, color: '#1E2A44', letterSpacing: '-.3px', lineHeight: 1 }}>EduTeach</p>
            <p style={{ fontSize: 10, fontWeight: 600, color: '#5B6B87', marginTop: 3 }}>Student Portal</p>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 0' }}>

          {/* ── Primary navigation ── */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV_GROUPS.map(group => {
              const isAct = activeNavGroup === group.id
              return (
                <button key={group.id} onClick={() => selectNav(group.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 14, border: 'none', cursor: 'pointer', transition: 'all .15s', textAlign: 'left', fontFamily: 'inherit', background: isAct ? '#D9720F' : 'transparent' }}
                  onMouseEnter={e => { if (!isAct) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(30,42,68,0.05)' }}
                  onMouseLeave={e => { if (!isAct) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                  <group.Icon size={16} color={isAct ? '#fff' : '#5B6B87'} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: isAct ? 800 : 600, flex: 1, color: isAct ? '#fff' : '#5B6B87' }}>{group.label}</span>
                  {group.id === 'tests' && newTestCount > 0 && (
                    <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: isAct ? 'rgba(255,255,255,.28)' : '#1E2A44', color: '#fff', fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>
                      {newTestCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* User profile + sign out */}
        <div style={{ padding: '12px 10px 14px', borderTop: '2.5px solid rgba(30,42,68,0.18)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px', marginBottom: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 11, background: '#D9720F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
              {(student.name?.trim()?.[0] ?? '?').toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: '#1E2A44', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{student.name}</p>
              <p style={{ fontSize: 10, fontWeight: 500, color: '#5B6B87', marginTop: 3 }}>
                Roll #{student.rollNumber} · Gr {cls.grade}{cls.section ? cls.section : ''}
              </p>
            </div>
          </div>
          <button onClick={openInterestsEditor}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#5B6B87', fontFamily: 'inherit', marginBottom: 2 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FFE8D1'; (e.currentTarget as HTMLButtonElement).style.color = '#D9720F' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#5B6B87' }}>
            <Pencil size={13} />
            My Interests
            {student?.interests && student.interests.length > 0
              ? <span style={{ marginLeft: 'auto', fontSize: 10, background: '#FFE8D1', color: '#D9720F', borderRadius: 8, padding: '2px 7px', fontWeight: 800 }}>{student.interests.length}</span>
              : <span style={{ marginLeft: 'auto', fontSize: 10, color: '#D9720F', fontWeight: 700 }}>Set now</span>
            }
          </button>
          <button onClick={handleLogout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#5B6B87', fontFamily: 'inherit' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FBE3DC'; (e.currentTarget as HTMLButtonElement).style.color = '#dc2626' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#5B6B87' }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>
      )}

      {/* ════ MAIN ════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Scrollable content */}
        <div ref={contentPaneRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: isMobile ? '20px 16px 96px' : '26px 32px 48px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 760, margin: '0 auto' }}>

          {/* ── Header: greeting (Home) or section title ── */}
          {activeNavGroup === 'home' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 2 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className="font-kid" style={{ fontSize: isMobile ? 28 : 32, fontWeight: 700, color: '#1E2A44', letterSpacing: '-.3px', lineHeight: 1.1 }}>Hi, {firstName}!</h1>
              </div>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setShowNotifPanel(v => !v)}
                  style={{ width: 44, height: 44, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bell size={22} color="#1E2A44" strokeWidth={2} />
                </button>
                {showNotifPanel && (
                  <>
                    <div onClick={() => setShowNotifPanel(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
                    <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 160, background: '#FFFFFF', border: '2.5px solid #1E2A44', borderRadius: 14, padding: '14px 16px', width: 220 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#1E2A44' }}>You&apos;re all caught up!</p>
                      <p style={{ fontSize: 11.5, color: '#5B6B87', marginTop: 4, lineHeight: 1.4 }}>No new notifications right now.</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 2 }}>
              <div>
                <h1 style={{ fontSize: isMobile ? 26 : 30, fontWeight: 800, color: '#1E2A44', letterSpacing: '-.4px' }}>
                  {NAV_GROUPS.find(g => g.id === activeNavGroup)?.label ?? 'Home'}
                </h1>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#5B6B87' }}>Grade {cls.grade}{cls.section ? ` - Section ${cls.section}` : ''}</span>
              </div>
              {activeNavGroup === 'tests' && (
                <ClipboardCheck size={26} color="#1E2A44" strokeWidth={2} style={{ marginTop: 4, flexShrink: 0 }} />
              )}
            </div>
          )}

          {/* ── Error toast ── */}
          {errorMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderRadius: 14, background: '#fef2f2', border: '2.5px solid #fca5a5' }}>
              <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
              <p style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#991b1b', lineHeight: 1.5 }}>{errorMsg}</p>
              <button onClick={() => setErrorMsg(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', display: 'flex', padding: 0, fontFamily: 'inherit' }}><X size={18} /></button>
            </div>
          )}

          {dataLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="animate-pulse" style={{ height: 48, borderRadius: 16, background: 'rgba(30,42,68,0.08)' }} />
              <div className="animate-pulse" style={{ height: 160, borderRadius: 24, background: 'rgba(30,42,68,0.08)' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
                {[1,2,3].map(i => <div key={i} className="animate-pulse" style={{ height: 156, borderRadius: 24, background: 'rgba(30,42,68,0.08)' }} />)}
              </div>
            </div>

          ) : loadError ? (
            <div style={{ ...CARD, alignItems: 'center', justifyContent: 'center', padding: '72px 20px', textAlign: 'center' }}>
              <AlertTriangle size={44} color="#dc2626" strokeWidth={1.75} />
              <p style={{ fontSize: 16, fontWeight: 800, color: '#1E2A44', marginTop: 14 }}>Could not load data</p>
              <p style={{ fontSize: 13, color: '#5B6B87', marginTop: 5, lineHeight: 1.6, maxWidth: 340 }}>There was a problem fetching your dashboard. Check your connection and try again.</p>
              <button onClick={() => loadAllData(subjects)}
                style={{ marginTop: 18, padding: '10px 28px', borderRadius: 12, background: '#D9720F', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Retry
              </button>
            </div>
          ) : homeFeed.bySubject.length === 0 ? (
            <div style={{ ...CARD, alignItems: 'center', justifyContent: 'center', padding: '72px 20px', textAlign: 'center' }}>
              <BookOpen size={44} color="#A6AEC2" strokeWidth={1.75} />
              <p style={{ fontSize: 16, fontWeight: 800, color: '#1E2A44', marginTop: 14 }}>No data yet</p>
              <p style={{ fontSize: 13, color: '#5B6B87', marginTop: 5, lineHeight: 1.6, maxWidth: 340 }}>Once your teacher records lessons and tests, your progress will appear here.</p>
            </div>

          ) : activeNavGroup === 'home' ? (
            <>
              {/* ── Substitute teacher notice(s) for today ── */}
              {homeFeed.todayPeriods.filter(p => p.substitution).map(p => (
                <div key={`${p.classId}-${p.periodNumber}`} style={{ ...CARD, flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 18px', background: p.substitution!.status === 'unresolved' ? '#FFE8D1' : '#DCEBF8' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 11, background: p.substitution!.status === 'unresolved' ? '#FCDCC2' : '#CDE3F7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <UserCheck size={17} color={p.substitution!.status === 'unresolved' ? '#D9720F' : '#1E62A8'} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1E2A44', lineHeight: 1.4 }}>
                    {p.substitution!.status === 'unresolved'
                      ? <>Period {p.periodNumber} ({p.subjectLabel}) has no regular teacher today — a staff member will be assigned soon.</>
                      : <>Period {p.periodNumber} ({p.subjectLabel}) is being covered by <strong>{p.substitution!.substituteTeacherName}</strong> today.</>}
                  </p>
                </div>
              ))}

              {/* ── Today's Lesson ── */}
              <div style={{ borderRadius: 22, overflow: 'hidden', border: '2.5px solid #1E2A44' }}>
                <div style={{ background: '#D9720F', padding: '20px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <BookSticker size={22} />
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Today&apos;s Lesson</p>
                  </div>
                  {todaysLesson ? (
                    <p className="font-kid" style={{ fontSize: isMobile ? 24 : 27, fontWeight: 700, color: '#fff', letterSpacing: '-.2px', lineHeight: 1.2 }}>{todaysLesson.topic}</p>
                  ) : (
                    <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>Once your teacher records a lesson, it&apos;ll show up here with notes, flashcards, and a quiz.</p>
                  )}
                </div>
                {todaysLesson && (
                  <div style={{ background: '#fff', padding: '16px 22px' }}>
                    <button onClick={() => openLesson('notes', todaysLesson.subject, todaysLesson.topic)}
                      style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, color: '#fff', background: '#D9720F' }}>
                      Start Lesson
                    </button>
                  </div>
                )}
              </div>

              {/* ── Attendance + Achievements, side by side ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ ...HCARD, textAlign: 'center' }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginBottom: 14 }}>Attendance</p>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <ProgressRing pct={homeFeed.attendPct} size={92} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#5B6B87', marginTop: 12 }}>{homeFeed.totalPresent}/{homeFeed.totalSessions} classes</p>
                  {homeFeed.bestStreak >= 2 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8 }}>
                      <Flame size={13} color="#D9720F" />
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#D9720F' }}>{homeFeed.bestStreak}-class streak</span>
                    </div>
                  )}
                </div>

                {allBadges.length > 0 && (
                  <div style={{ ...HCARD }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginBottom: 14 }}>Achievements</p>
                    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                      {allBadges.filter(b => b.earned).map(b => <BadgeSticker key={b.id} badge={b} earned size={44} />)}
                      {allBadges.filter(b => !b.earned).map(b => <BadgeSticker key={b.id} badge={b} earned={false} size={44} />)}
                      <Star size={20} color="#FFC93C" fill="#FFC93C" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%) rotate(12deg)', pointerEvents: 'none' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Next Up ── */}
              <div style={{ ...HCARD }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#1E2A44', letterSpacing: '-.3px', marginBottom: 12 }}>Next Up</p>
                {homeFeed.upcomingTests.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {homeFeed.upcomingTests.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                            <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44' }}>{t.topic}</p>
                            {!seenTestSet.has(t.id) && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#1E2A44', color: '#fff', fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', padding: '2px 7px', borderRadius: 8, flexShrink: 0 }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
                                NEW
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: 11.5, color: '#5B6B87', marginTop: 2 }}>{t.subjectLabel} · {t.totalMarks} marks</p>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#D9720F', flexShrink: 0 }}>{formatTestDate(t.conductedOn)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 13.5, color: '#5B6B87' }}>No upcoming tests scheduled.</p>
                )}
              </div>

              {/* ── Recent Lessons ── */}
              {homeFeed.taughtTopics.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 2px' }}>
                    <p style={{ fontSize: 16, fontWeight: 800, color: '#1E2A44', letterSpacing: '-.3px' }}>Recent Lessons</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => scrollRecent(-1)} disabled={!recentScrollState.left}
                        style={{ width: 28, height: 28, borderRadius: '50%', border: '2.5px solid #1E2A44', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: recentScrollState.left ? 'pointer' : 'default', opacity: recentScrollState.left ? 1 : 0.35 }}>
                        <ChevronLeft size={15} color="#D9720F" />
                      </button>
                      <button onClick={() => scrollRecent(1)} disabled={!recentScrollState.right}
                        style={{ width: 28, height: 28, borderRadius: '50%', border: '2.5px solid #1E2A44', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: recentScrollState.right ? 'pointer' : 'default', opacity: recentScrollState.right ? 1 : 0.35 }}>
                        <ChevronRight size={15} color="#D9720F" />
                      </button>
                    </div>
                  </div>
                  <div ref={recentScrollRef} onScroll={updateRecentScrollState} className="no-scrollbar"
                    style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                    {homeFeed.taughtTopics.map(t => {
                      const seenBefore = seenTopicsMap[t.tabKey]
                      const isNew = !seenBefore || t.date > seenBefore
                      return (
                        <div key={t.id} style={{ ...HCARD, flex: '0 0 150px', width: 150, padding: '16px 14px', position: 'relative' }}>
                          {isNew && (
                            <span style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: '50%', background: '#1E2A44' }} />
                          )}
                          <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', lineHeight: 1.3, marginBottom: 10 }}>{t.topic}</p>
                          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#1E62A8', background: '#DCEBF8', padding: '3px 9px', borderRadius: 7 }}>{t.subjectLabel}</span>
                          <p style={{ fontSize: 11.5, fontWeight: 600, color: '#5B6B87', marginTop: 8 }}>{formatPastDate(t.date)}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>

          ) : activeNavGroup === 'learn' ? (
            selectedLearnSubject == null ? (
              /* ── Subject list — pick a subject before Notes/Flashcards/Quiz ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {learnSubjects.length === 0 ? (
                  <div style={{ ...HCARD, textAlign: 'center', padding: '48px 20px' }}>
                    <p style={{ fontSize: 13.5, color: '#5B6B87' }}>No subjects yet — once your teacher sets up your class, subjects will appear here.</p>
                  </div>
                ) : learnSubjects.map((s, i) => {
                  const StickerIcon = subjectStickerIcon(s.label)
                  const palette = SUBJECT_PALETTE[i % SUBJECT_PALETTE.length]
                  return (
                    <button key={s.label} onClick={() => setSelectedLearnSubject(s.label)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left',
                        background: '#fff', border: '3px solid #1E2A44', borderRadius: 20,
                        padding: '18px 20px', width: '100%',
                      }}>
                      <span style={{ width: 52, height: 52, borderRadius: '50%', background: palette.bg, border: `2.5px solid ${palette.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <StickerIcon size={28} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 18, fontWeight: 800, color: palette.text }}>{s.label}</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: palette.text, opacity: 0.75, marginTop: 2 }}>{s.topics.length} topic{s.topics.length === 1 ? '' : 's'} taught</p>
                      </div>
                      {s.catchupTopics.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#D9720F', color: '#fff', fontSize: 10.5, fontWeight: 800, padding: '4px 9px', borderRadius: 20, flexShrink: 0 }}>
                          <Hourglass size={10} strokeWidth={2.5} /> {s.catchupTopics.length}
                        </span>
                      )}
                      <ChevronRight size={20} color={palette.text} style={{ flexShrink: 0 }} />
                    </button>
                  )
                })}
              </div>
            ) : (
              <>
                {/* ── Back to subjects + subject name ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 2 }}>
                  <button onClick={() => { setSelectedLearnSubject(null); setLearnPreload(null) }}
                    style={{ background: '#fff', border: '2.5px solid #1E2A44', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowLeft size={16} color="#D9720F" />
                  </button>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#1E2A44', letterSpacing: '-.3px' }}>{selectedLearnSubject}</p>
                </div>

                {/* Sub-tabs: Notes / Flashcards / Quiz / Adaptive / Syllabus (pill switcher) */}
                <div style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 14, padding: 4, border: '2.5px solid #1E2A44', flexWrap: 'wrap' }}>
                  {([['notes', 'Summary Notes'], ['flashcards', 'Flashcards'], ['quizzes', 'Quiz'], ['adaptive', 'Adaptive'], ['syllabus', 'Syllabus']] as const).map(([id, label]) => {
                    const isAct = learnTab === id
                    return (
                      <button key={id} onClick={() => setLearnTab(id)}
                        style={{ flex: '1 1 30%', minWidth: 70, padding: '10px 6px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, transition: 'all .15s', background: isAct ? '#D9720F' : 'transparent', color: isAct ? '#fff' : '#5B6B87' }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
                <div style={{ ...HCARD }}>
                  {(() => {
                    const subjectOnly = learnSubjects.filter(s => s.label === selectedLearnSubject)
                    if (learnTab === 'notes') return (
                      <NotesPanel subjects={subjectOnly} interests={student.interests ?? []} preselect={learnPreload} hideSubjectHeading
                        onTopicPicked={(subject, topic) => setLearnPreload({ subject, topic })} onBack={() => setLearnPreload(null)} />
                    )
                    if (learnTab === 'flashcards') return (
                      <FlashcardsPanel subjects={subjectOnly} interests={student.interests ?? []} preselect={learnPreload} hideSubjectHeading
                        onTopicPicked={(subject, topic) => setLearnPreload({ subject, topic })} onBack={() => setLearnPreload(null)} />
                    )
                    if (learnTab === 'quizzes') return (
                      <QuizPanel subjects={subjectOnly} interests={student.interests ?? []} preselect={learnPreload} hideSubjectHeading
                        onTopicPicked={(subject, topic) => setLearnPreload({ subject, topic })} onBack={() => setLearnPreload(null)} />
                    )
                    if (learnTab === 'adaptive') return (
                      <AdaptiveQuizPanel subjects={subjectOnly} interests={student.interests ?? []} preselect={learnPreload} hideSubjectHeading
                        onTopicPicked={(subject, topic) => setLearnPreload({ subject, topic })} onBack={() => setLearnPreload(null)} />
                    )

                    // ── Syllabus checklist — everything in this subject, what's
                    // done, and what's next. Pulled straight from syllabusTopics,
                    // which was already being fetched just to compute one badge.
                    const topics = homeFeed.bySubject
                      .filter(({ tab }) => tab.label === selectedLearnSubject)
                      .flatMap(({ data }) => data.syllabusTopics)
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                    if (topics.length === 0) return (
                      <p style={{ fontSize: 13.5, color: '#5B6B87', textAlign: 'center', padding: '24px 0' }}>
                        No syllabus set up for this subject yet.
                      </p>
                    )
                    const doneCount = topics.filter(t => t.isCompleted).length
                    const nextId = topics.find(t => !t.isCompleted)?.id
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <p style={{ fontSize: 13, fontWeight: 800, color: '#1E2A44' }}>{doneCount} of {topics.length} topics done</p>
                            <p style={{ fontSize: 13, fontWeight: 800, color: '#D9720F' }}>{Math.round((doneCount / topics.length) * 100)}%</p>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: 'rgba(30,42,68,0.1)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round((doneCount / topics.length) * 100)}%`, background: '#D9720F', borderRadius: 4, transition: 'width .4s ease' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {topics.map(t => {
                            const isNext = t.id === nextId
                            return (
                              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
                                {t.isCompleted ? (
                                  <CheckCircle2 size={20} color="#059669" style={{ flexShrink: 0 }} />
                                ) : (
                                  <span style={{
                                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                    border: `2.5px solid ${isNext ? '#D9720F' : '#1E2A44'}`,
                                    background: isNext ? '#FFE8D1' : 'transparent',
                                  }} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 13.5, fontWeight: t.isCompleted ? 600 : 700, color: t.isCompleted ? '#5B6B87' : '#1E2A44', textDecoration: t.isCompleted ? 'line-through' : 'none' }}>
                                    {t.topic}
                                  </p>
                                  {t.weekNumber != null && (
                                    <p style={{ fontSize: 11, color: '#A6AEC2', marginTop: 1 }}>Week {t.weekNumber}</p>
                                  )}
                                </div>
                                {isNext && (
                                  <span style={{ fontSize: 10, fontWeight: 800, color: '#D9720F', background: '#FFE8D1', padding: '3px 9px', borderRadius: 8, flexShrink: 0 }}>NEXT</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </>
            )

          ) : activeNavGroup === 'tests' ? (
            <TestsPanel upcomingTests={testsView.upcoming} awaitingResults={testsView.awaitingResults} pastScores={testsView.pastScores} interests={student.interests ?? []} />

          ) : activeNavGroup === 'report' ? (
            <>
              {/* ── Snapshot stats ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
                <StatTile value={`${homeFeed.attendPct}%`} label="Attendance"
                  color={homeFeed.attendPct >= 90 ? '#059669' : homeFeed.attendPct >= 75 ? '#D97706' : '#dc2626'} />
                <StatTile value={reportView.scoreHistory.length > 0 ? `${Math.round(reportView.avgScorePct * 100)}%` : '—'} label="Avg Score"
                  color={reportView.avgScorePct >= 0.75 ? '#059669' : reportView.avgScorePct >= 0.5 ? '#D97706' : '#dc2626'} />
                <StatTile value={String(reportView.scoreHistory.length)} label="Tests Taken" />
                <StatTile value={reportView.scoreHistory.length > 0 ? getMasteryLabel(reportView.avgScorePct) : '—'} label="Overall" />
              </div>

              {/* ── Score progress chart ── */}
              {reportView.scorePoints.length > 0 && (
                <div style={{ ...HCARD }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginBottom: 2 }}>Score Progress</p>
                  <p style={{ fontSize: 12, color: '#5B6B87', marginBottom: 10 }}>{reportView.scorePoints.length} test{reportView.scorePoints.length !== 1 ? 's' : ''} this year</p>
                  <ScoreChart points={reportView.scorePoints} />
                </div>
              )}

              {/* ── Attendance trend chart ── */}
              {homeFeed.weeklyAttendance.length > 0 && (
                <div style={{ ...HCARD }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginBottom: 10 }}>Attendance by Week</p>
                  <AttendanceChart weeks={homeFeed.weeklyAttendance} />
                </div>
              )}

              {/* ── By subject ── */}
              {reportView.bySubjectStats.length > 0 && (
                <div style={{ ...HCARD }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginBottom: 12 }}>By Subject</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {reportView.bySubjectStats.map(s => (
                      <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <p style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: '#1E2A44' }}>{s.label}</p>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#5B6B87' }}>{Math.round(s.attendanceRate * 100)}% present</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#5B6B87' }}>{s.avgScorePct != null ? `${Math.round(s.avgScorePct * 100)}% avg` : 'No tests'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Things to work on ── */}
              {reportView.weakTopics.length > 0 && (
                <div style={{ ...HCARD }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginBottom: 12 }}>Things to Work On</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {reportView.weakTopics.map(t => (
                      <div key={`${t.subjectLabel}-${t.topic}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 700, color: '#1E2A44' }}>{t.topic}</p>
                          <p style={{ fontSize: 11.5, color: '#5B6B87', marginTop: 1 }}>{t.subjectLabel}</p>
                        </div>
                        <button onClick={() => openLesson('quizzes', t.subjectLabel, t.topic)}
                          style={{ padding: '8px 14px', borderRadius: 12, background: '#FFE8D1', border: 'none', color: '#D9720F', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                          Practice
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reportView.scoreHistory.length === 0 && homeFeed.weeklyAttendance.length === 0 && (
                <div style={{ ...CARD, alignItems: 'center', justifyContent: 'center', padding: '48px 20px', textAlign: 'center' }}>
                  <BarChart3 size={40} color="#A6AEC2" strokeWidth={1.75} />
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginTop: 12 }}>Nothing to show yet</p>
                  <p style={{ fontSize: 13, color: '#5B6B87', marginTop: 5, lineHeight: 1.6, maxWidth: 300 }}>Once your teacher records attendance and tests, your progress will show up here.</p>
                </div>
              )}
            </>

          ) : activeNavGroup === 'buddies' ? (
            <>
              {peerError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderRadius: 14, background: '#fef2f2', border: '2.5px solid #fca5a5' }}>
                  <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
                  <p style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#991b1b', lineHeight: 1.5 }}>{peerError}</p>
                  <button onClick={() => setPeerError(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', display: 'flex', padding: 0, fontFamily: 'inherit' }}><X size={18} /></button>
                </div>
              )}

              {peerLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="animate-pulse" style={{ height: 90, borderRadius: 22, background: 'rgba(30,42,68,0.08)' }} />
                  <div className="animate-pulse" style={{ height: 90, borderRadius: 22, background: 'rgba(30,42,68,0.08)' }} />
                </div>
              ) : !peerData ? null : (
                <>
                  {/* ── Requests waiting for you ── */}
                  {peerData.incoming.length > 0 && (
                    <div style={{ ...HCARD }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginBottom: 12 }}>Requests Waiting For You</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {peerData.incoming.map(r => (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#D9720F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                              {r.fromName[0]?.toUpperCase() ?? '?'}
                            </div>
                            <p style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: '#1E2A44' }}>{r.fromName} wants to be study buddies{r.subject ? ` for ${r.subject}` : ''}</p>
                            <button onClick={() => respondPeerRequest(r.id, 'accept')} disabled={peerActionId === r.id}
                              style={{ padding: '8px 16px', borderRadius: 12, background: '#D9720F', border: 'none', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: peerActionId === r.id ? 0.6 : 1 }}>
                              {peerActionId === r.id ? '…' : 'Accept'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Your Study Buddies ── */}
                  {peerData.active.length > 0 && (
                    <div style={{ ...HCARD }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginBottom: 12 }}>Your Study Buddies</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {peerData.active.map(a => (
                          <div key={a.id} style={{ padding: '14px 16px', borderRadius: 16, background: '#F0F7EE', border: '2px solid #CDE7C4' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: a.activity ? 8 : 0 }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                                {a.partnerName[0]?.toUpperCase() ?? '?'}
                              </div>
                              <p style={{ fontSize: 14, fontWeight: 800, color: '#1E2A44' }}>{a.partnerName}{a.subject ? ` · ${a.subject}` : ''}</p>
                            </div>
                            {a.activity && (
                              <p style={{ fontSize: 13, color: '#2F4A34', lineHeight: 1.5 }}>{a.activity}</p>
                            )}
                            {a.progressNote && (
                              <p style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Trophy size={12} /> {a.progressNote}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Your sent requests ── */}
                  {peerData.outgoing.length > 0 && (
                    <div style={{ ...HCARD }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginBottom: 12 }}>Waiting For A Reply</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {peerData.outgoing.map(r => (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <p style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#5B6B87' }}>Sent to <strong style={{ color: '#1E2A44' }}>{r.toName}</strong></p>
                            <button onClick={() => respondPeerRequest(r.id, 'cancel')} disabled={peerActionId === r.id}
                              style={{ padding: '7px 14px', borderRadius: 12, background: 'transparent', border: '2px solid #1E2A44', color: '#5B6B87', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: peerActionId === r.id ? 0.6 : 1 }}>
                              {peerActionId === r.id ? '…' : 'Cancel'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Suggested matches ── */}
                  <div style={{ ...HCARD }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44', marginBottom: 2 }}>Suggested Matches</p>
                    <p style={{ fontSize: 12, color: '#5B6B87', marginBottom: 12 }}>Classmates who could make a great study team with you</p>
                    {peerData.matches.length === 0 ? (
                      <p style={{ fontSize: 13.5, color: '#5B6B87', textAlign: 'center', padding: '16px 0' }}>No suggested matches right now — check back once more classmates have interests or tests recorded.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {peerData.matches.map(m => (
                          <div key={m.studentId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#FFE8D1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#D9720F', flexShrink: 0 }}>
                              {m.name[0]?.toUpperCase() ?? '?'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13.5, fontWeight: 800, color: '#1E2A44' }}>{m.name}</p>
                              <p style={{ fontSize: 11.5, color: '#5B6B87', marginTop: 1 }}>{m.reason}</p>
                            </div>
                            <button onClick={() => sendPeerRequest(m.studentId)} disabled={peerActionId === m.studentId}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, background: '#D9720F', border: 'none', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: peerActionId === m.studentId ? 0.6 : 1 }}>
                              <Send size={12} /> {peerActionId === m.studentId ? '…' : 'Request'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>

          ) : activeNavGroup === 'profile' ? (
            <>
              <div style={{ ...HCARD, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#D9720F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                  {(student.name?.trim()?.[0] ?? '?').toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#1E2A44' }}>{student.name}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#5B6B87', marginTop: 3 }}>Roll #{student.rollNumber} · Grade {cls.grade}{cls.section ? ` · Section ${cls.section}` : ''}</p>
                </div>
              </div>

              <button onClick={openInterestsEditor}
                style={{ ...HCARD, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: '#FFE8D1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Pencil size={17} color="#D9720F" />
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#1E2A44' }}>My Interests</p>
                  <p style={{ fontSize: 12, color: '#5B6B87', marginTop: 2 }}>{student.interests?.length ? `${student.interests.length} selected — used to personalise your learning` : 'Set your interests to personalise learning'}</p>
                </div>
              </button>

              <button onClick={handleLogout}
                style={{ ...HCARD, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: '#FBE3DC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <LogOut size={17} color="#dc2626" />
                </div>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#dc2626', textAlign: 'left' }}>Sign out</p>
              </button>
            </>

          ) : (
            <div style={{ ...CARD, alignItems: 'center', justifyContent: 'center', padding: '72px 20px', textAlign: 'center' }}>
              <Construction size={44} color="#A6AEC2" strokeWidth={1.75} />
              <p style={{ fontSize: 16, fontWeight: 800, color: '#1E2A44', marginTop: 14 }}>Coming soon</p>
              <p style={{ fontSize: 13, color: '#5B6B87', marginTop: 5, lineHeight: 1.6, maxWidth: 340 }}>This section is on the way.</p>
            </div>
          )}
        </div>{/* end inner flex column */}
        </div>{/* end content pane */}
      </div>

      {/* ════ BOTTOM NAV (mobile only) ════ */}
      {isMobile && (
        <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 100, background: '#fff', borderTop: '2.5px solid #1E2A44', display: 'flex', padding: '8px 6px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
          {NAV_GROUPS.map(group => {
            const isAct = activeNavGroup === group.id
            return (
              <button key={group.id} onClick={() => selectNav(group.id)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 2px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <group.Icon size={22} color={isAct ? '#D9720F' : '#1E2A44'} fill={isAct && group.id === 'home' ? '#D9720F' : 'none'} strokeWidth={isAct ? 2 : 1.8} />
                  {group.id === 'tests' && newTestCount > 0 && (
                    <span style={{ position: 'absolute', top: -4, right: -6, minWidth: 15, height: 15, borderRadius: 8, background: '#1E2A44', color: '#fff', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{newTestCount}</span>
                  )}
                </div>
                <span style={{ fontSize: 10.5, fontWeight: isAct ? 800 : 600, color: isAct ? '#D9720F' : '#1E2A44' }}>{group.label}</span>
                {isAct && (
                  <span style={{ width: 18, height: 3, borderRadius: 2, background: '#D9720F', marginTop: 1 }} />
                )}
              </button>
            )
          })}
        </nav>
      )}

      {/* ════ INTERESTS MODAL ════ */}
      {showInterests && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(30,42,68,0.55)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowInterests(false) }}>
          <div style={{ background: '#FFFFFF', border: '2.5px solid #1E2A44', borderRadius: 24, width: '100%', maxWidth: 480, margin: '0 16px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '2.5px solid rgba(30,42,68,0.18)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#D9720F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Pencil size={16} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#1E2A44' }}>My Interests</p>
                <p style={{ fontSize: 11.5, color: '#5B6B87', marginTop: 2 }}>Pick topics and AI will use them in your practice and catch-up plans</p>
              </div>
              <button onClick={() => setShowInterests(false)}
                style={{ background: 'rgba(30,42,68,0.06)', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <X size={15} color="#5B6B87" />
              </button>
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Preset chips */}
              <div>
                <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5B6B87', marginBottom: 12 }}>Choose your hobbies</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PRESET_INTERESTS.map(({ label, Icon }) => {
                    const sel = draftInterests.includes(label)
                    return (
                      <button key={label} onClick={() => togglePreset(label)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s', border: `3px solid ${sel ? '#2F8FE0' : '#1E2A44'}`, background: sel ? '#DCEBF8' : 'transparent', color: sel ? '#1E62A8' : '#5B6B87' }}>
                        <Icon size={14} />
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Custom input */}
              <div>
                <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5B6B87', marginBottom: 10 }}>Add your own</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustom()}
                    placeholder="e.g. Kabaddi, Painting…"
                    style={{ flex: 1, border: '3px solid #1E2A44', borderRadius: 12, padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', color: '#1E2A44', outline: 'none', background: '#fff' }}
                  />
                  <button onClick={addCustom}
                    style={{ padding: '9px 18px', borderRadius: 12, background: '#1E2A44', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    Add
                  </button>
                </div>
              </div>

              {/* Selected list */}
              {draftInterests.length > 0 && (
                <div>
                  <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5B6B87', marginBottom: 10 }}>Selected ({draftInterests.length})</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {draftInterests.map(i => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: '#DCEBF8', border: '2.5px solid #9CC3EA', fontSize: 12.5, fontWeight: 700, color: '#1E62A8' }}>
                        {i}
                        <button onClick={() => setDraftInterests(prev => prev.filter(x => x !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: '#1E62A8' }}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '2.5px solid rgba(30,42,68,0.18)', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={() => setShowInterests(false)}
                style={{ flex: 1, padding: '12px 0', borderRadius: 14, border: '3px solid #1E2A44', background: '#fff', color: '#5B6B87', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={saveInterests} disabled={savingInterests}
                style={{ flex: 2, padding: '12px 0', borderRadius: 14, border: 'none', background: '#D9720F', color: '#fff', fontSize: 13, fontWeight: 800, cursor: savingInterests ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: savingInterests ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                {savingInterests ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><CheckIcon size={14} /> Save Preferences</>}
              </button>
            </div>

          </div>
        </div>
      )}

      {activeNavGroup === 'home' && <PersonalityCorner isMobile={isMobile} />}

    </div>
  )
}
