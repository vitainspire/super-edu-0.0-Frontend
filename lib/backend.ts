import { supabase } from './supabase'

// The new standalone backend (Python/FastAPI, or the earlier Express port) —
// a separate origin from this Next.js app, so it can't read our cookies.
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'

/**
 * Calls the new backend instead of a same-origin Next.js API route,
 * attaching the current Supabase session's access token as a bearer token.
 * Routes not yet ported to the new backend should keep using plain fetch()
 * against the existing Next.js /api/** routes.
 */
export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  // FormData must set its own Content-Type: the header carries the multipart
  // boundary, which only fetch can generate. Forcing application/json on it
  // makes the body unparseable server-side, so leave those alone.
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
  if (init.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${BACKEND_URL}${path}`, { ...init, headers })
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith(`${name}=`))
    ?.split('=')[1]
}

/**
 * Calls the backend as the student portal. Students never get a Supabase
 * session, so backendFetch's bearer-token path never fires for them — instead
 * the signed `edu-student-id` cookie value is forwarded as the `X-Student-Token`
 * header, which is what backend/app/deps.py's require_student_token expects
 * (a cookie can't cross origins to the separate backend, per its own comment).
 */
export async function backendFetchAsStudent(path: string, init: RequestInit = {}): Promise<Response> {
  const token = readCookie('edu-student-id')
  const headers = new Headers(init.headers)
  if (token) headers.set('X-Student-Token', token)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return fetch(`${BACKEND_URL}${path}`, { ...init, headers })
}
