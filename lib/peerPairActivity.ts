import { callAI } from './ai'

const FALLBACK_ACTIVITY = 'Take turns explaining one tricky problem to each other and see what clicks.'

// Generates a short, concrete activity for two students who just became study
// buddies. Best-effort — a generation failure falls back to a generic activity
// rather than blocking the pairing from being confirmed.
export async function generatePeerActivity(
  subject: string | undefined,
  nameA: string,
  nameB: string,
  sharedInterest?: string,
): Promise<string> {
  const subjectLine = subject ? `Subject: ${subject}` : 'General study partnership (no single subject).'
  const interestLine = sharedInterest ? `They both like: ${sharedInterest}.` : ''

  const prompt = `Two schoolchildren, ${nameA} and ${nameB}, just became study buddies.
${subjectLine}
${interestLine}

Suggest ONE short, concrete activity they can do together in class, in one simple sentence (max 15 words). Make it specific and fun, not generic advice like "help each other."

Return ONLY valid JSON: { "activity": "string" }`

  try {
    const text = await callAI([{ role: 'user', content: prompt }], { maxTokens: 100, timeoutMs: 20_000 })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    return typeof parsed.activity === 'string' && parsed.activity.trim() ? parsed.activity.trim() : FALLBACK_ACTIVITY
  } catch {
    return FALLBACK_ACTIVITY
  }
}
