import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'

// GET /api/textbook-image/:imageId  ->  302 to a freshly signed storage URL
//
// A stable address for a textbook illustration, so a prep sheet can keep one.
//
// The bucket is private and its signed URLs last an hour, which is right for a
// tutor request and useless for a saved lesson: prep_materials stores the
// generated lesson as jsonb and teachers reopen it weeks later, by which time a
// signed URL is a broken image. Storing this path instead means the link never
// rots, and the signature is minted per view — so access is checked at view
// time rather than frozen at generation time.
//
// :imageId is textbook_images.id (a uuid), not the pipeline's img_c5ch3_04
// anchor: the anchor is only unique within its chapter.

const SIGNED_URL_TTL_SECONDS = 60 * 60
const BUCKET = 'textbook-assets'

export async function GET(
  _request: Request,
  { params }: { params: { imageId: string } },
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
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    const { data: image } = await admin
      .from('textbook_images')
      .select('storage_path, school_id')
      .eq('id', params.imageId)
      .maybeSingle()
    if (!image) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Textbook scans are licensed material, so the viewer has to belong to the
    // school that ingested them — being signed in is not enough.
    const { data: teacher } = await admin
      .from('teachers')
      .select('school_id')
      .eq('user_id', user.id)
      .maybeSingle()
    let viewerSchool: string | undefined = teacher?.school_id ?? undefined
    if (!viewerSchool) {
      const { data: adminRow } = await admin
        .from('admins')
        .select('school_id')
        .eq('user_id', user.id)
        .maybeSingle()
      viewerSchool = adminRow?.school_id ?? undefined
    }

    if (!viewerSchool || viewerSchool !== image.school_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(image.storage_path, SIGNED_URL_TTL_SECONDS)
    if (!signed?.signedUrl) {
      return NextResponse.json({ error: 'Could not sign the image' }, { status: 502 })
    }

    // Redirect rather than proxy the bytes: storage serves them closer to the
    // reader, and this route stays a cheap lookup. Cached for well under the
    // signature's life, so a reader never follows an expired one.
    return NextResponse.redirect(signed.signedUrl, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=1800' },
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
