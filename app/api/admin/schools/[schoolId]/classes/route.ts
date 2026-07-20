import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchSchool, fetchSchoolClasses, adminCreateClass, adminDeleteClass } from '@/lib/admin-queries'
import { randomUUID } from 'crypto'

async function auth(userId: string, schoolId: string) {
  const ac = createAdminClient()
  const admin = await fetchAdmin(userId, ac)
  if (!admin || admin.schoolId !== schoolId) return null
  return { admin, ac }
}

function getSupabase(cookieStore: ReturnType<typeof cookies>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}

export async function GET(_req: Request, { params }: { params: { schoolId: string } }) {
  const cookieStore = cookies()
  const { data: { user } } = await getSupabase(cookieStore).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await auth(user.id, params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classes = await fetchSchoolClasses(params.schoolId, ctx.ac)
  return NextResponse.json({ classes })
}

export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  const cookieStore = cookies()
  const { data: { user } } = await getSupabase(cookieStore).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await auth(user.id, params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, grade, section, academicYear } = await req.json()
  if (!name || !grade || !section) return NextResponse.json({ error: 'name, grade, section required' }, { status: 400 })

  const { data: dupe } = await ctx.ac
    .from('classes')
    .select('id')
    .eq('school_id', params.schoolId)
    .eq('grade', grade)
    .ilike('section', section)
    .maybeSingle()
  if (dupe) {
    return NextResponse.json(
      { error: `Grade ${grade} Section ${section} already exists`, code: 'duplicate' },
      { status: 409 },
    )
  }

  const school = await fetchSchool(params.schoolId, ctx.ac)
  const classCode = Math.random().toString(36).substring(2, 8).toUpperCase()
  const now = new Date().toISOString()
  const newClass = {
    id: randomUUID(),
    teacherId: ctx.admin.id,
    schoolName: school?.name ?? '',
    schoolId: params.schoolId,
    name,
    grade,
    section,
    academicYear: academicYear ?? new Date().getFullYear().toString(),
    createdAt: now,
    classCode,
  }

  try {
    await adminCreateClass(newClass, ctx.ac)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
  return NextResponse.json({ class: newClass })
}

export async function DELETE(req: Request, { params }: { params: { schoolId: string } }) {
  const cookieStore = cookies()
  const { data: { user } } = await getSupabase(cookieStore).auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await auth(user.id, params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { classId } = await req.json()
  await adminDeleteClass(classId, ctx.ac)
  return NextResponse.json({ ok: true })
}
