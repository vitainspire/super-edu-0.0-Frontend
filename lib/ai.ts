const API_KEY        = process.env.OPENROUTER_API_KEY        || ''
const MODEL          = process.env.OPENROUTER_MODEL          || 'google/gemini-2.5-flash'
const FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || 'meta-llama/llama-3.1-8b-instruct:free'
const IMAGE_MODEL     = process.env.OPENROUTER_IMAGE_MODEL     || 'google/gemini-2.5-flash-image'

type ContentPart =
  | { type: 'text';      text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface AIMessage {
  role:    'user' | 'assistant' | 'system'
  content: string | ContentPart[]
}

export interface AIOptions {
  jsonMode?:    boolean   // default true  — adds response_format: { type: 'json_object' }
  maxTokens?:   number
  temperature?: number    // default 0.7
  timeoutMs?:   number    // default 45 000 ms — vision calls may want 90 000
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────
// Opens after FAILURE_THRESHOLD consecutive failures; auto-resets after RESET_MS.
const FAILURE_THRESHOLD = 3
const RESET_MS          = 60_000

let failures  = 0
let openSince = 0   // epoch ms when circuit opened (0 = closed)

function circuitOpen(): boolean {
  if (openSince === 0) return false
  if (Date.now() - openSince > RESET_MS) {
    // Half-open: allow one probe through
    failures  = 0
    openSince = 0
    return false
  }
  return true
}

function onSuccess() { failures = 0; openSince = 0 }

function onFailure() {
  failures++
  if (failures >= FAILURE_THRESHOLD) openSince = Date.now()
}

// ─── Internal model caller ───────────────────────────────────────────────────

async function callModel(
  model: string,
  messages: AIMessage[],
  options: AIOptions,
  useJsonMode: boolean,
): Promise<string> {
  const { maxTokens, temperature = 0.7, timeoutMs = 45_000 } = options

  const body: Record<string, unknown> = { model, messages, temperature }
  if (useJsonMode) body.response_format = { type: 'json_object' }
  if (maxTokens)   body.max_tokens      = maxTokens

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://eduteach.app',
        'X-Title':      'EduTeach',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`AI request timed out after ${timeoutMs / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI error ${response.status}: ${err}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

// ─── Retry with exponential backoff ──────────────────────────────────────────

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// Strip markdown code fences that free models sometimes wrap around JSON output.
function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  return m ? m[1] : s
}

/**
 * Single entry point for all AI calls.
 *
 * Circuit breaker: opens after 3 consecutive failures, auto-resets in 60 s.
 * Retry/backoff: primary fails → wait 1 s → try fallback.
 * onFailure() is called exactly once per callAI invocation that exhausts all models,
 * so the failure threshold maps 1:1 to request failures, not model-call failures.
 * Fallback: free model — response_format is omitted, but fences are stripped so
 * callers can safely JSON.parse the return value regardless of which model responded.
 */
export async function callAI(messages: AIMessage[], options: AIOptions = {}): Promise<string> {
  const { jsonMode = true } = options

  if (circuitOpen()) {
    throw new Error('[ai] Circuit breaker is open — AI service temporarily unavailable')
  }

  try {
    const result = await callModel(MODEL, messages, options, jsonMode)
    onSuccess()
    return result
  } catch (primaryErr) {
    console.warn(`[ai] ${MODEL} failed, trying fallback after 1 s: ${primaryErr}`)

    await delay(1000)

    try {
      const raw = await callModel(FALLBACK_MODEL, messages, options, false)
      onSuccess()
      // Free models may wrap output in ```json fences — strip them so callers
      // can always call JSON.parse on the result without a SyntaxError.
      return stripFences(raw)
    } catch (fallbackErr) {
      // Count one failure for the entire callAI invocation (not per model tried).
      onFailure()
      await delay(2000)
      throw new Error(`[ai] Both models failed. Primary: ${primaryErr}. Fallback: ${fallbackErr}`)
    }
  }
}

/**
 * Generates an illustration via an OpenRouter image-capable model.
 * Returns null on any failure (missing key, timeout, model declined) so callers
 * can render text-only content rather than surfacing an error.
 */
export async function generateIllustration(
  prompt: string,
  options: { timeoutMs?: number } = {},
): Promise<{ url: string } | null> {
  if (!API_KEY) return null

  const { timeoutMs = 30_000 } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://eduteach.app',
        'X-Title':      'EduTeach',
      },
      body: JSON.stringify({
        model:      IMAGE_MODEL,
        messages:   [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
      }),
      signal: controller.signal,
    })
    if (!response.ok) return null

    const data = await response.json()
    const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url
    return typeof url === 'string' && url ? { url } : null
  } catch (err) {
    console.warn(`[ai] illustration generation failed: ${err}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}
