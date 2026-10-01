import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Paths that are always public — no auth required
const PUBLIC_PREFIXES = [
  '/teacher/login',
  '/admin/login',
  '/student/login',
  '/scanner/login',
  // The page itself, not just its API route below — join-code auth never
  // creates a Supabase session, so without this, every fresh scanner visit
  // fell through to the generic "no session" branch and got redirected to
  // /teacher/login instead of ever reaching the code-entry form.
  '/scanner',
  '/scanner/connect',
  '/api/admin/login',
  '/api/admin/register',
  '/api/school/has-admin',
  '/api/student',
  '/favicon.ico',
  '/sw.js',
  '/workbox',
  '/icons',
  // Must be the full filename: isPublic() matches exact, '<p>/' or '<p>-', so a
  // bare '/manifest' never matched '/manifest.json' and every manifest fetch
  // fell through to the Supabase auth check below.
  '/manifest.json',
  '/manifest',
  // next-pwa also emits '/swe-worker-<hash>.js' alongside sw.js and workbox-*.
  '/swe-worker',
  '/screenshots',
  '/api/health',
  // Student-facing AI routes — protected by rate-limit, not Supabase session
  '/api/practice-quiz',
  '/api/adaptive-quiz',
  '/api/catchup-plan',
  '/api/flashcards',
  '/api/test-prep',
  '/api/test-study-guide',
  // Student-facing, but authenticated via verifyStudentCookie() inside the
  // route itself (edu-student-id cookie) rather than a Supabase session.
  '/api/personality-story',
  // Scanner portal routes — no Supabase session; authorization is via a signed
  // school-scoped token (see lib/scanner-auth.ts), not the Supabase session.
  // NOTE: '/api/scanner/profile' is intentionally NOT public — it's a separate,
  // Supabase-session-authenticated scanner-staff flow.
  '/api/scanner/connect',
  '/api/multi-grade-scan',
  '/api/scanner-save-score',
  '/api/scanner-upload',
  '/api/worksheet-marks',
  '/api/worksheet-save-score',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '-')
  )
}

// `auth.getUser()` is a network call, and it runs on nearly every request. When
// the Supabase project is unreachable (e.g. paused free-tier project, which
// answers with a Cloudflare 522 only after ~20s) an unbounded await turns every
// single navigation into a multi-second stall — and because several calls chain
// per page load, observed request times reached minutes.
//
// Bounding it fails *closed*: a timeout resolves to "no user", so the caller
// takes its existing unauthenticated branch (login redirect / 401). A slow
// backend can therefore cost a redirect, never a hang.
const AUTH_TIMEOUT_MS = 2500

// A real logged-in session hitting a merely-SLOW (not dead) Supabase call used
// to be treated as logged out on the very first attempt -- no retry existed
// here at all, unlike every other Supabase call in this app (see the
// backend's retry_supabase / deps.py's _get_user, which hit the identical
// connection drops and retry). Measured for real: a teacher's own session got
// a blanket 401 across every /api/teacher/* endpoint from exactly this path.
// Two attempts, each with its own bound, so the worst case is still a bounded
// stall (~2x AUTH_TIMEOUT_MS), never the unbounded hang the timeout above
// exists to prevent -- just one real second chance before failing closed.
const AUTH_ATTEMPTS = 2

type SupabaseClient = ReturnType<typeof createServerClient>

async function getUserOrNull(supabase: SupabaseClient) {
  for (let attempt = 1; attempt <= AUTH_ATTEMPTS; attempt++) {
    try {
      const result = await Promise.race([
        supabase.auth.getUser(),
        new Promise<null>(resolve => setTimeout(() => resolve(null), AUTH_TIMEOUT_MS)),
      ])
      if (!result) {
        console.warn(`[middleware] Supabase auth.getUser() exceeded ${AUTH_TIMEOUT_MS}ms (attempt ${attempt}/${AUTH_ATTEMPTS})`)
        continue
      }
      return result.data.user
    } catch (e) {
      console.warn(`[middleware] Supabase auth.getUser() failed (attempt ${attempt}/${AUTH_ATTEMPTS}):`, e)
    }
  }
  console.warn('[middleware] Supabase auth.getUser() exhausted all attempts — treating as unauthenticated')
  return null
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow public paths
  if (isPublic(pathname)) return NextResponse.next()

  // Student portal pages — separate cookie auth, no Supabase session needed here.
  // Trailing slash matters: '/students/[id]' (teacher-facing) must NOT match here.
  if (pathname === '/student' || pathname.startsWith('/student/')) {
    if (!req.cookies.has('edu-student-id')) {
      return NextResponse.redirect(new URL('/student/login', req.url))
    }
    return NextResponse.next()
  }

  // Root — the portal chooser. Only redirect away when a session actually
  // exists; unauthenticated visitors should see the chooser page itself.
  if (pathname === '/') {
    const role = req.cookies.get('edu-role')?.value
    if (role === 'admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', req.url))
    }

    const rootSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } }
    )
    const rootUser = await getUserOrNull(rootSupabase)
    if (rootUser) {
      return NextResponse.redirect(new URL(role === 'scanner' ? '/scanner/connect' : '/home', req.url))
    }
    return NextResponse.next()
  }

  // Build a Supabase client that can read/refresh the session from cookies.
  // `auth.getUser()` makes a network call to verify the token signature —
  // unlike manual base64 decode, this cannot be bypassed with a forged JWT.
  let response = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          response = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const user = await getUserOrNull(supabase)

  if (!user) {
    // API routes return JSON; page routes redirect to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/teacher/login', req.url))
  }

  // Scanner staff cannot access teacher or admin routes
  if (!pathname.startsWith('/scanner') && !pathname.startsWith('/admin') && !pathname.startsWith('/api/')) {
    const role = req.cookies.get('edu-role')?.value
    if (role === 'scanner') {
      return NextResponse.redirect(new URL('/scanner/connect', req.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|otf|css)$).*)',
  ],
}
