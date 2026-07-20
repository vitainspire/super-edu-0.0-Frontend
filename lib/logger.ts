export type LogStatus = 'ok' | 'error' | 'rate_limited' | 'unauthorized' | 'forbidden' | 'bad_request'

export function getClientIp(req: { headers: { get: (k: string) => string | null } }): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

export interface ApiLogEntry {
  route:      string
  ip:         string
  userId?:    string   // teacher or student id — omit for public/anonymous routes
  fromCache:  boolean
  durationMs: number
  status:     LogStatus
  error?:     string
}

/**
 * Structured JSON log — Vercel captures these in Function Logs automatically.
 * Each line is one JSON object so log drains (Axiom, Logtail, etc.) can parse them.
 */
export function apiLog(entry: ApiLogEntry): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...entry }))
}
