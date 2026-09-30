'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import PageHeader from '@/components/theme/PageHeader'
import { EMPTY_TEACHING_PROFILE, teachingProfileCompletion } from '@/lib/logic/teaching-profile'
import type { TeachingProfile, ClassSize, PersonalizationFrequency } from '@/lib/types'
import { ChevronLeft, type LucideIcon } from 'lucide-react'
import { Check, Plus, Sparkles, ChevronRight, BookOpen, GraduationCap } from '@/components/ui/icons'
import clsx from 'clsx'

const LANGUAGE_OPTIONS = ['English', 'Telugu', 'Hindi', 'Bilingual']
const CLASS_SIZE_OPTIONS: { value: ClassSize; label: string }[] = [
  { value: '<20', label: 'Less than 20' },
  { value: '20-40', label: '20–40' },
  { value: '>40', label: 'More than 40' },
]
// Physical materials/kits a classroom may have — including the Teaching-Learning
// Materials (TLM) governments commonly supply to primary schools. Whatever the
// teacher ticks becomes the ONLY materials prep-material activities may use, so
// activities are always doable with what's actually in the room.
const RESOURCE_OPTIONS = [
  'Chalkboard', 'Whiteboard', 'Charts & Posters', 'Number / Place-value Charts',
  'Abacus', 'Counting Sticks / Beads', 'Building Blocks', 'Geometry Box',
  'Flashcards', 'Maps & Globe', 'Weighing Balance', 'Measuring Tape / Scale',
  'Play Money (Notes & Coins)', 'Dice & Number Cards', 'Storybooks', 'Science Kit',
  'Activity / Craft Materials', 'Projector', 'Outdoor Space',
]

const ROLE_OPTIONS = [
  { label: 'Educator', sub: 'Simplify concepts' },
  { label: 'Mentor', sub: 'Build confidence' },
  { label: 'Guide', sub: 'Encourage thinking' },
  { label: 'Influencer', sub: 'Connect learning with life' },
  { label: 'Counselor', sub: 'Help students discover strengths' },
]
const GOAL_OPTIONS = [
  'Understand deeply', 'Stay curious', 'Think critically', 'Build confidence',
  'Communicate better', 'Work together', 'Be creative', 'Apply learning to real life', 'Discover their interests',
]
const ACTIVITY_OPTIONS = [
  'Stories', 'Games', 'Group Activities', 'Discussions', 'Demonstrations',
  'Real-life Examples', 'Art & Creativity', 'Experiments', 'Role Play',
]
const COMFORT_OPTIONS = [
  'Speaking in front of the class', 'Group discussions', 'Moving around the classroom',
  'Improvising activities', 'Drawing on the board', 'Using technology',
]

const FREQUENCY_OPTIONS: PersonalizationFrequency[] = ['never', 'sometimes', 'often', 'always']
const FREQUENCY_LABELS: Record<PersonalizationFrequency, string> = {
  never: 'Never', sometimes: 'Sometimes', often: 'Often', always: 'Always',
}

const PERSONALIZATION_DIMENSIONS: { key: keyof TeachingProfile['personalization']; label: string }[] = [
  { key: 'stories', label: 'Stories' },
  { key: 'games', label: 'Games' },
  { key: 'handsOn', label: 'Hands-on Activities' },
  { key: 'criticalThinking', label: 'Critical Thinking' },
  { key: 'creativity', label: 'Creativity' },
  { key: 'realLife', label: 'Real-life Connections' },
  { key: 'localCulture', label: 'Local Culture' },
  { key: 'reflection', label: 'Student Reflection' },
  { key: 'exploration', label: 'Independent Exploration' },
]

// One screen per necessary input — Typeform-style. Multi-select steps show a
// Next button (so the teacher can pick several options before advancing);
// the single-choice class-size step auto-advances the instant it's picked.
const STEPS = ['language', 'classSize', 'resources', 'roles', 'goals', 'activities', 'comfortZones', 'personalize'] as const
type StepId = typeof STEPS[number]

