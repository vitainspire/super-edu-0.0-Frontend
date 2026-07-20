import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchSchoolAnnouncements, createAnnouncement, deleteAnnouncement } from '@/lib/admin-queries'
import { parseBody, AnnouncementSchema } from '@/lib/schemas'

async function auth(userId: string, schoolId: string) {
  const ac = createAdminClient()
  const admin = await fetchAdmin(userId, ac)
  if (!admin || admin.schoolId !== schoolId) return null
  return { admin, ac }
}

function sb() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}

export async function GET(_req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const announcements = await fetchSchoolAnnouncements(params.schoolId, ctx.ac)
    return NextResponse.json({ announcements })
  } catch (err) {
    console.error('[admin/announcements GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = parseBody(AnnouncementSchema, await req.json().catch(() => null))
    if (!parsed.ok) return parsed.response

    const announcement = {
      id: randomUUID(),
      schoolId: params.schoolId,
      adminId: ctx.admin.id,
      adminName: ctx.admin.name,
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category ?? 'general' as const,
      createdAt: new Date().toISOString(),
    }
    await createAnnouncement(announcement, ctx.ac)
    return NextResponse.json({ announcement }, { status: 201 })
  } catch (err) {
    console.error('[admin/announcements POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const { data: { user } } = await sb().auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await deleteAnnouncement(id, params.schoolId, ctx.ac)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/announcements DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
