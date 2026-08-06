/**
 * Server-side in-memory cache shared across requests hitting the same warm
 * serverless instance. On Vercel, warm instances typically live 5–15 min and
 * handle multiple sequential requests — this eliminates duplicate AI calls
 * within that window.
 *
 * Bounded two ways, not just by expiry: some cached values (AI-generated
 * illustrations) are base64 image data URLs that can run hundreds of KB each,
 * so a long TTL with only "clean up expired entries" eviction can grow the
 * heap unbounded well before entries naturally expire. Both a total entry
 * count and an approximate total byte size are capped, evicting the least
 * recently used entries (via Map's insertion order, refreshed on every get)
 * once either limit is hit.
 */

const MAX_ENTRIES     = 500
const MAX_TOTAL_BYTES = 25 * 1024 * 1024 // 25 MB — generous for a few hundred small AI responses, tight against a burst of cached images

interface CacheItem {
  value: unknown
  expiresAt: number
  size: number
}

function approxSize(value: unknown): number {
  try { return JSON.stringify(value)?.length ?? 0 } catch { return 0 }
}

class TTLCache {
  private store = new Map<string, CacheItem>()
  private totalBytes = 0

  get<T>(key: string): T | null {
    const item = this.store.get(key)
    if (!item) return null
    if (Date.now() > item.expiresAt) { this.delete(key); return null }
    // Refresh recency: delete + re-insert moves it to the end of Map iteration order.
    this.store.delete(key)
    this.store.set(key, item)
    return item.value as T
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    const existing = this.store.get(key)
    if (existing) this.totalBytes -= existing.size

    const size = approxSize(value)
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000, size })
    this.totalBytes += size

    if (this.store.size > MAX_ENTRIES || this.totalBytes > MAX_TOTAL_BYTES) this.evict()
  }

  private delete(key: string): void {
    const item = this.store.get(key)
    if (!item) return
    this.totalBytes -= item.size
    this.store.delete(key)
  }

  private evict(): void {
    const now = Date.now()
    for (const [k, v] of this.store) if (now > v.expiresAt) this.delete(k)

    // Still over a limit after clearing expired entries — drop the least
    // recently used ones (Map iterates oldest-inserted first) until under both caps.
    for (const k of this.store.keys()) {
      if (this.store.size <= MAX_ENTRIES && this.totalBytes <= MAX_TOTAL_BYTES) break
      this.delete(k)
    }
  }
}

// Module-level singleton — one instance per warm serverless function
export const serverCache = new TTLCache()

/** Build a stable string key from any serialisable values. */
export function ck(...parts: (string | number | boolean | null | undefined)[]): string {
  return parts.map(p => String(p ?? '')).join('|')
}

// In-flight deduplication: if two requests arrive for the same cache key while
// the first is still computing, the second awaits the same Promise instead of
// spawning a duplicate AI call.
const inFlight = new Map<string, Promise<unknown>>()

/** Wrap an async computation with the server cache. Returns the value and whether it was a cache hit. */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<{ value: T; fromCache: boolean }> {
  const hit = serverCache.get<T>(key)
  if (hit !== null) return { value: hit, fromCache: true }

  // Deduplicate concurrent requests with identical keys
  const existing = inFlight.get(key) as Promise<T> | undefined
  if (existing) return { value: await existing, fromCache: false }

  const promise = compute().then(value => {
    serverCache.set(key, value, ttlSeconds)
    inFlight.delete(key)
    return value
  }).catch(err => {
    inFlight.delete(key)
    throw err
  })

  inFlight.set(key, promise as Promise<unknown>)
  return { value: await promise, fromCache: false }
}