const STEP_META: Record<StepId, { icon: LucideIcon; title: string }> = {
  language:    { icon: BookOpen, title: 'About My Classroom' },
  classSize:   { icon: BookOpen, title: 'About My Classroom' },
  resources:   { icon: BookOpen, title: 'About My Classroom' },
  roles:       { icon: GraduationCap, title: 'About My Teaching' },
  goals:       { icon: GraduationCap, title: 'About My Teaching' },
  activities:  { icon: GraduationCap, title: 'About My Teaching' },
  comfortZones:{ icon: GraduationCap, title: 'About My Teaching' },
  personalize: { icon: Sparkles, title: 'Personalize My Lessons' },
}

function isStepSatisfied(id: StepId, p: TeachingProfile): boolean {
  switch (id) {
    case 'language': return p.classroom.language.length > 0
    case 'classSize': return !!p.classroom.classSize
    case 'resources': return p.classroom.resources.length > 0
    case 'roles': return p.teacherIdentity.roles.length > 0
    case 'goals': return p.teacherIdentity.goals.length > 0
    case 'activities': return p.teacherIdentity.preferredActivities.length > 0
    case 'comfortZones': return p.teacherIdentity.comfortZones.length > 0
    case 'personalize': return true
  }
}

function firstIncompleteStep(p: TeachingProfile): number {
  const idx = STEPS.findIndex(s => s !== 'personalize' && !isStepSatisfied(s, p))
  return idx === -1 ? STEPS.length - 1 : idx
}

function toggle<T>(arr: T[], value: T, max?: number): T[] {
  if (arr.includes(value)) return arr.filter(v => v !== value)
  if (max && arr.length >= max) return arr
  return [...arr, value]
}

function Chip({ label, sub, selected, disabled, onClick }: { label: string; sub?: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !selected}
      className={clsx(
        'px-3.5 py-2 rounded-2xl text-left transition-colors',
        disabled && !selected && 'opacity-40',
      )}
      style={selected
        ? { background: 'var(--ink)', color: 'var(--paper-soft)' }
        : { background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}
    >
      <span className="text-sm font-bold block">{label}</span>
      {sub && <span className="text-[10px] block mt-0.5" style={{ color: selected ? 'rgba(255,255,255,0.7)' : 'var(--ink-faint)' }}>{sub}</span>}
    </button>
  )
}

