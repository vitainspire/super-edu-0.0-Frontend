export function calculateMastery(scores: number[], totalMarks: number[]): number {
  if (scores.length === 0) return 0

  // Recent attempts weighted more â€” exponential weights
  const weights = scores.map((_, i) => Math.pow(1.5, i))
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  const weightedScore = scores.reduce((sum, score, i) => {
    return sum + (score / totalMarks[i]) * weights[i]
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
