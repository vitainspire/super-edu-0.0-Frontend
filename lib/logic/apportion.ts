/**
 * Session-budget apportionment for the year plan.
 *
 * The AI estimator used to be asked to make ~100 numbers sum to an exact target
 * while also honouring a 5-session floor. For a large syllabus that is not just
 * hard, it is arithmetically impossible — 97 topics against 165 available
 * sessions cannot clear a floor of 5 (that alone needs 485) — so the model
 * abandoned the budget and returned a total of 847.
 *
 * The fix is to stop asking. The model supplies relative sizing; these helpers
 * turn that into an allocation that fits the year exactly, every time.
 */

/**
 * The largest per-topic floor a budget can actually afford.
 *
 * Returns 0 when there are more topics than sessions — a genuinely infeasible
 * syllabus, which callers should surface rather than paper over.
 */
export function affordableMinSessions(topicCount: number, totalSessions: number): number {
  if (topicCount <= 0) return 0
  return Math.max(0, Math.floor(totalSessions / topicCount))
}

/**
 * Split `total` across `weights` proportionally, so the parts sum to exactly
 * `total` and none falls below `min`.
 *
 * Largest-remainder apportionment: floor each proportional share, then hand the
 * rounding residue to the largest fractional parts. Ordering is monotonic —
 * a heavier weight never receives less than a lighter one — though ties within
 * one weight class do split, because a residue smaller than the topic count
 * cannot be shared evenly.
 *
 * `min` is applied as given; use `affordableMinSessions` to clamp it first.
 */
export function apportion(weights: number[], total: number, min: number): number[] {
  const n = weights.length
  if (n === 0) return []

  const extra = Math.max(0, total - n * min)
  const safe = weights.map(w => (Number.isFinite(w) && w > 0 ? w : 0))
  const wsum = safe.reduce((a, b) => a + b, 0)
  const shares = wsum > 0
    ? safe.map(w => (extra * w) / wsum)
    : safe.map(() => extra / n)

  const out = shares.map(s => min + Math.floor(s))
  const residue = extra - shares.reduce((a, s) => a + Math.floor(s), 0)
  const byFrac = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  for (let k = 0; k < residue; k++) out[byFrac[k].i] += 1
  return out
}
