// Flags a scanned paper for human review instead of silently auto-accepting
// whatever the AI extracted. None of this blocks saving — it's a signal shown
// alongside the score so a scanner/teacher knows to double-check before trusting it.

export interface PaperReview {
  needsReview: boolean
  reviewReason: string | null
}

export function assessPaperConfidence(
  breakdown: { awarded: number; max: number }[],
  extractedAnswers: string[],
): PaperReview {
  const totalQuestions = breakdown.length
  if (totalQuestions === 0) {
    return { needsReview: true, reviewReason: 'No questions could be extracted from the image.' }
  }

  const emptyCount = extractedAnswers.filter(a => !a.trim()).length
  const emptyRatio = emptyCount / totalQuestions
  const totalAwarded = breakdown.reduce((s, b) => s + b.awarded, 0)
  const totalMax = breakdown.reduce((s, b) => s + b.max, 0)

  // Nothing was read anywhere — could be a genuinely blank paper, or a failed
  // scan (bad photo, wrong page). Can't tell those apart automatically, so always flag.
  if (emptyRatio === 1) {
    return { needsReview: true, reviewReason: "Nothing was read off this paper — it may be blank, or the photo didn't scan well." }
  }
  // Mostly blank but not entirely — more likely a bad/partial photo than a half-attempted paper.
  if (emptyRatio >= 0.5) {
    return { needsReview: true, reviewReason: 'Most questions came back blank — the photo may be blurry, cropped, or poorly lit.' }
  }
  // The student wrote something everywhere but scored zero everywhere — that's
  // a suspicious grading outcome, distinct from a genuinely blank paper.
  if (totalAwarded === 0 && totalMax > 0) {
    return { needsReview: true, reviewReason: 'The student wrote answers but scored zero on all of them — worth a second look.' }
  }

  return { needsReview: false, reviewReason: null }
}
