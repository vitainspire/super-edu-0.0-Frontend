'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, ChevronRight, X,
  BookOpen, Users, Calendar, GraduationCap, Sparkles, type LucideIcon,
} from 'lucide-react'
import type { Class, Student, SyllabusTopic, TimetableEntry, Teacher } from '@/lib/types'
import { isTeachingProfileComplete } from '@/lib/logic/teaching-profile'

interface Props {
  teacherId: string
  teacher: Teacher | null
  classes: Class[]
  students: Student[]
  syllabusTopics: SyllabusTopic[]
  timetableEntries: TimetableEntry[]
  onCreateClass?: () => void
  hasAdmin?: boolean
}

interface Step {
  id: string
  Icon: LucideIcon
  title: string
  description: string
  buttonLabel: string
  done: boolean
  href: string
  action?: 'create-class'
}

export default function OnboardingChecklist({
  teacherId,
  teacher,
  classes,
  students,
  syllabusTopics,
  timetableEntries,
  onCreateClass,
  hasAdmin,
}: Props) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)

  const storageKey = `eduteach_onboarding_dismissed_${teacherId}`

  useEffect(() => {
    setMounted(true)
    setDismissed(localStorage.getItem(storageKey) === 'true')
  }, [storageKey])

  const firstClassId = classes[0]?.id ?? ''

  const allSteps: Step[] = [
    {
      id: 'class',
      Icon: GraduationCap,
      title: 'Create your first class',
      description: 'Add a class (e.g. Grade 5 Section A). Everything else — students, syllabus, attendance — lives inside a class.',
      buttonLabel: 'Create class',
      done: classes.length > 0,
      href: '',
      action: 'create-class',
    },
    {
      id: 'students',
      Icon: Users,
      title: 'Add students',
      description: 'Enrol students with their name and roll number. Add interests like cricket or music — the AI uses these to make lessons feel personal.',
      buttonLabel: 'Add students',
      done: students.filter(s => s.isActive).length > 0,
      href: firstClassId ? `/classes/${firstClassId}/students` : '',
    },
    {
      id: 'timetable',
      Icon: Calendar,
      title: 'Set up your timetable',
      description: 'Add your weekly class schedule. The Home screen will show today\'s periods automatically and your Morning Briefing will be more accurate.',
      buttonLabel: 'Open settings',
      done: timetableEntries.length > 0,
      href: '/settings',
    },
    {
      id: 'syllabus',
      Icon: BookOpen,
      title: 'Add your syllabus',
      description: 'Paste your topic list or upload a photo of your syllabus. AI will extract topics and build a week-by-week teaching plan.',
      buttonLabel: 'Add syllabus',
      done: syllabusTopics.length > 0,
      href: firstClassId ? `/classes/${firstClassId}/syllabus` : '',
    },
    {
      id: 'teaching-profile',
      Icon: Sparkles,
      title: 'Set up your Teaching Profile',
      description: 'Tell us how you like to teach — your role, goals, and favourite activities. Every Prep Material lesson will be personalized to match.',
      buttonLabel: 'Build my profile',
      done: isTeachingProfileComplete(teacher?.teachingProfile),
      href: '/profile/teaching',
    },
  ]

  // When admin manages the school, classes/students/timetable are handled by admin.
  // Only show the syllabus step to the teacher.
  const ADMIN_MANAGED_STEP_IDS = new Set(['class', 'students', 'timetable'])
  const steps = hasAdmin
    ? allSteps.filter(s => !ADMIN_MANAGED_STEP_IDS.has(s.id))
    : allSteps

  const completedCount = steps.filter(s => s.done).length
  const allDone = completedCount === steps.length
  const activeIndex = steps.findIndex(s => !s.done)
  const progressPct = Math.round((completedCount / steps.length) * 100)

  // Persist completion so checklist never reappears after all steps done
  useEffect(() => {
    if (allDone) localStorage.setItem(storageKey, 'true')
  }, [allDone, storageKey])

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'true')
    setDismissed(true)
  }

  const handleStepAction = (step: Step) => {
    if (step.action === 'create-class') {
      onCreateClass?.()
    } else if (step.href) {
      router.push(step.href)
    }
  }

  if (!mounted || dismissed || allDone || hasAdmin) return null

  return (
    <div className="rounded-3xl overflow-hidden animate-fade-up paper-card">

      {/* ── HEADER ─────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 relative overflow-hidden"
        style={{ background: 'var(--ink)' }}>

        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">
                Getting Started
              </p>
              <h2 className="text-white font-display font-bold text-base leading-tight">
                Set up your classroom
              </h2>
              <p className="text-white/50 text-xs mt-0.5">
                {completedCount} of {steps.length} steps complete
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="w-7 h-7 flex items-center justify-center rounded-full active:scale-90 transition-transform mt-0.5"
              style={{ background: 'rgba(255,255,255,0.12)' }}
              title="Skip setup guide"
            >
              <X size={13} className="text-white/70" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.15)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%`, background: '#EAC968' }}
            />
          </div>
        </div>
      </div>

      {/* ── STEPS ──────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid rgba(58,44,30,0.08)' }}>
        {steps.map((step, idx) => {
          const { Icon } = step
          const isDone   = step.done
          const isActive = idx === activeIndex
          const isPending = !isDone && !isActive

          return (
            <div
              key={step.id}
              className="flex items-start gap-3.5 px-5 py-4 transition-colors"
              style={{
                background: isActive ? 'rgba(170,205,234,0.18)' : 'transparent',
                borderBottom: idx < steps.length - 1 ? '1px solid rgba(58,44,30,0.08)' : 'none',
              }}
            >
              {/* Status icon */}
              <div className="shrink-0 mt-0.5">
                {isDone ? (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: '#DFF0DA' }}>
                    <CheckCircle2 size={20} style={{ color: '#5C8F52' }} />
                  </div>
                ) : isActive ? (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: '#DCEBF8' }}>
                    <Icon size={18} style={{ color: '#5B87AD' }} />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(58,44,30,0.05)' }}>
                    <Icon size={18} className="text-ink-faint" />
                  </div>
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold leading-snug ${
                  isDone    ? 'line-through' :
                  isActive  ? 'text-ink' :
                              'text-ink-faint'
                }`}
                  style={isDone ? { color: 'var(--ink-faint)', textDecorationColor: 'var(--ink-faint)' } : undefined}
                >
                  {step.title}
                </p>

                {/* Description only for active and done steps */}
                {(isActive || isDone) && (
                  <p className={`text-xs mt-1 leading-relaxed ${isDone ? 'text-ink-faint' : 'text-ink-soft'}`}>
                    {step.description}
                  </p>
                )}

                {/* CTA button — only for active step */}
                {isActive && (
                  <button
                    onClick={() => handleStepAction(step)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-xl active:scale-95 transition-transform"
                    style={{ background: 'var(--ink)' }}
                  >
                    {step.buttonLabel}
                    <ChevronRight size={11} strokeWidth={3} />
                  </button>
                )}
              </div>

              {/* Done badge */}
              {isDone && (
                <span className="shrink-0 mt-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5C8F52' }}>
                  Done
                </span>
              )}

              {/* Step number for pending */}
              {isPending && (
                <span className="shrink-0 mt-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-ink-faint"
                  style={{ background: 'rgba(58,44,30,0.06)' }}>
                  {idx + 1}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── FOOTER NOTE ────────────────────────────────── */}
      <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(58,44,30,0.08)', background: 'rgba(58,44,30,0.02)' }}>
        <p className="text-[11px] text-ink-faint leading-relaxed">
          Complete these steps to unlock the full EduTeach experience — daily AI briefings, lesson prep, early warnings, and catch-up plans.
        </p>
      </div>
    </div>
  )
}
