import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchSchool, fetchSchoolTeachers, removeTeacherFromSchool, updateTeacherWorkloadLimits, updateTeacherSubjects } from '@/lib/admin-queries'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genCode(len = 6) {
  return Array.from({ length: len }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

async function auth(userId: string, schoolId: string) {
  const ac = createAdminClient()
  const admin = await fetchAdmin(userId, ac)
  if (!admin || admin.schoolId !== schoolId) return null
  return { admin, ac }
}

export async function GET(_req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const teachers = await fetchSchoolTeachers(params.schoolId, ctx.ac)
    return NextResponse.json({ teachers })
  } catch (err) {
    console.error('[admin/teachers GET] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name, email, password, subject, subjects } = await req.json()
    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      return NextResponse.json({ error: 'Name, email and password (min 6 chars) are required.' }, { status: 400 })
    }

    // Accept either the new subjects[] list or the legacy single `subject`
    // field, so older callers of this route keep working.
    const subjectList: string[] = Array.isArray(subjects) && subjects.length > 0
      ? subjects.map((s: string) => s.trim()).filter(Boolean)
      : (subject?.trim() ? [subject.trim()] : [])

    // Create Supabase auth user — email_confirm: true skips the confirmation email
    const { data: authData, error: authErr } = await ctx.ac.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { name: name.trim(), role: 'teacher' },
    })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

    const teacherId = authData.user.id
    const school = await fetchSchool(params.schoolId, ctx.ac)

    // Insert teacher row — school_id is set directly, no join code needed
    const { error: dbErr } = await ctx.ac.from('teachers').insert({
      id: teacherId,
      user_id: teacherId,
      name: name.trim(),
      school_name: school?.name ?? '',
      school_id: params.schoolId,
      subject: subjectList[0] ?? '',
      subjects: subjectList,
      grade: '',
      phone: '',
      language_preference: 'english',
      teacher_code: genCode(),
    })

    if (dbErr) {
      // Roll back the auth user if DB insert fails
      await ctx.ac.auth.admin.deleteUser(teacherId)
      return NextResponse.json({ error: dbErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/teachers POST] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Sets a teacher's optional workload caps (used by substitute assignment to
// avoid overloading them). Pass null for either field to clear that cap.
export async function PATCH(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { teacherId, maxPeriodsPerDay, maxPeriodsPerWeek, subjects } = await req.json()
    if (!teacherId) return NextResponse.json({ error: 'teacherId is required.' }, { status: 400 })

    if (Array.isArray(subjects)) {
      await updateTeacherSubjects(teacherId, subjects.map((s: string) => s.trim()).filter(Boolean), ctx.ac)
    }

    if (maxPeriodsPerDay !== undefined || maxPeriodsPerWeek !== undefined) {
      await updateTeacherWorkloadLimits(
        teacherId,
        maxPeriodsPerDay === '' || maxPeriodsPerDay == null ? null : Number(maxPeriodsPerDay),
        maxPeriodsPerWeek === '' || maxPeriodsPerWeek == null ? null : Number(maxPeriodsPerWeek),
        ctx.ac
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/teachers PATCH] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: { schoolId: string } }) {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ctx = await auth(user.id, params.schoolId)
    if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { teacherId } = await req.json()
    await removeTeacherFromSchool(teacherId, ctx.ac)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/teachers DELETE] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
