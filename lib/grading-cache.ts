import { ck, withCache } from './server-cache'

// Even at temperature 0, re-grading the exact same extracted answer against the
// exact same question/reference isn't guaranteed to produce an identical mark —
// this memoizes the FIRST grade for a given (question, reference, extracted
// answer) tuple so a re-submitted/duplicate scan of the same paper can never
// silently disagree with itself.
const GRADE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

export interface LongAnswerGradeResult {
  marksAwarded: number
  feedback: string
  errorType?: 'conceptual' | 'procedural' | 'careless' | null
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function getConsistentLongAnswerGrade(
  questionText: string,
  referenceAnswer: string | undefined,
  extractedAnswer: string,
  maxMarks: number,
  computeLiveGrade: () => LongAnswerGradeResult,
): Promise<LongAnswerGradeResult> {
  const key = ck('answer-grade-v1', questionText, referenceAnswer ?? '', normalize(extractedAnswer), maxMarks)
  const { value } = await withCache(key, GRADE_CACHE_TTL_SECONDS, async () => computeLiveGrade())
  return value
}
