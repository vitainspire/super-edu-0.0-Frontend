export function calculateMastery(scores: number[], totalMarks: number[]): number {
  // Drop attempts we can't turn into a percentage. A zero or missing total would
  // divide by zero and, because the result is only clamped from above, land on a
  // *perfect* 1.0 (Math.min(1, Infinity)) — silently recording a student as
  // having mastered a topic they may have failed.
  const attempts = scores
    .map((score, i) => ({ score, total: totalMarks[i] }))
    .filter(a => typeof a.total === 'number' && a.total > 0)

  if (attempts.length === 0) return 0

  // Recent attempts weighted more — exponential weights
  const weights = attempts.map((_, i) => Math.pow(1.5, i))
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  const weightedScore = attempts.reduce((sum, a, i) => {
    return sum + (a.score / a.total) * weights[i]
  }, 0)

  return Math.min(1, weightedScore / totalWeight)
}

export function getMasteryLabel(mastery: number): string {
  if (mastery === 0) return 'No data'
  if (mastery >= 0.75) return 'Strong'
  if (mastery >= 0.5) return 'Improving'
  return 'Needs Help'
}

export function getMasteryColor(mastery: number): string {
  if (mastery === 0) return 'text-slate-500 bg-slate-100'
  if (mastery >= 0.75) return 'text-green-700 bg-green-100'
  if (mastery >= 0.5) return 'text-yellow-700 bg-yellow-100'
  return 'text-red-700 bg-red-100'
}

export function getMasteryBarColor(mastery: number): string {
  if (mastery === 0) return 'bg-slate-300'
  if (mastery >= 0.75) return 'bg-green-500'
  if (mastery >= 0.5) return 'bg-yellow-500'
  return 'bg-red-500'
}
