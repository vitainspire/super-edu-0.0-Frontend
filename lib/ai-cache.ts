/**
 * Client-side localStorage cache for AI responses.
 * Survives tab close and page refresh — far more durable than sessionStorage.
 * Keys are namespaced and hashed so different inputs never collide.
 */

const PREFIX = 'eduteach_ai_'
const MAX_KEYS = 60   // evict oldest 10 when limit hit to keep storage lean

function hash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

export function aiKey(namespace: string, params: object): string {
  return PREFIX + namespace + '_' + hash(JSON.stringify(params))
}

export function getAiCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { v, exp } = JSON.parse(raw) as { v: T; exp: number }
    if (Date.now() > exp) { localStorage.removeItem(key); return null }
    return v
  } catch { return null }
}

export function setAiCache<T>(key: string, value: T, ttlMs: number): void {
  if (typeof window === 'undefined') return
  try {
    const aiKeys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX))
    if (aiKeys.length >= MAX_KEYS) aiKeys.slice(0, 10).forEach(k => localStorage.removeItem(k))
    localStorage.setItem(key, JSON.stringify({ v: value, exp: Date.now() + ttlMs }))
  } catch { /* storage full — skip silently */ }
}

// Common TTLs in milliseconds
export const TTL = {
  ONE_DAY:    1000 * 60 * 60 * 24,
  THREE_DAYS: 1000 * 60 * 60 * 24 * 3,
  ONE_WEEK:   1000 * 60 * 60 * 24 * 7,
  ONE_MONTH:  1000 * 60 * 60 * 24 * 30,
}