export default function TeachingProfilePage() {
  const router = useRouter()
  const { teacher, updateTeacherSettings } = useApp()

  const [profile, setProfile] = useState<TeachingProfile>(EMPTY_TEACHING_PROFILE)
  const [stepIndex, setStepIndex] = useState(0)
  const [dir, setDir] = useState(1)
  const [customLanguage, setCustomLanguage] = useState('')
  const [customResource, setCustomResource] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Seed from the saved profile once, and resume at the first unanswered step.
  useEffect(() => {
    if (hydrated) return
    const initial = teacher?.teachingProfile ?? EMPTY_TEACHING_PROFILE
    setProfile(initial)
    setStepIndex(firstIncompleteStep(initial))
    setHydrated(true)
  }, [teacher, hydrated])

  const completion = teachingProfileCompletion(profile)
  const stepId = STEPS[stepIndex]
  const meta = STEP_META[stepId]
  const satisfied = isStepSatisfied(stepId, profile)

  function go(next: number, direction: number) {
    setDir(direction)
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, next)))
  }
  const next = () => go(stepIndex + 1, 1)
  const back = () => go(stepIndex - 1, -1)

  function setClassroom<K extends keyof TeachingProfile['classroom']>(key: K, value: TeachingProfile['classroom'][K]) {
    setProfile(p => ({ ...p, classroom: { ...p.classroom, [key]: value } }))
  }
  function setIdentity<K extends keyof TeachingProfile['teacherIdentity']>(key: K, value: TeachingProfile['teacherIdentity'][K]) {
    setProfile(p => ({ ...p, teacherIdentity: { ...p.teacherIdentity, [key]: value } }))
  }
  function setFrequency(key: keyof TeachingProfile['personalization'], value: PersonalizationFrequency) {
    setProfile(p => ({ ...p, personalization: { ...p.personalization, [key]: value } }))
  }

  function addCustomLanguage() {
    const v = customLanguage.trim()
    if (!v) return
    if (!profile.classroom.language.includes(v)) setClassroom('language', [...profile.classroom.language, v])
    setCustomLanguage('')
  }

  function addCustomResource() {
    const v = customResource.trim()
    if (!v) return
    if (!profile.classroom.resources.includes(v)) setClassroom('resources', [...profile.classroom.resources, v])
    setCustomResource('')
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateTeacherSettings({ teachingProfile: profile })
      setSaved(true)
      setTimeout(() => { setSaved(false); router.push('/profile') }, 1200)
    } finally {
      setSaving(false)
    }
  }

  const stepAnim = { animation: `${dir >= 0 ? 'tpSlideR' : 'tpSlideL'} .3s ease` }

  return (
    <div className="paper-page pb-28">
      <style>{`
        @keyframes tpSlideR { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes tpSlideL { from { transform: translateX(-24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      `}</style>
      <PageHeader
        title="Teaching Profile"
        eyebrow={`${completion}% Complete`}
        subtitle="Help us understand how you teach. We'll personalize every lesson to match your classroom and teaching style."
      />

      <div className="px-5 pt-2 space-y-5 relative z-10" style={{ overflowX: 'hidden' }}>

        {/* Step dots */}
        <div className="flex items-center gap-3">
          {stepIndex > 0 && (
            <button type="button" onClick={back} className="flex items-center gap-1 text-sm font-bold text-ink-soft hover:text-ink transition-colors shrink-0">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          <div className="flex items-center gap-1 ml-auto flex-wrap justify-end">
            {STEPS.map((s, i) => (
              <span key={s} className="h-1.5 rounded-full transition-all"
                style={{ width: i === stepIndex ? 18 : 6, background: i <= stepIndex ? 'var(--ink)' : 'rgba(15,23,42,0.15)' }} />
            ))}
          </div>
        </div>

        <div key={stepIndex} style={stepAnim} className="paper-card p-5 space-y-4">
          <h2 className="font-display font-bold text-ink flex items-center gap-2"><meta.icon className="w-4 h-4 text-ink-soft" /> {meta.title}</h2>

          {stepId === 'language' && (
            <div>
              <p className="label mb-2">My classroom language</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {LANGUAGE_OPTIONS.map(l => (
                  <Chip key={l} label={l} selected={profile.classroom.language.includes(l)}
                    onClick={() => setClassroom('language', toggle(profile.classroom.language, l))} />
                ))}
                {profile.classroom.language.filter(l => !LANGUAGE_OPTIONS.includes(l)).map(l => (
                  <Chip key={l} label={l} selected onClick={() => setClassroom('language', profile.classroom.language.filter(x => x !== l))} />
                ))}
              </div>
              <div className="flex gap-2">
                <input value={customLanguage} onChange={e => setCustomLanguage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomLanguage())}
                  placeholder="Other language…" className="input-field flex-1"
                  style={{ background: '#fff', border: '2px solid var(--card-border)' }} />
                <button type="button" onClick={addCustomLanguage} disabled={!customLanguage.trim()}
                  className="px-3 py-2 rounded-xl disabled:opacity-40" style={{ background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {stepId === 'classSize' && (
            <div>
              <p className="label mb-2">My typical class size</p>
              <div className="flex flex-col gap-2">
                {CLASS_SIZE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => { setClassroom('classSize', opt.value); setTimeout(next, 200) }}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-left transition-colors"
                    style={{ background: profile.classroom.classSize === opt.value ? 'rgba(15,23,42,0.06)' : 'transparent', border: '2px solid var(--card-border)' }}>
                    <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                      style={{ borderColor: profile.classroom.classSize === opt.value ? 'var(--ink)' : 'rgba(15,23,42,0.3)' }}>
                      {profile.classroom.classSize === opt.value && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--ink)' }} />}
                    </span>
                    <span className="text-sm font-semibold text-ink">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {stepId === 'resources' && (
            <div>
              <p className="label mb-1">Physical materials &amp; kits in my classroom</p>
              <p className="text-xs text-ink-faint mb-3">Tick everything actually present — including anything the school or government provided. Lessons will build activities around exactly these, and never ask for anything you don&apos;t have.</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {RESOURCE_OPTIONS.map(r => (
                  <Chip key={r} label={r} selected={profile.classroom.resources.includes(r)}
                    onClick={() => setClassroom('resources', toggle(profile.classroom.resources, r))} />
                ))}
                {profile.classroom.resources.filter(r => !RESOURCE_OPTIONS.includes(r)).map(r => (
                  <Chip key={r} label={r} selected onClick={() => setClassroom('resources', profile.classroom.resources.filter(x => x !== r))} />
                ))}
              </div>
              <div className="flex gap-2">
                <input value={customResource} onChange={e => setCustomResource(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomResource())}
                  placeholder="Add anything else you have (e.g. Dienes blocks, seed packets)…" className="input-field flex-1"
                  style={{ background: '#fff', border: '2px solid var(--card-border)' }} />
                <button type="button" onClick={addCustomResource} disabled={!customResource.trim()}
                  className="px-3 py-2 rounded-xl disabled:opacity-40" style={{ background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {stepId === 'roles' && (
            <div>
              <p className="label mb-2">I see myself as <span className="font-normal text-ink-faint normal-case">(choose up to 2)</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROLE_OPTIONS.map(r => (
                  <Chip key={r.label} label={r.label} sub={r.sub}
                    selected={profile.teacherIdentity.roles.includes(r.label)}
                    disabled={profile.teacherIdentity.roles.length >= 2}
                    onClick={() => setIdentity('roles', toggle(profile.teacherIdentity.roles, r.label, 2))} />
                ))}
              </div>
            </div>
          )}

          {stepId === 'goals' && (
            <div>
              <p className="label mb-2">I want my students to... <span className="font-normal text-ink-faint normal-case">(choose up to 3)</span></p>
              <div className="flex flex-wrap gap-2">
                {GOAL_OPTIONS.map(g => (
                  <Chip key={g} label={g}
                    selected={profile.teacherIdentity.goals.includes(g)}
                    disabled={profile.teacherIdentity.goals.length >= 3}
                    onClick={() => setIdentity('goals', toggle(profile.teacherIdentity.goals, g, 3))} />
                ))}
              </div>
            </div>
          )}

          {stepId === 'activities' && (
            <div>
              <p className="label mb-2">I enjoy using <span className="font-normal text-ink-faint normal-case">(choose up to 4)</span></p>
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_OPTIONS.map(a => (
                  <Chip key={a} label={a}
                    selected={profile.teacherIdentity.preferredActivities.includes(a)}
                    disabled={profile.teacherIdentity.preferredActivities.length >= 4}
                    onClick={() => setIdentity('preferredActivities', toggle(profile.teacherIdentity.preferredActivities, a, 4))} />
                ))}
              </div>
            </div>
          )}

          {stepId === 'comfortZones' && (
            <div>
              <p className="label mb-2">I&apos;m comfortable with</p>
              <div className="flex flex-wrap gap-2">
                {COMFORT_OPTIONS.map(c => (
                  <Chip key={c} label={c} selected={profile.teacherIdentity.comfortZones.includes(c)}
                    onClick={() => setIdentity('comfortZones', toggle(profile.teacherIdentity.comfortZones, c))} />
                ))}
              </div>
            </div>
          )}

          {stepId === 'personalize' && (
            <div>
              <p className="text-xs text-ink-faint -mt-1 mb-3">How often should the AI include these in your lessons?</p>
              <div className="space-y-4">
                {PERSONALIZATION_DIMENSIONS.map(dim => (
                  <div key={dim.key}>
                    <span className="text-sm font-semibold text-ink block mb-1.5">{dim.label}</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {FREQUENCY_OPTIONS.map(freq => {
                        const selected = profile.personalization[dim.key] === freq
                        return (
                          <button
                            key={freq}
                            type="button"
                            onClick={() => setFrequency(dim.key, freq)}
                            className="py-2 rounded-xl text-[11px] font-bold text-center transition-colors"
                            style={selected
                              ? { background: 'var(--ink)', color: 'var(--paper-soft)' }
                              : { background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}
                          >
                            {FREQUENCY_LABELS[freq]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Next / Save */}
        {stepId !== 'classSize' && (
          stepId === 'personalize' ? (
            <button type="button" onClick={handleSave} disabled={saving}
              className="paper-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
              {saved ? <><Check className="w-4 h-4" /> Saved!</> : saving ? 'Saving…' : <><Sparkles className="w-4 h-4" /> Save Profile</>}
            </button>
          ) : (
            <button type="button" onClick={next} disabled={!satisfied}
              className="paper-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )
        )}

        {stepId === 'personalize' && (
          <p className="text-xs text-ink-faint text-center -mt-2">
            Your preferences will be used to generate personalized lesson experiences for every chapter you teach. You can update them anytime.
          </p>
        )}
      </div>
    </div>
  )
}
