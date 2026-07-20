// Rotates automatically by calendar date — no teacher or student ever picks
// a trait. Same trait for every student on a given date; only the story's
// setting/characters vary, via that student's interests.
export const PERSONALITY_TRAITS = [
  'Patience',
  'Empathy',
  'Kindness',
  'Perseverance',
  'Honesty',
  'Teamwork',
  'Gratitude',
  'Courage',
  'Responsibility',
  'Respect',
  'Self-Control',
  'Confidence',
] as const

export function todayDateStr(): string {
  return new Date().toISOString().split('T')[0]
}

function dayOfYear(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z')
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000) + 1
}

export function traitForDate(dateStr: string): string {
  return PERSONALITY_TRAITS[dayOfYear(dateStr) % PERSONALITY_TRAITS.length]
}
