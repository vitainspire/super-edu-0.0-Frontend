// ─── Upstash Redis rate limiting with in-memory fallback ─────────────────────
// On Vercel each worker has its own in-memory Map, so a single IP can exceed
// the limit by spinning up multiple instances. Upstash Redis is shared across
// all workers and enforces the limit globally.
// Falls back to in-memory automatically when UPSTASH_REDIS_REST_URL is unset
// (local dev, preview deploys, or if Upstash is temporarily unreachable).

export { getClientIp } from './logger'

// ─── In-memory fallback ───────────────────────────────────────────────────────

const WINDOW_MS = 60 * 60 * 1000  // 1 hour

interface Entry { count: number; windowStart: number }
const stores = {
  standard: new Map<string, Entry>(),
  vision:   new Map<string, Entry>(),
  auth:     new Map<string, Entry>(),
}

function checkInMemory(ip: string, max: number, store: Map<string, Entry>): { allowed: boolean; remaining: number } {
  const now   = Date.now()
  const entry = store.get(ip)
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now })
    return { allowed: true, remaining: max - 1 }
  }
  if (entry.count >= max) return { allowed: false, remaining: 0 }
  entry.count++
  return { allowed: true, remaining: max - entry.count }
}

// ─── Upstash limiter (lazily initialised per tier) ────────────────────────────

type UpstashLimiter = { limit: (id: string) => Promise<{ success: boolean; remaining: number }> }
const limiters: Record<string, UpstashLimiter | null | 'uninit'> = {
  standard: 'uninit',
  vision:   'uninit',
  auth:     'uninit',
}

async function getLimiter(tier: 'standard' | 'vision' | 'auth'): Promise<UpstashLimiter | null> {
  if (limiters[tier] !== 'uninit') return limiters[tier] as UpstashLimiter | null
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) { limiters[tier] = null; return null }
  try {
    const { Redis }     = await import('@upstash/redis')
    const { Ratelimit } = await import('@upstash/ratelimit')
    const max = tier === 'vision' ? 20 : tier === 'auth' ? 10 : 60
    limiters[tier] = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(max, '1 h'),
      prefix: `eduteach:rl:${tier}`,
    }) as unknown as UpstashLimiter
    return limiters[tier] as UpstashLimiter
  } catch (e) {
    console.warn(`[rate-limit] Upstash init failed for tier=${tier}, using in-memory fallback:`, e)
    limiters[tier] = null
    return null
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Standard routes: 60 requests per hour per IP
export async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const lim = await getLimiter('standard')
  if (!lim) return checkInMemory(ip, 60, stores.standard)
  try {
    const result = await lim.limit(ip)
    return { allowed: result.success, remaining: result.remaining }
  } catch (e) {
    // Upstash unreachable — fail open but log so we know the global limiter is down
    console.warn('[rate-limit] Upstash unavailable, falling back to per-instance memory (standard):', e)
    return checkInMemory(ip, 60, stores.standard)
  }
}

// Vision routes: 20 requests per hour per IP (vision calls are 5-10x more expensive)
export async function checkVisionRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const lim = await getLimiter('vision')
  if (!lim) return checkInMemory(ip, 20, stores.vision)
  try {
    const result = await lim.limit(ip)
    return { allowed: result.success, remaining: result.remaining }
  } catch (e) {
    console.warn('[rate-limit] Upstash unavailable, falling back to per-instance memory (vision):', e)
    return checkInMemory(ip, 20, stores.vision)
  }
}

// Auth/login/join-code routes: 10 requests per hour per IP — these guard credential
// guessing (student codes, school join codes, admin passwords), so the limit is tight.
export async function checkAuthRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const lim = await getLimiter('auth')
  if (!lim) return checkInMemory(ip, 10, stores.auth)
  try {
    const result = await lim.limit(ip)
    return { allowed: result.success, remaining: result.remaining }
  } catch (e) {
    console.warn('[rate-limit] Upstash unavailable, falling back to per-instance memory (auth):', e)
    return checkInMemory(ip, 10, stores.auth)
  }
}
