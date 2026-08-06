import type { TeachingProfile, TeachingProfilePersonalization } from '../types'

export const EMPTY_TEACHING_PROFILE: TeachingProfile = {
  classroom: { language: [], classSize: '', resources: [] },
  teacherIdentity: { roles: [], goals: [], preferredActivities: [], comfortZones: [] },
  personalization: {
    stories: 'sometimes', games: 'sometimes', handsOn: 'sometimes', criticalThinking: 'sometimes',
    creativity: 'sometimes', realLife: 'sometimes', localCulture: 'sometimes', reflection: 'sometimes',
    exploration: 'sometimes',
  },
}

// Completion is based on the classroom + identity selections only — the
// personalization choices always carry a sensible default, so "have you touched
// them" isn't a meaningful signal of a completed profile.
function completionChecks(profile: TeachingProfile): boolean[] {
  return [
    profile.classroom.language.length > 0,
    !!profile.classroom.classSize,
    profile.classroom.resources.length > 0,
    profile.teacherIdentity.roles.length > 0,
    profile.teacherIdentity.goals.length > 0,
    profile.teacherIdentity.preferredActivities.length > 0,
    profile.teacherIdentity.comfortZones.length > 0,
  ]
}

export function teachingProfileCompletion(profile?: TeachingProfile | null): number {
  if (!profile) return 0
  const checks = completionChecks(profile)
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export function isTeachingProfileComplete(profile?: TeachingProfile | null): boolean {
  return teachingProfileCompletion(profile) === 100
}

const PERSONALIZATION_LABELS: Record<keyof TeachingProfilePersonalization, string> = {
  stories: 'storytelling',
  games: 'games',
  handsOn: 'hands-on activities',
  criticalThinking: 'critical thinking',
  creativity: 'creativity',
  realLife: 'real-life connections',
  localCulture: 'local culture references',
  reflection: 'student reflection',
  exploration: 'independent exploration',
}

// Keeps the always > often > sometimes > never gradient the teacher expressed
// instead of collapsing it to a binary emphasize/minimize. Each tier lists the
// styles at that frequency so the generator can lean *proportionally*: "rely
// heavily" on always-styles, "avoid" never-styles, and everything between.
// "sometimes" is intentionally omitted from the prompt — it's the neutral
// default (see EMPTY_TEACHING_PROFILE) and mentioning it would just add noise.
export function personalizationTiers(personalization?: TeachingProfilePersonalization | null) {
  const p = personalization ?? EMPTY_TEACHING_PROFILE.personalization
  const always: string[] = []
  const often: string[] = []
  const never: string[] = []
  for (const key of Object.keys(PERSONALIZATION_LABELS) as (keyof TeachingProfilePersonalization)[]) {
    const label = PERSONALIZATION_LABELS[key]
    const value = p[key]
    if (value === 'always') always.push(label)
    else if (value === 'often') often.push(label)
    else if (value === 'never') never.push(label)
  }
  return { always, often, never }
}

// Render the tiers as a single prompt line, or '' when the teacher left
// everything neutral (all "sometimes"). Only non-empty tiers appear.
export function personalizationTierLine(personalization?: TeachingProfilePersonalization | null): string {
  const { always, often, never } = personalizationTiers(personalization)
  const parts = [
    always.length > 0 && `Rely heavily on: ${always.join(', ')}.`,
    often.length > 0 && `Use regularly: ${often.join(', ')}.`,
    never.length > 0 && `Avoid: ${never.join(', ')}.`,
  ].filter(Boolean)
  return parts.join(' ')
}
