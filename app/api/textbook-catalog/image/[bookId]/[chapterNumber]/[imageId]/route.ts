import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// GET /api/textbook-catalog/image/:bookId/:chapterNumber/:imageId
//   -> 302 to a freshly signed URL from the published-textbook service
//
// A stable address for a PUBLISHED-CATALOG illustration, so a saved prep sheet
// can keep one.
//
// The catalog hands out signed storage links that expire SIX HOURS after issue
// (measured from the token's own iat/exp claims). shared_prep_materials stores
// a generated lesson as jsonb and teachers reopen it weeks later, so a sheet
// holding one of those links shows a broken image by the same evening. The
// pipeline writes THIS path into the bullet instead (see
// prep_pipeline_bridge.figure_href) and the signature is minted per view.
//
// WHY THIS LIVES IN NEXT AND NOT THE FASTAPI BACKEND. The lesson renders it as
// <img src="/api/textbook-catalog/image/..."> — a relative src resolves against
// the FRONTEND origin, not NEXT_PUBLIC_BACKEND_URL. A backend-only route would
// 404 for every reader. Same reason /api/textbook-image/[imageId] stayed here.
//
// Distinct from that route, which serves this app's OWN ingested scans
// (textbook_images rows, school-licensed, uuid keys). These are the shared
// published catalog every school reads, keyed by the anchor id the pipeline
// writes into a sheet (img_c5ch2_01) — unique only within its chapter, hence
// book and chapter in the path. Not school-scoped, deliberately: a generated
// chapter is cached once and served to every school, so a URL baked into a
// cached lesson cannot carry a school id.

const CATALOG_API =
  process.env.PUBLISHED_TEXTBOOK_API || 'https://eduteach-textbook-api.onrender.com'

export async function GET(
  _request: Request,
  { params }: { params: { bookId: string; chapterNumber: string; imageId: string } },
) {
  try {
    const cookieStore = cookies()
    const ssr = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: cs => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
        },
      },
    )
    // Signed in is the bar: textbook scans are licensed material, but the
    // published catalog is shared across every school, so there is no school
    // to check the reader against.
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { bookId, chapterNumber, imageId } = params
    // The service sleeps on a free tier; a cold start runs 30-60s.
    const res = await fetch(
      `${CATALOG_API}/published/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(chapterNumber)}`,
      { signal: AbortSignal.timeout(90_000), cache: 'no-store' },
    )
    if (!res.ok) {
      return NextResponse.json({ error: 'Textbook service unavailable' }, { status: 502 })
    }
    const chapter = await res.json()
    const image = (chapter?.images || []).find((i: { image_id?: string }) => i.image_id === imageId)
    if (!image?.url) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Redirect rather than proxy the bytes, and cache for well under the
    // six-hour signature so a reader never follows an expired one.
    return NextResponse.redirect(image.url, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=1800' },
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
