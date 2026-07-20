import type { TopicMastery, PotentialSignal } from '../types'

function avg(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function variance(nums: number[]): number {
  if (!nums.length) return 0
  const mean = avg(nums)
  return avg(nums.map((n) => Math.pow(n - mean, 2)))
}

export function detectHiddenPotential(
  masteryData: TopicMastery[],
  avgMastery: number,
  studentImprovementRate: number,
  classImprovementRate: number
): PotentialSignal | null {
  if (masteryData.length < 2) return null

  const masteryValues = masteryData.map((t) => t.mastery)
  const topicVariance = variance(masteryValues)
  const strongTopics = masteryData.filter((t) => t.mastery >= 0.75).map((t) => t.topic)
  const weakTopics = masteryData.filter((t) => t.mastery < 0.5).map((t) => t.topic)

  // Signal 1: Uneven profile — strong in some topics, weak in others
  if (topicVariance > 0.04 && avgMastery < 0.6 && strongTopics.length > 0) {
    return {
      type: 'uneven_profile',
      data: { strongTopics, weakTopics, variance: topicVariance },
    }
  }

  // Signal 2: Improving faster than class average
  if (classImprovementRate > 0 && studentImprovementRate > classImprovementRate * 1.5) {
    return {
      type: 'fast_learner',
      data: { studentRate: studentImprovementRate, classRate: classImprovementRate },
    }
  }

  // Signal 3: One topic with very high mastery despite overall struggle
  const topicSpike = masteryData.find((t) => t.mastery >= 0.85 && avgMastery < 0.55)
  if (topicSpike) {
    return {
      type: 'topic_spike',
      data: { topic: topicSpike.topic, mastery: topicSpike.mastery, avgMastery },
    }
  }

  return null
}
