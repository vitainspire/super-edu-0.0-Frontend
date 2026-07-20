import type { TopicMastery, Fingerprint, EnrichedMark } from '../types'

const STORY_KEYWORDS = ['story', 'poem', 'comprehension', 'essay', 'paragraph', 'grammar', 'language', 'reading', 'writing']
const FORMULA_KEYWORDS = ['algebra', 'equation', 'formula', 'calculation', 'geometry', 'theorem', 'arithmetic', 'fraction', 'decimal', 'ratio']

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function avg(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function variance(nums: number[]): number {
  if (!nums.length) return 0
  const mean = avg(nums)
  return avg(nums.map((n) => Math.pow(n - mean, 2)))
}

function linearSlope(values: number[]): number {
  if (values.length < 2) return 0
  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = avg(values)
  const num = values.reduce((s, y, x) => s + (x - xMean) * (y - yMean), 0)
  const den = values.reduce((s, _, x) => s + Math.pow(x - xMean, 2), 0)
  return den === 0 ? 0 : num / den
}

export function buildFingerprint(marks: EnrichedMark[], masteryData: TopicMastery[]): Fingerprint {
  if (marks.length === 0) {
    return {
      learningStyle: 'analytical',
      isConsistent: false,
      peakDay: 'Monday',
      strongTopics: [],
      weakTopics: [],
      improvementRate: 0,
      variance: 0,
    }
  }

  const storyAvg = avg(
    marks.filter((m) => STORY_KEYWORDS.some((k) => m.topic.toLowerCase().includes(k)))
      .map((m) => m.score / m.totalMarks)
  )
  const formulaAvg = avg(
    marks.filter((m) => FORMULA_KEYWORDS.some((k) => m.topic.toLowerCase().includes(k)))
      .map((m) => m.score / m.totalMarks)
  )
  const learningStyle = storyAvg > formulaAvg ? 'story-based' : 'analytical'

  const normalized = marks.map((m) => m.score / m.totalMarks)
  const v = variance(normalized)
  const isConsistent = v < 0.1

  const byDay: Record<number, number[]> = {}
  marks.forEach((m) => {
    const day = new Date(m.conductedOn).getDay()
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(m.score / m.totalMarks)
  })

  let peakDay = 'Monday'
  let maxAvg = -1
  Object.entries(byDay).forEach(([d, scores]) => {
    const a = avg(scores)
    if (a > maxAvg) { maxAvg = a; peakDay = DAYS[parseInt(d)] }
  })

  const strongTopics = masteryData.filter((t) => t.mastery >= 0.75).map((t) => t.topic)
  const weakTopics = masteryData.filter((t) => t.mastery < 0.5).map((t) => t.topic)
  const improvementRate = linearSlope(normalized)

  return { learningStyle, isConsistent, peakDay, strongTopics, weakTopics, improvementRate, variance: v }
}
