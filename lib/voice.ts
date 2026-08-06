// Thin wrapper around the browser's built-in Web Speech API — no new
// backend, no new cost, works today. SpeechRecognition (voice input) is only
// in Chromium browsers (Chrome, Edge) and isn't part of TypeScript's standard
// DOM lib, hence the local shape below instead of a global type; speechSynthesis
// (voice output) is standard and widely supported. Both are feature-detected
// at the call site — never assumed present.

const LANG_CODES: Record<string, string> = {
  english: 'en-IN',
  hindi: 'hi-IN',
  telugu: 'te-IN',
  tamil: 'ta-IN',
  kannada: 'kn-IN',
  marathi: 'mr-IN',
  bengali: 'bn-IN',
  gujarati: 'gu-IN',
  malayalam: 'ml-IN',
  punjabi: 'pa-IN',
  odia: 'or-IN',
  urdu: 'ur-IN',
}

/** Maps a teacher's free-text language preference (already used elsewhere,
 * e.g. lesson generation) to a BCP-47 code for speech recognition/synthesis.
 * Defaults to Indian English when unset or unrecognized. */
export function speechLangFor(preference?: string | null): string {
  return LANG_CODES[(preference ?? '').trim().toLowerCase()] ?? 'en-IN'
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechInputSupported = getSpeechRecognitionCtor() != null
export const speechOutputSupported = typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'

export type ListenError = 'not-allowed' | 'no-speech' | 'network' | 'other'

/** Listens once, calls onResult with the transcript, then calls onDone
 * exactly once — whether it succeeded, failed, or ended with nothing heard —
 * with a reason when it wasn't a clean success. Silently swallowing every
 * failure (the previous behaviour) meant a denied mic permission looked
 * identical to a working mic that just heard nothing: the button would flash
 * on then off with no explanation either way. Returns a stop() function, or
 * null if voice input isn't supported in this browser. */
export function listenOnce(
  lang: string,
  onResult: (text: string) => void,
  onDone: (error?: ListenError) => void,
): (() => void) | null {
  const Ctor = getSpeechRecognitionCtor()
  if (!Ctor) return null
  const recognition = new Ctor()
  recognition.lang = lang
  recognition.interimResults = false
  recognition.continuous = false

  let done = false
  let heard = false
  const finish = (error?: ListenError) => {
    if (done) return
    done = true
    onDone(error)
  }

  recognition.onresult = e => {
    const text = e.results?.[0]?.[0]?.transcript
    if (text) { heard = true; onResult(text) }
  }
  recognition.onerror = e => {
    const code = e?.error
    finish(
      code === 'not-allowed' || code === 'permission-denied' ? 'not-allowed'
        : code === 'no-speech' ? 'no-speech'
        : code === 'network' ? 'network'
        : 'other',
    )
  }
  recognition.onend = () => finish(heard ? undefined : 'no-speech')
  recognition.start()
  return () => recognition.stop()
}

/** Reads text aloud, cancelling anything already being spoken first so
 * answers can't queue up and talk over each other. No-op where unsupported.
 * The setTimeout is deliberate, not decorative — Chrome has a long-standing
 * bug where calling speak() in the same tick as cancel() silently drops the
 * utterance; a minimal delay avoids it. */
export function speak(text: string, lang: string) {
  if (!speechOutputSupported || !text.trim()) return
  window.speechSynthesis.cancel()
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    window.speechSynthesis.speak(utterance)
  }, 50)
}

export function stopSpeaking() {
  if (speechOutputSupported) window.speechSynthesis.cancel()
}
