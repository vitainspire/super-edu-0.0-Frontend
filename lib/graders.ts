/**
 * Local graders for MCQ, fill-in-blank, and short-answer questions.
 * These run without any LLM call — fast, deterministic, and free.
 * Only long-answer questions are sent to the LLM.
 */

export interface GradeResult {
  marksAwarded: number
  feedback: string
}

// ─── MCQ ─────────────────────────────────────────────────────────────────────
// Extract the letter the student wrote/circled, compare to correct answer.
// Accepts: "C", "c.", "(C)", "c)", "C. Earth", "option c"
export function gradeMcq(
  scanned: string,
  correctAnswer: string,
  maxMarks: number,
): GradeResult {
  if (!scanned?.trim()) return { marksAwarded: 0, feedback: 'No answer written' }
  const norm = scanned.trim().toUpperCase()
  const match = norm.match(/\b([A-D])\b/) ?? norm.match(/([A-D])/)
  const letter = match?.[1] ?? ''
  if (!letter) return { marksAwarded: 0, feedback: 'Answer not readable' }
  const correct = correctAnswer.trim().toUpperCase()
  return letter === correct
    ? { marksAwarded: maxMarks, feedback: 'Correct' }
    : { marksAwarded: 0, feedback: `Incorrect — answer is ${correct}` }
}

// ─── Fill in the Blank ────────────────────────────────────────────────────────
// Fuzzy match: exact → full marks, small typo/OCR error → full marks,
// substring match → half marks, no match → 0.
export function gradeFib(
  scanned: string,
  correctAnswer: string,
  maxMarks: number,
): GradeResult {
  if (!scanned?.trim()) return { marksAwarded: 0, feedback: 'No answer written' }
  if (!correctAnswer?.trim()) return { marksAwarded: Math.round(maxMarks * 0.5), feedback: 'Could not verify' }

  const norm = (s: string) =>
    s.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ')
  const a = norm(scanned)
  const b = norm(correctAnswer)

  if (a === b) return { marksAwarded: maxMarks, feedback: 'Correct' }

  const dist = levenshtein(a, b)
  const threshold = Math.max(2, Math.floor(b.length * 0.2))
  if (dist <= threshold) return { marksAwarded: maxMarks, feedback: 'Correct (minor spelling)' }

  if (a.includes(b) || b.includes(a)) {
    return { marksAwarded: Math.round(maxMarks * 0.5), feedback: 'Partially correct' }
  }

  return { marksAwarded: 0, feedback: `Incorrect — answer: ${correctAnswer}` }
}

// ─── Short Answer ─────────────────────────────────────────────────────────────
// Keyword presence check: ≥75% keywords → full marks, ≥50% → 60%, ≥25% → 25%, else → 0.
// If no keywords stored, award half marks as benefit of doubt.
export function gradeShortAnswer(
  scanned: string,
  keywords: string[],
  maxMarks: number,
): GradeResult {
  if (!scanned?.trim()) return { marksAwarded: 0, feedback: 'No answer written' }

  if (!keywords?.length) {
    return {
      marksAwarded: Math.round(maxMarks * 0.5),
      feedback: 'Partially awarded — no key terms to verify against',
    }
  }

  const norm = (s: string) => s.toLowerCase().trim().replace(/[^\w\s]/g, '')
  const text = norm(scanned)
  const matched = keywords.filter(kw => text.includes(norm(kw)))
  const ratio = matched.length / keywords.length

  if (ratio >= 0.75) return { marksAwarded: maxMarks, feedback: 'Key concepts present' }
  if (ratio >= 0.5)  return { marksAwarded: Math.round(maxMarks * 0.6), feedback: 'Most key concepts present' }
  if (ratio >= 0.25) return { marksAwarded: Math.round(maxMarks * 0.25), feedback: 'Few key concepts mentioned' }
  return { marksAwarded: 0, feedback: 'Key concepts missing' }
}

// ─── Levenshtein distance ─────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
