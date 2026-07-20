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

// "Often"/"Always" become an emphasis cue, "Never" a minimize cue — "Sometimes"
// is neutral and omitted, so the prompt only mentions what actually matters.
export function personalizationEmphasis(personalization?: TeachingProfilePersonalization | null) {
  const p = personalization ?? EMPTY_TEACHING_PROFILE.personalization
  const emphasize: string[] = []
  const minimize: string[] = []
  for (const key of Object.keys(PERSONALIZATION_LABELS) as (keyof TeachingProfilePersonalization)[]) {
    const value = p[key]
    if (value === 'often' || value === 'always') emphasize.push(PERSONALIZATION_LABELS[key])
    else if (value === 'never') minimize.push(PERSONALIZATION_LABELS[key])
  }
  return { emphasize, minimize }
}
